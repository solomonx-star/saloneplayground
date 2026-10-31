// The messages between the game screens and the game server, for party and online play. The server sends each
// room's state as a RoomView after every change; screens send requests and get a Reply back.

export type GameId = "tintanto" | "ludo";
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
  start: "room:start",
  act: "game:act",
  update: "room:update",
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
