// What screens report to the game server for the admin dashboard, and what the dashboard reads back.

// Sent by every screen when what it shows changes, and again after reconnecting. `visitorId` is a random id this
// device keeps; `game` is the game's page name (for example "ludo"), or null on the games shelf.
export type PresenceReport = { visitorId: string; name: string; game: string | null; mode: string | null; playing: boolean };

// The device's own id and the screen's game and mode: lower-case words and dashes, at most 30 characters.
const WORD = /^[a-z0-9-]{1,30}$/;
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;

// Checks a report from a screen. Returns null when it is not a valid report.
export function cleanPresence(input: unknown): PresenceReport | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.visitorId !== "string" || !VISITOR.test(value.visitorId)) return null;
  const word = (w: unknown) => (typeof w === "string" && WORD.test(w) ? w : null);
  const name = typeof value.name === "string" ? value.name.replace(/\s+/g, " ").trim().slice(0, 20) : "";
  const game = word(value.game);
  return { visitorId: value.visitorId, name, game, mode: game ? word(value.mode) : null, playing: !!game && value.playing === true };
}

// ---- Ping ----

// Every screen times a tiny round trip to the game server (EVENTS.ping) this often while it is shown, and sends the
// time it measured with the next one. The server keeps each screen's last PING_SAMPLES and shows their median: the
// delay a player feels on every move, from their phone through the mobile network to the server and back.
export const PING_EVERY_MS = 30_000;
export const PING_SAMPLES = 5;

// A round-trip time from a screen, in whole milliseconds; null when it does not make sense.
export function cleanPing(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input > 0 && input < 60_000 ? Math.round(input) : null;
}

// The middle value (null for none), and the value 90% of the list are at or below.
export function median(values: number[]): number | null { return percentile(values, 0.5); }
export function percentile(values: number[], share: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

// ---- The dashboard's data ----

export type LivePerson = {
  visitorId: string;
  name: string;
  game: string | null;
  mode: string | null;
  playing: boolean;
  // Seconds since the device connected, and since the current game session began (0 when not playing).
  onlineSeconds: number;
  playingSeconds: number;
  // Open screens (tabs or devices sharing the id).
  screens: number;
  // The device's typical round trip to the game server, in milliseconds (null until measured).
  pingMs: number | null;
};

// How long things take to answer, in milliseconds: players' round trips to the game server (the median and the
// slowest tenth across the people online now, and how many have been measured), and the game server's own round
// trip to its database, which it makes on every move.
export type Latency = { players: number | null; slowest: number | null; measured: number; databaseMs: number | null };

export type LiveRoom = { code: string; game: string; status: string; party: boolean; public: boolean; people: number; computers: number; updatedAt: string };

export type LiveView = { at: string; online: number; playing: number; people: LivePerson[]; rooms: LiveRoom[]; latency: Latency };

export type GameStat = { game: string; sessions: number; players: number; seconds: number; matches: number };
export type DayStat = { day: string; sessions: number; players: number; seconds: number };
export type PlayerStat = { visitorId: string; name: string; sessions: number; seconds: number; games: string[]; lastPlayed: string };
export type SessionRow = { visitorId: string; name: string; game: string; mode: string | null; startedAt: string; endedAt: string; seconds: number };

export type StatsView = {
  days: number;
  since: string;
  totals: { sessions: number; players: number; seconds: number; newPlayers: number; allTimePlayers: number; matches: number };
  // Players' typical round trip to the game server over the period: the median of the sessions that measured one
  // (each session keeps its device's median), and how many did. For comparing before and after a change of hosting.
  ping: { medianMs: number | null; sessions: number };
  games: GameStat[];
  daily: DayStat[];
  modes: { mode: string; sessions: number; seconds: number }[];
  topPlayers: PlayerStat[];
  recent: SessionRow[];
};

// ---- Data use ----

// What the game server sent ("down", to screens) and received ("up"), per game, since `since`. Bytes are the
// Socket.IO packets as they go over the wire, before any compression. `game` is a game's id, "admin" (dashboards)
// or "none" (screens on the games shelf). Per-minute figures are per open connection, null before any time counted.
export type TrafficEvent = { event: string; direction: "down" | "up"; messages: number; bytes: number };
export type GameTraffic = {
  game: string;
  playerMinutes: number;
  downBytes: number;
  upBytes: number;
  kbPerMinuteDown: number | null;
  kbPerMinuteUp: number | null;
  events: TrafficEvent[];
};
export type TrafficView = { since: string; seconds: number; games: GameTraffic[] };
