import { randomInt } from "node:crypto";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { isGameId, ONLINE_GAMES } from "@salone/games/online/games";
import { CODE_LETTERS, ROOM_CODE, type RoomView } from "@salone/games/online/protocol";
import { CONFIG, type Config } from "./config";
import { MODELS, type Models, type RoomDoc, type SeatDoc } from "./database";

// A request the server refuses, with a message the player can read.
export class RoomError extends Error {}

export type GuestRef = { guestId: string; name: string };

// A room as the server holds it while it is in use: the saved room plus each guest's open connections (a guest may
// have the room open on more than one tab or device), a queue so its changes happen one at a time, and the timer
// for a computer player's next move.
type LiveRoom = RoomDoc & { connections: Map<string, Set<string>>; queue: Promise<unknown>; cpuTimer?: NodeJS.Timeout };

const emptySeat = (): SeatDoc => ({ guestId: null, name: "", cpu: false, level: "normal" });

// Rooms: created by a host, joined with a code, played once every seat is filled. Every change is checked with the
// game's own rules, saved to MongoDB and sent to everyone in the room.
//
// The server keeps rooms in use in memory and assumes it is the only server; running several would need the
// rooms shared between them (for example through the Socket.IO MongoDB adapter).
@Injectable()
export class RoomsService implements OnApplicationShutdown {
  private readonly live = new Map<string, LiveRoom>();
  private readonly loading = new Map<string, Promise<LiveRoom>>();
  private readonly listeners: ((view: RoomView) => void)[] = [];

  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(@Inject(MODELS) private readonly models: Models, @Inject(CONFIG) private readonly config: Config) {}

  // Called with the room's new state after every change.
  onChange(listener: (view: RoomView) => void) { this.listeners.push(listener); }

  view(room: LiveRoom): RoomView {
    return {
      code: room._id,
      game: room.game,
      hostId: room.hostId,
      seats: room.seats.map((s) => ({ ...s, connected: s.cpu || (!!s.guestId && !!room.connections.get(s.guestId)?.size) })),
      status: room.status,
      match: room.match,
      version: room.version,
    };
  }

  async create(guest: GuestRef, game: unknown, connection: string): Promise<RoomView> {
    if (!isGameId(game)) throw new RoomError("That game cannot be played online yet.");
    const code = await this.freeCode();
    const now = new Date();
    const seats = Array.from({ length: ONLINE_GAMES[game].seats }, emptySeat);
    seats[0] = { guestId: guest.guestId, name: guest.name, cpu: false, level: "normal" };
    const room: LiveRoom = {
      _id: code, game, hostId: guest.guestId, seats, status: "lobby", match: null, version: 0,
      createdAt: now, updatedAt: now, expiresAt: now, connections: new Map([[guest.guestId, new Set([connection])]]), queue: Promise.resolve(),
    };
    this.live.set(code, room);
    await this.save(room);
    return this.view(room);
  }

  // Takes the guest to their seat: the one they already have, or the first free seat while the room is in its lobby.
  join(guest: GuestRef, code: unknown, connection: string): Promise<RoomView> {
    return this.run(code, async (room) => {
      let seat = room.seats.findIndex((s) => s.guestId === guest.guestId);
      if (seat < 0) {
        if (room.status !== "lobby") throw new RoomError("That game has already started.");
        seat = room.seats.findIndex((s) => !s.guestId && !s.cpu);
        if (seat < 0) throw new RoomError("That room is full.");
      }
      room.seats[seat] = { ...room.seats[seat], guestId: guest.guestId, name: guest.name };
      room.connections.set(guest.guestId, (room.connections.get(guest.guestId) ?? new Set()).add(connection));
      await this.save(room);
      return this.view(room);
    });
  }

  // A guest leaving on purpose. In the lobby their seat is freed; during a game a computer player takes it over so
  // the others can play on. The host's role passes to another player, and a room with nobody left is closed.
  leave(guest: GuestRef, code: unknown): Promise<void> {
    return this.run(code, async (room) => {
      const seat = room.seats.findIndex((s) => s.guestId === guest.guestId);
      room.connections.delete(guest.guestId);
      if (seat >= 0) {
        room.seats[seat] = room.status === "lobby" ? emptySeat() : { guestId: null, name: `${room.seats[seat].name} (CPU)`, cpu: true, level: "normal" };
      }
      const humans = room.seats.filter((s) => s.guestId);
      if (!humans.length) { await this.close(room); return; }
      if (room.hostId === guest.guestId) room.hostId = humans[0].guestId!;
      await this.save(room);
      this.scheduleCpu(room);
    });
  }

  // One of a guest's connections closed. They keep their seat and can come back; once none is left the others see
  // them as away.
  disconnected(guestId: string, code: string, connection: string): Promise<void> {
    return this.run(code, (room) => {
      const open = room.connections.get(guestId);
      open?.delete(connection);
      if (!open?.size) room.connections.delete(guestId);
      this.emit(room);
    }).catch(() => undefined);
  }

  addCpu(guest: GuestRef, code: unknown, seat: unknown, level: unknown): Promise<RoomView> {
    return this.run(code, async (room) => {
      this.hostInLobby(room, guest);
      const index = this.seatIndex(room, seat);
      if (room.seats[index].guestId || room.seats[index].cpu) throw new RoomError("That seat is taken.");
      const levels = ONLINE_GAMES[room.game].levels;
      const chosen = typeof level === "string" && level in levels ? level : "normal";
      room.seats[index] = { guestId: null, name: `Computer (${levels[chosen].label})`, cpu: true, level: chosen };
      await this.save(room);
      return this.view(room);
    });
  }

  removeCpu(guest: GuestRef, code: unknown, seat: unknown): Promise<RoomView> {
    return this.run(code, async (room) => {
      this.hostInLobby(room, guest);
      const index = this.seatIndex(room, seat);
      if (!room.seats[index].cpu) throw new RoomError("There is no computer player in that seat.");
      room.seats[index] = emptySeat();
      await this.save(room);
      return this.view(room);
    });
  }

  start(guest: GuestRef, code: unknown): Promise<RoomView> {
    return this.run(code, async (room) => {
      this.hostInLobby(room, guest);
      if (room.seats.some((s) => !s.guestId && !s.cpu)) throw new RoomError("Fill every seat (with a friend or a computer player) before starting.");
      room.status = "playing";
      room.match = ONLINE_GAMES[room.game].start();
      await this.save(room);
      this.scheduleCpu(room);
      return this.view(room);
    });
  }

  // A move or other game action from a guest, checked by the game's rules.
  act(guest: GuestRef, code: unknown, action: unknown): Promise<RoomView> {
    return this.run(code, async (room) => {
      if (room.status !== "playing") throw new RoomError("The game has not started yet.");
      const seat = room.seats.findIndex((s) => s.guestId === guest.guestId);
      if (seat < 0) throw new RoomError("You do not have a seat in this game.");
      await this.apply(room, seat, action);
      return this.view(room);
    });
  }

  onApplicationShutdown() {
    for (const room of this.live.values()) clearTimeout(room.cpuTimer);
  }

  // ---- Inside ----

  private async apply(room: LiveRoom, seat: number, action: unknown) {
    const game = ONLINE_GAMES[room.game];
    const wasOver = game.roundOver(room.match);
    const next = game.act(room.match, seat, action);
    if (typeof next === "string") throw new RoomError(next);
    room.match = next;
    await this.save(room);
    if (!wasOver && game.roundOver(next)) {
      await this.models.matches.create({ room: room._id, game: room.game, seats: room.seats, match: next, finishedAt: new Date() });
    }
    this.scheduleCpu(room);
  }

  // When it is a computer player's turn, it moves after a short pause.
  private scheduleCpu(room: LiveRoom) {
    clearTimeout(room.cpuTimer);
    if (room.status !== "playing") return;
    const game = ONLINE_GAMES[room.game];
    const seat = game.turn(room.match);
    if (seat === null || !room.seats[seat]?.cpu) return;
    room.cpuTimer = setTimeout(() => {
      void this.run(room._id, async (current) => {
        if (current.status !== "playing" || game.turn(current.match) !== seat || !current.seats[seat].cpu) return;
        const action = game.cpuAction(current.match, seat, current.seats[seat].level);
        if (action !== null) await this.apply(current, seat, action);
      }).catch((error) => console.error(`Computer move failed in room ${room._id}:`, error));
    }, this.config.cpuDelayMs);
  }

  private hostInLobby(room: LiveRoom, guest: GuestRef) {
    if (room.hostId !== guest.guestId) throw new RoomError("Only the host can do that.");
    if (room.status !== "lobby") throw new RoomError("The game has already started.");
  }

  private seatIndex(room: LiveRoom, seat: unknown) {
    if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) >= room.seats.length) throw new RoomError("There is no such seat.");
    return seat as number;
  }

  // Runs a change to a room once the changes before it have finished, so two players acting at the same moment
  // cannot overwrite each other.
  private async run<T>(code: unknown, change: (room: LiveRoom) => Promise<T> | T): Promise<T> {
    const room = await this.load(code);
    const result = room.queue.then(() => change(room));
    room.queue = result.catch(() => undefined);
    return result;
  }

  private async load(code: unknown): Promise<LiveRoom> {
    const key = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!ROOM_CODE.test(key)) throw new RoomError("Room codes are four letters.");
    const live = this.live.get(key);
    if (live) return live;
    let loading = this.loading.get(key);
    if (!loading) {
      loading = (async () => {
        const saved = await this.models.rooms.findById(key).lean();
        if (!saved) throw new RoomError("There is no room with that code. Check it, or ask the host for a new one.");
        const room: LiveRoom = { ...saved, connections: new Map(), queue: Promise.resolve() };
        this.live.set(key, room);
        this.scheduleCpu(room);
        return room;
      })().finally(() => this.loading.delete(key));
      this.loading.set(key, loading);
    }
    return loading;
  }

  private async save(room: LiveRoom) {
    const now = new Date();
    room.version += 1;
    room.updatedAt = now;
    room.expiresAt = new Date(now.getTime() + this.config.roomHours * 3600_000);
    const doc: RoomDoc = {
      _id: room._id, game: room.game, hostId: room.hostId, seats: room.seats, status: room.status, match: room.match,
      version: room.version, createdAt: room.createdAt, updatedAt: room.updatedAt, expiresAt: room.expiresAt,
    };
    await this.models.rooms.replaceOne({ _id: room._id }, doc, { upsert: true });
    this.emit(room);
  }

  private async close(room: LiveRoom) {
    clearTimeout(room.cpuTimer);
    this.live.delete(room._id);
    await this.models.rooms.deleteOne({ _id: room._id });
  }

  private emit(room: LiveRoom) {
    const view = this.view(room);
    for (const listener of this.listeners) listener(view);
  }

  private async freeCode(): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join("");
      if (!this.live.has(code) && !(await this.models.rooms.exists({ _id: code }))) return code;
    }
    throw new RoomError("Could not find a free room code. Try again.");
  }
}
