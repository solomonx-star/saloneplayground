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
};

export type LiveRoom = { code: string; game: string; status: string; party: boolean; people: number; computers: number; updatedAt: string };

export type LiveView = { at: string; online: number; playing: number; people: LivePerson[]; rooms: LiveRoom[] };

export type GameStat = { game: string; sessions: number; players: number; seconds: number; matches: number };
export type DayStat = { day: string; sessions: number; players: number; seconds: number };
export type PlayerStat = { visitorId: string; name: string; sessions: number; seconds: number; games: string[]; lastPlayed: string };
export type SessionRow = { visitorId: string; name: string; game: string; mode: string | null; startedAt: string; endedAt: string; seconds: number };

export type StatsView = {
  days: number;
  since: string;
  totals: { sessions: number; players: number; seconds: number; newPlayers: number; allTimePlayers: number; matches: number };
  games: GameStat[];
  daily: DayStat[];
  modes: { mode: string; sessions: number; seconds: number }[];
  topPlayers: PlayerStat[];
  recent: SessionRow[];
};
