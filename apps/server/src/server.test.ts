import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Match } from "@salone/games/tintanto/match";
import { chooseMove } from "@salone/games/tintanto/rules";
import { EVENTS, type Guest, type Reply, type RoomView } from "@salone/games/online/protocol";
import type { LudoOptions } from "@salone/games/online/games";
import type { LudoMatch } from "@salone/games/ludo/match";
import type { DraftMatch } from "@salone/games/draft/match";
import { plays } from "@salone/games/ludo/rules";
import { AppModule } from "./app.module";
import type { Config } from "./config";

// Runs the real game server against a throwaway MongoDB (never the one in .env) and plays through it as guests
// over Socket.IO, the way the screens do.

let mongo: MongoMemoryServer;
let app: INestApplication;
let url = "";
let config: Config;
const sockets: Socket[] = [];

async function startServer() {
  app = await NestFactory.create(AppModule.register(config), { logger: false });
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };
  url = `http://127.0.0.1:${address.port}`;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  config = { port: 0, mongoUri: mongo.getUri(), dbName: "salone_test", roomHours: 1, cpuDelayMs: 30, awaySeconds: 30, timeScale: 0.01 };
  await startServer();
}, 180_000);

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await app?.close();
  await mongo?.stop();
});

// A screen: connects and says hello as a guest (optionally the same guest as before).
async function connect(name: string, saved?: Guest) {
  const socket = io(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  sockets.push(socket);
  const updates: RoomView[] = [];
  socket.on(EVENTS.update, (view: RoomView) => updates.push(view));
  const guest = await call<Guest>(socket, EVENTS.hello, { name, guestId: saved?.guestId, token: saved?.token });
  return { socket, guest, updates };
}

async function call<T>(socket: Socket, event: string, body?: unknown): Promise<T> {
  const answer: Reply<T> = await socket.timeout(5000).emitWithAck(event, body);
  if (!answer.ok) throw new Error(answer.error);
  return answer.value;
}

async function refused(socket: Socket, event: string, body?: unknown): Promise<string> {
  const answer: Reply<unknown> = await socket.timeout(5000).emitWithAck(event, body);
  expect(answer.ok).toBe(false);
  return answer.ok ? "" : answer.error;
}

// Waits until a screen has received an update that passes `test` (a Tin Tan To room unless `V` says otherwise).
async function until<V = RoomView<Match>>(updates: RoomView[], test: (view: V) => boolean, ms = 5000): Promise<V> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = [...updates].reverse().map((view) => view as V).find(test);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Timed out waiting for a room update");
}

const savedRoom = (code: string) => mongoose.createConnection(mongo.getUri(), { dbName: "salone_test" }).asPromise().then(async (c) => {
  const doc = await c.collection("rooms").findOne({ _id: code as never });
  const finished = await c.collection("matches").countDocuments({ room: code });
  await c.close();
  return { doc, finished };
});

describe("guests", () => {
  it("gives a new guest an id and token, and recognises them when they come back", async () => {
    const first = await connect("  Aminata  ");
    expect(first.guest.name).toBe("Aminata");
    expect(first.guest.token.length).toBeGreaterThan(20);
    const again = await connect("Aminata K", first.guest);
    expect(again.guest.guestId).toBe(first.guest.guestId);
    expect(again.guest.name).toBe("Aminata K");
    const impostor = await connect("Someone", { ...first.guest, token: "wrong-token-wrong-token-wrong" });
    expect(impostor.guest.guestId).not.toBe(first.guest.guestId);
  });

  it("refuses room requests before hello", async () => {
    const socket = io(url, { transports: ["websocket"], forceNew: true, reconnection: false });
    sockets.push(socket);
    expect(await refused(socket, EVENTS.create, { game: "tintanto" })).toMatch(/hello/);
  });
});

describe("rooms", () => {
  it("lets a host create a room and a friend join with the code, then plays moves checked by the rules", async () => {
    const host = await connect("Host");
    const friend = await connect("Friend");
    const room = await call<RoomView<Match>>(host.socket, EVENTS.create, { game: "tintanto" });
    expect(room.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(room.seats[0]).toMatchObject({ guestId: host.guest.guestId, name: "Host", connected: true });
    expect(await refused(friend.socket, EVENTS.join, { code: "ZZZZ" })).toMatch(/no room/);

    const joined = await call<RoomView<Match>>(friend.socket, EVENTS.join, { code: room.code.toLowerCase() });
    expect(joined.seats[1]).toMatchObject({ guestId: friend.guest.guestId, connected: true });
    await until(host.updates, (v) => v.seats[1].guestId === friend.guest.guestId);
    expect(await refused(friend.socket, EVENTS.start)).toMatch(/host/);

    const started = await call<RoomView<Match>>(host.socket, EVENTS.start);
    expect(started.status).toBe("playing");
    expect(await refused(friend.socket, EVENTS.act, { action: { type: "move", move: { from: 0, to: 3 } } })).toMatch(/not your turn/);
    expect(await refused(host.socket, EVENTS.act, { action: { type: "move", move: { from: 6, to: 7 } } })).toMatch(/not allowed/);

    await call(host.socket, EVENTS.act, { action: { type: "move", move: { from: 7, to: 4 } } });
    const seen = await until(friend.updates, (v) => v.match?.last?.to === 4);
    expect(seen.match?.toMove).toBe("O");
    await call(friend.socket, EVENTS.act, { action: { type: "move", move: { from: 0, to: 3 } } });

    const { doc } = await savedRoom(room.code);
    expect(doc?.status).toBe("playing");
    expect((doc?.match as Match).moves).toBe(2);
    expect(doc?.expiresAt).toBeInstanceOf(Date);
  });

  it("fills a seat with a computer player that moves on its own, and records the finished round", async () => {
    const host = await connect("Solo");
    const room = await call<RoomView<Match>>(host.socket, EVENTS.create, { game: "tintanto" });
    expect(await refused(host.socket, EVENTS.start)).toMatch(/Fill every seat/);
    const withCpu = await call<RoomView<Match>>(host.socket, EVENTS.addCpu, { seat: 1, level: "easy" });
    expect(withCpu.seats[1]).toMatchObject({ cpu: true, level: "easy", connected: true });
    let view = await call<RoomView<Match>>(host.socket, EVENTS.start);
    for (let i = 0; i < 80 && !view.match?.result; i++) {
      if (view.match!.toMove === "X") view = await call<RoomView<Match>>(host.socket, EVENTS.act, { action: { type: "move", move: chooseMove(view.match!.board, "X", "hard") } });
      else view = await until(host.updates, (v) => v.version > view.version);
    }
    expect(view.match?.result).not.toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    expect((await savedRoom(room.code)).finished).toBe(1);
    const next = await call<RoomView<Match>>(host.socket, EVENTS.act, { action: { type: "next" } });
    expect(next.match?.result).toBeNull();
    expect(next.match?.starter).toBe("O");
  });

  it("keeps a guest's seat when they reconnect, and hands it to a computer player when they leave a game", async () => {
    const host = await connect("Host");
    const friend = await connect("Friend");
    const room = await call<RoomView<Match>>(host.socket, EVENTS.create, { game: "tintanto" });
    await call(friend.socket, EVENTS.join, { code: room.code });
    await call(host.socket, EVENTS.start);

    friend.socket.disconnect();
    await until(host.updates, (v) => v.seats[1].guestId === friend.guest.guestId && !v.seats[1].connected);
    const back = await connect("Friend", friend.guest);
    const rejoined = await call<RoomView<Match>>(back.socket, EVENTS.join, { code: room.code });
    expect(rejoined.seats[1]).toMatchObject({ guestId: friend.guest.guestId, connected: true });

    const stranger = await connect("Late");
    expect(await refused(stranger.socket, EVENTS.join, { code: room.code })).toMatch(/already started/);

    await call(back.socket, EVENTS.leave);
    const after = await until(host.updates, (v) => v.seats[1].cpu);
    expect(after.seats[1].name).toBe("Friend (CPU)");
  });

  it("carries on a room after the server restarts, from what is saved in MongoDB", async () => {
    const host = await connect("Host");
    const room = await call<RoomView<Match>>(host.socket, EVENTS.create, { game: "tintanto" });
    await call(host.socket, EVENTS.addCpu, { seat: 1, level: "hard" });
    await call(host.socket, EVENTS.start);
    await call(host.socket, EVENTS.act, { action: { type: "move", move: { from: 7, to: 4 } } });
    // Wait for the computer's reply, so the restart comes between turns.
    await until(host.updates, (v) => v.match?.moves === 2);

    await app.close();
    await startServer();
    const back = await connect("Host", host.guest);
    const view = await call<RoomView<Match>>(back.socket, EVENTS.join, { code: room.code });
    expect(view.status).toBe("playing");
    expect(view.match?.moves).toBe(2);
    expect(view.match?.toMove).toBe("X");
    // The computer player carries on after the restart too.
    const move = chooseMove(view.match!.board, "X", "hard")!;
    await call(back.socket, EVENTS.act, { action: { type: "move", move } });
    await until(back.updates, (v) => v.match?.moves === 4 || !!v.match?.result);
  });
});

describe("Ludo rooms", () => {
  type LudoView = RoomView<LudoMatch, LudoOptions>;

  it("lets the host choose the players and house rules, resizing the seats but never removing a player", async () => {
    const host = await connect("Host");
    const friend = await connect("Friend");
    const room = await call<LudoView>(host.socket, EVENTS.create, { game: "ludo", options: { players: 2, rules: { taxi: true } } });
    expect(room.seats).toHaveLength(2);
    expect(room.options.rules.taxi).toBe(true);
    const four = await call<LudoView>(host.socket, EVENTS.options, { options: { players: 4 } });
    expect(four.seats).toHaveLength(4);
    expect(four.options.rules.taxi).toBe(true);
    await call(host.socket, EVENTS.addCpu, { seat: 1, level: "hard" });
    const joined = await call<LudoView>(friend.socket, EVENTS.join, { code: room.code });
    expect(joined.seats.findIndex((s) => s.guestId === friend.guest.guestId)).toBe(2);
    expect(await refused(host.socket, EVENTS.options, { options: { players: 2 } })).toMatch(/Friend is in seat 3/);
    expect(await refused(friend.socket, EVENTS.options, { options: { players: 3 } })).toMatch(/host/);
    const three = await call<LudoView>(host.socket, EVENTS.options, { options: { players: 3, rules: { poison: true } } });
    expect(three.seats.map((s) => s.cpu || !!s.guestId)).toEqual([true, true, true]);
    expect(three.options.rules).toMatchObject({ taxi: true, poison: true });
  });

  it("rolls the dice on the server, refuses out-of-turn play, and lets a computer seat take its turns", async () => {
    const host = await connect("Host");
    const room = await call<LudoView>(host.socket, EVENTS.create, { game: "ludo", options: { players: 2 } });
    await call(host.socket, EVENTS.addCpu, { seat: 1, level: "normal" });
    let view = await call<LudoView>(host.socket, EVENTS.start);
    expect(view.match?.game.seats).toEqual(["red", "blue"]);
    expect(await refused(host.socket, EVENTS.act, { action: { type: "move", play: { token: 0, die: 0 } } })).toMatch(/Roll the dice first/);
    // Keep taking red's turns until blue (the computer) has played some of its own.
    for (let i = 0; i < 60 && !(view.match!.events.some((e) => e.colour === "blue" && e.kind === "rolled")); i++) {
      if (view.match!.game.turn === 0) {
        const options = plays(view.match!.game);
        view = await call<LudoView>(host.socket, EVENTS.act, { action: view.match!.game.dice.length ? { type: "move", play: options[0] } : { type: "roll" } });
      } else view = await until<LudoView>(host.updates, (v) => v.version > view.version);
    }
    const blue = view.match!.events.find((e) => e.colour === "blue" && e.kind === "rolled");
    expect(blue).toBeDefined();
    expect((await savedRoom(room.code)).doc?.options).toMatchObject({ players: 2 });
  });

  it("plays for a player whose turn timer runs out", async () => {
    const host = await connect("Host");
    await call(host.socket, EVENTS.create, { game: "ludo", options: { players: 2, rules: { timer: true } } });
    await call(host.socket, EVENTS.addCpu, { seat: 1 });
    const started = await call<LudoView>(host.socket, EVENTS.start);
    expect(started.timer).toMatchObject({ seat: 0, reason: "timeout" });
    expect(started.timer!.endsIn).toBeGreaterThan(0);
    // Turn limits are scaled down in these tests, so red's 30 seconds pass in a moment.
    const played = await until<LudoView>(host.updates, (v) => !!v.match?.events.some((e) => e.kind === "stood-in" && e.colour === "red" && e.reason === "timeout"));
    expect(played).toBeDefined();
  });

  it("plays on for a player who is away on their turn while others are still there", async () => {
    const host = await connect("Host");
    const friend = await connect("Friend");
    const room = await call<LudoView>(host.socket, EVENTS.create, { game: "ludo", options: { players: 2 } });
    await call(friend.socket, EVENTS.join, { code: room.code });
    await call(host.socket, EVENTS.start);
    host.socket.disconnect();
    const played = await until<LudoView>(friend.updates, (v) => !!v.match?.events.some((e) => e.kind === "stood-in" && e.colour === "red" && e.reason === "away"));
    expect(played).toBeDefined();
  });
});

describe("party rooms", () => {
  it("keeps every seat for the phones, while the shared screen hosts without one", async () => {
    const table = await connect("Table");
    const phone = await connect("Fatmata");
    const room = await call<RoomView<Match>>(table.socket, EVENTS.create, { game: "tintanto", party: true });
    expect(room.party).toBe(true);
    expect(room.seats.every((s) => !s.guestId)).toBe(true);
    const joined = await call<RoomView<Match>>(phone.socket, EVENTS.join, { code: room.code });
    expect(joined.seats[0]).toMatchObject({ guestId: phone.guest.guestId, name: "Fatmata" });

    // The shared screen reconnects (say the TV slept) and comes back as host, still without a seat.
    table.socket.disconnect();
    const again = await connect("Table", table.guest);
    const back = await call<RoomView<Match>>(again.socket, EVENTS.join, { code: room.code });
    expect(back.hostId).toBe(table.guest.guestId);
    expect(back.seats.some((s) => s.guestId === table.guest.guestId)).toBe(false);

    await call(again.socket, EVENTS.addCpu, { seat: 1, level: "easy" });
    await call(again.socket, EVENTS.start);
    expect(await refused(again.socket, EVENTS.act, { action: { type: "move", move: { from: 7, to: 4 } } })).toMatch(/not your turn/);
  });

  it("lets the shared screen start the next round, and closes the room for everyone when it leaves", async () => {
    const table = await connect("Table");
    const phone = await connect("Ibrahim");
    const room = await call<RoomView<Match>>(table.socket, EVENTS.create, { game: "tintanto", party: true });
    await call(phone.socket, EVENTS.join, { code: room.code });
    await call(table.socket, EVENTS.addCpu, { seat: 1, level: "easy" });
    let view = await call<RoomView<Match>>(table.socket, EVENTS.start);
    for (let i = 0; i < 80 && !view.match?.result; i++) {
      if (view.match!.toMove === "X") view = await call<RoomView<Match>>(phone.socket, EVENTS.act, { action: { type: "move", move: chooseMove(view.match!.board, "X", "hard") } });
      else view = await until(phone.updates, (v) => v.version > view.version);
    }
    const next = await call<RoomView<Match>>(table.socket, EVENTS.act, { action: { type: "next" } });
    expect(next.match?.result).toBeNull();

    await call(table.socket, EVENTS.leave);
    await until(phone.updates, (v) => v.status === "closed");
    expect((await savedRoom(room.code)).doc).toBeNull();
  });

  it("tells a screen on this computer its local network addresses", async () => {
    const answer = await (await fetch(`${url}/network`)).json() as { addresses: string[] };
    expect(Array.isArray(answer.addresses)).toBe(true);
    for (const address of answer.addresses) expect(address).toMatch(/^(10|172|192)\./);
  });
});

describe("Draft rooms", () => {
  it("plays Draft online: Black moves first, turns are checked on the server, and a computer seat replies", async () => {
    const host = await connect("Host");
    const room = await call<RoomView<DraftMatch>>(host.socket, EVENTS.create, { game: "draft" });
    expect(room.seats).toHaveLength(2);
    await call(host.socket, EVENTS.addCpu, { seat: 1, level: "easy" });
    const started = await call<RoomView<DraftMatch>>(host.socket, EVENTS.start);
    expect(started.match?.side).toBe("black");
    expect(await refused(host.socket, EVENTS.act, { action: { type: "turn", steps: [{ from: { r: 6, c: 1 }, to: { r: 4, c: 3 } }] } })).toMatch(/not allowed/);
    await call(host.socket, EVENTS.act, { action: { type: "turn", steps: [{ from: { r: 6, c: 1 }, to: { r: 5, c: 0 } }] } });
    const replied = await until<RoomView<DraftMatch>>(host.updates, (v) => v.match?.side === "black" && v.match.turns === 2);
    expect(replied.match?.last?.side).toBe("white");
  });
});
