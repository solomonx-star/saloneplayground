import { newGame, roll, type Game, type Move, type Rules } from "./rules";

// A Snakes and Ladders game as it is played back on screen: the game plus a short record of what has just happened
// (each roll with the squares its token stepped through), so every screen shows and animates the same thing. Used
// both on one device and by the game server; the die is rolled by whoever runs the match and passed in.

// Why the game rolled for someone: they were away (disconnected) on their turn.
export type StandInReason = "timeout" | "away";

export type SnakesEvent =
  | { seq: number; kind: "rolled"; move: Move }
  | { seq: number; kind: "stood-in"; player: number; reason: StandInReason };

export type SnakesMatch = {
  game: Game;
  // The die as last rolled, to keep showing it.
  die: number | null;
  // Counts every event, so a screen knows which ones it has not shown yet.
  seq: number;
  // The latest events, newest last.
  events: SnakesEvent[];
};

// An event before it is numbered (Omit applied to each kind of event separately).
type Unnumbered<E> = E extends SnakesEvent ? Omit<E, "seq"> : never;
type NewEvent = Unnumbered<SnakesEvent>;
const KEEP_EVENTS = 8;

function record(match: SnakesMatch, event: NewEvent): SnakesMatch {
  const seq = match.seq + 1;
  return { ...match, seq, events: [...match.events, { ...event, seq } as SnakesEvent].slice(-KEEP_EVENTS) };
}

export const newSnakesMatch = (players: number, rules: Rules): SnakesMatch => ({ game: newGame(players, rules), die: null, seq: 0, events: [] });

export const canRoll = (match: SnakesMatch) => match.game.winner === null;

// Rolls `value` for the player to move.
export function rollDie(match: SnakesMatch, value: number): SnakesMatch {
  if (!canRoll(match)) return match;
  const { game, move } = roll(match.game, value);
  return record({ ...match, game, die: value }, { kind: "rolled", move });
}

// Rolls for a player who is away on their turn.
export function standIn(match: SnakesMatch, reason: StandInReason, value: number): SnakesMatch {
  if (!canRoll(match)) return match;
  return rollDie(record(match, { kind: "stood-in", player: match.game.turn, reason }), value);
}

// A new game with the same players and house rules.
export const rematch = (match: SnakesMatch): SnakesMatch => newSnakesMatch(match.game.positions.length, match.game.rules);
