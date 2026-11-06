// The messages between the game screens and the game server, for party and online play. The server sends each
// room's state as a RoomView after every change; screens send requests and get a Reply back.

export type GameId = "tintanto" | "ludo" | "draft" | "touch" | "snakes";
// The web app's page for each game the server runs (/games/<page>), which is also how the admin dashboard names it.
export const GAME_PAGES: Record<GameId, string> = { tintanto: "tin-tan-to", ludo: "ludo", draft: "draft", touch: "touch", snakes: "snakes-and-ladders" };
export const pageOfGame = (game: string) => GAME_PAGES[game as GameId] ?? game;

// A closed room has ended for good (its party screen left); screens drop it when they see that.
export type RoomStatus = "lobby" | "playing" | "closed";

// A seat at the table: a guest, a computer player, or empty (no guestId and not cpu).
export type Seat = { guestId: string | null; name: string; cpu: boolean; level: string; connected: boolean };

export type RoomView<M = unknown, O = unknown> = {
  code: string;
  game: GameId;
  hostId: string;
  seats: Seat[];
  status: RoomStatus;
  // Party play: the host is a shared screen (a TV or laptop) that shows the board and runs the room without a seat;
  // the players use their phones.
  party: boolean;
  // The settings the host chose in the lobby (for Ludo: the number of players and the house rules).
  options: O;
  match: M | null;
  // When the player to move will be played for (turn timer, or away on their turn): their seat and the
  // milliseconds left when this view was sent.
  timer: { seat: number; endsIn: number; reason: "timeout" | "away" } | null;
  // Goes up by one with every change, so a screen can ignore an update older than the one it has.
  version: number;
};

// A screen can say `lean: true` in its hello: the reply to a change it asks for (settings, seats, start, a move) is then
// only the room's new version, since the room itself arrives as an update to everyone. Saves sending it twice.
export type Lean = { version: number };

// A guest's identity: the token proves it is the same guest when they come back, so keep it private.
export type Guest = { guestId: string; token: string; name: string };

export type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

export const EVENTS = {
  hello: "guest:hello",
  create: "room:create",
  join: "room:join",
  leave: "room:leave",
  options: "room:options",
  addCpu: "room:add-cpu",
  removeCpu: "room:remove-cpu",
  seat: "room:seat",
  start: "room:start",
  act: "game:act",
  update: "room:update",
  // Real-time games (Touch): a person's stick and buttons, and the frames the server sends while the match runs.
  input: "game:input",
  frame: "game:frame",
  // Every screen reports what it is showing, for the admin dashboard: no reply.
  presence: "presence:update",
  // Room chat (see chat.ts): a seated player sends a message; everyone in the room gets each message, and a screen
  // entering a room gets the recent ones.
  chatSend: "chat:send",
  chat: "chat:message",
  chatHistory: "chat:history",
  // A seated player reports another; everyone in the room gets the new list of blocked players when it changes.
  chatReport: "chat:report",
  chatBlocked: "chat:blocked",
  // The admin dashboard: it signs in with the admin token, then gets the live view whenever it changes, and a
  // signal when a game session ends (its statistics are out of date).
  adminWatch: "admin:watch",
  adminLive: "admin:live",
  adminSessions: "admin:sessions",
  // A chat report came in or was dismissed: the dashboard reads the reports again.
  adminReports: "admin:reports",
} as const;

// Room codes are four capital letters, leaving out I and O so they cannot be mistaken for 1 and 0.
export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE = /^[A-HJ-NP-Z]{4}$/;
export const MAX_NAME = 20;

// Tidies a name typed by a player: trimmed, single-spaced, at most MAX_NAME characters, never empty.
export function cleanName(name: unknown): string {
  const text = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
  return text || "Player";
}
