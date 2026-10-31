// The messages between the game screens and the game server, for party and online play. The server sends each
// room's state as a RoomView after every change; screens send requests and get a Reply back.

export type GameId = "tintanto";
export type RoomStatus = "lobby" | "playing";

// A seat at the table: a guest, a computer player, or empty (no guestId and not cpu).
export type Seat = { guestId: string | null; name: string; cpu: boolean; level: string; connected: boolean };

export type RoomView<M = unknown> = {
  code: string;
  game: GameId;
  hostId: string;
  seats: Seat[];
  status: RoomStatus;
  match: M | null;
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
