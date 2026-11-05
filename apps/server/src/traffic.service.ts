import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { Socket } from "socket.io";
import type { TrafficView } from "@salone/games/online/admin";

// How much data the game server sends and receives, per game and per kind of message, so the cost of playing online
// (on prepaid mobile data) can be measured and then cut. It counts the actual Socket.IO packets on each connection
// (what goes over the wire before any compression), and how long each connection spends in each game, which gives
// kilobytes per player-minute. Kept in memory since the server started, or since an admin last reset it.

type Tally = { messages: number; bytes: number };
type GameTraffic = { down: Map<string, Tally>; up: Map<string, Tally>; ms: number };
// What a connection is doing, as the gateway sees it: a game's id, "admin", or null (the games shelf, or connecting).
export type Activity = () => string | null;

const TICK_MS = 5000;
// Socket.IO packets start with their type: 2 an event, 3 a reply. An event's name is the first item of its array.
const EVENT = /^(\d)(\d*)\[?"?([^",\]]*)/;

function kind(data: unknown): string {
  if (typeof data !== "string") return "binary";
  const match = EVENT.exec(data);
  if (!match) return "other";
  const [, type, , name] = match;
  if (type === "2" && name) return name;
  if (type === "3") return "reply";
  if (type === "0") return "connect";
  return "other";
}

@Injectable()
export class TrafficService implements OnModuleDestroy {
  private games = new Map<string, GameTraffic>();
  private since = new Date();
  private readonly watched = new Map<string, { socket: Socket; activity: Activity }>();
  private readonly timer = setInterval(() => this.tick(), TICK_MS);

  constructor() { this.timer.unref(); }

  onModuleDestroy() { clearInterval(this.timer); }

  // Starts counting a connection's packets. `activity` says what it is doing at any moment.
  watch(socket: Socket, activity: Activity) {
    this.watched.set(socket.id, { socket, activity });
    const engine = socket.conn;
    const count = (direction: "down" | "up", type: string, data: unknown) => {
      // Heartbeats keep every connection alive; they are small but count towards a player's data.
      const event = type === "message" ? kind(data) : type === "ping" || type === "pong" ? "heartbeat" : null;
      if (!event) return;
      const bytes = typeof data === "string" ? Buffer.byteLength(data) + 1 : 1;
      this.add(activity() ?? "none", direction, event, bytes);
    };
    engine.on("packetCreate", (packet: { type: string; data?: unknown }) => count("down", packet.type, packet.data));
    engine.on("packet", (packet: { type: string; data?: unknown }) => count("up", packet.type, packet.data));
    socket.once("disconnect", () => this.watched.delete(socket.id));
  }

  reset() {
    this.games = new Map();
    this.since = new Date();
  }

  view(): TrafficView {
    const now = Date.now();
    const list = (map: Map<string, Tally>, direction: "down" | "up") => [...map].map(([event, t]) => ({ event, direction, ...t }));
    const perMinute = (bytes: number, ms: number) => (ms > 0 ? Math.round((bytes / 1024 / (ms / 60_000)) * 10) / 10 : null);
    const total = (map: Map<string, Tally>) => [...map.values()].reduce((sum, t) => sum + t.bytes, 0);
    return {
      since: this.since.toISOString(),
      seconds: Math.round((now - this.since.getTime()) / 1000),
      games: [...this.games].map(([game, g]) => {
        const down = total(g.down);
        const up = total(g.up);
        return {
          game,
          playerMinutes: Math.round((g.ms / 60_000) * 10) / 10,
          downBytes: down,
          upBytes: up,
          kbPerMinuteDown: perMinute(down, g.ms),
          kbPerMinuteUp: perMinute(up, g.ms),
          events: [...list(g.down, "down"), ...list(g.up, "up")].sort((a, b) => b.bytes - a.bytes),
        };
      }).sort((a, b) => b.downBytes - a.downBytes),
    };
  }

  // ---- Inside ----

  private game(name: string) {
    let g = this.games.get(name);
    if (!g) { g = { down: new Map(), up: new Map(), ms: 0 }; this.games.set(name, g); }
    return g;
  }

  private add(game: string, direction: "down" | "up", event: string, bytes: number) {
    const map = this.game(game)[direction];
    const t = map.get(event) ?? { messages: 0, bytes: 0 };
    t.messages += 1;
    t.bytes += bytes;
    map.set(event, t);
  }

  // Every few seconds, each open connection adds that time to the game it is in.
  private tick() {
    for (const { activity } of this.watched.values()) this.game(activity() ?? "none").ms += TICK_MS;
  }
}
