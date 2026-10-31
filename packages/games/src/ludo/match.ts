import { chooseMove, current, newGame, pathOf, play, plays, rolled, skip, type Colour, type Game, type Level, type Outcome, type Play, type Rules, type Token } from "./rules";

// A Ludo game as it is played online: the game itself plus a short record of what has just happened (the dice
// rolled, each move with the path it took), so every screen shows and animates the same thing. The dice are rolled
// by whoever runs the match (the game server) and passed in.

export type LudoEvent =
  | { seq: number; kind: "rolled"; colour: Colour; dice: [number, number]; double: boolean; nothing: boolean }
  | { seq: number; kind: "moved"; colour: Colour; play: Play; from: Token; path: Token[]; outcome: Outcome; again: boolean; lostDie: boolean }
  | { seq: number; kind: "stood-in"; colour: Colour; reason: StandInReason }
  | { seq: number; kind: "won"; colour: Colour };

// Why the game played for someone: their turn timer ran out, or they were away (disconnected) on their turn.
export type StandInReason = "timeout" | "away";

export type LudoMatch = {
  game: Game;
  // The dice as last rolled, to keep showing them.
  dice: [number, number] | null;
  // Counts every event, so a screen knows which ones it has not shown yet.
  seq: number;
  // The latest events, newest last.
  events: LudoEvent[];
};

// An event before it is numbered (Omit applied to each kind of event separately).
type Unnumbered<E> = E extends LudoEvent ? Omit<E, "seq"> : never;
type NewEvent = Unnumbered<LudoEvent>;
const KEEP_EVENTS = 8;

function record(match: LudoMatch, event: NewEvent): LudoMatch {
  const seq = match.seq + 1;
  return { ...match, seq, events: [...match.events, { ...event, seq } as LudoEvent].slice(-KEEP_EVENTS) };
}

export const newLudoMatch = (players: number, rules: Rules): LudoMatch => ({ game: newGame(players, rules), dice: null, seq: 0, events: [] });

export const canRoll = (match: LudoMatch) => !match.game.winner && !match.game.dice.length;

// Rolls the dice for the player to move. When nothing can move, the roll ends straight away (the turn passes, or the
// same player rolls again after a double 6).
export function rollDice(match: LudoMatch, a: number, b: number): LudoMatch {
  if (!canRoll(match)) return match;
  const colour = current(match.game);
  let game = rolled(match.game, a, b);
  const double = game.bonus;
  const nothing = !plays(game).length;
  if (nothing) game = skip(game);
  return record({ ...match, game, dice: [a, b] }, { kind: "rolled", colour, dice: [a, b], double, nothing });
}

// Makes a move for the player to move, or returns null if it is not one of their moves.
export function makePlay(match: LudoMatch, chosen: Play): LudoMatch | null {
  const legal = plays(match.game).find((p) => p.token === chosen?.token && p.die === chosen?.die && !!p.back === !!chosen?.back);
  if (!legal) return null;
  const colour = current(match.game);
  const from = match.game.tokens[colour][legal.token];
  const path = pathOf(match.game, legal);
  const { game, outcome } = play(match.game, legal);
  const again = !game.winner && current(game) === colour && !game.dice.length;
  const lostDie = !game.winner && current(game) !== colour && match.game.dice.length > 1;
  const next = record({ ...match, game }, { kind: "moved", colour, play: legal, from, path, outcome, again, lostDie });
  return game.winner ? record(next, { kind: "won", colour: game.winner }) : next;
}

// Plays one step for a player who ran out of time or is away: rolls if they have not, otherwise makes the move the
// computer would make at `level`.
export function standIn(match: LudoMatch, reason: StandInReason, a: number, b: number, level: Level = "normal"): LudoMatch {
  if (match.game.winner) return match;
  const noted = record(match, { kind: "stood-in", colour: current(match.game), reason });
  if (canRoll(noted)) return rollDice(noted, a, b);
  const choice = chooseMove(noted.game, level);
  return (choice && makePlay(noted, choice)) || { ...noted, game: skip(noted.game) };
}

// A new game with the same players and house rules.
export const rematch = (match: LudoMatch): LudoMatch => newLudoMatch(match.game.seats.length, match.game.rules);
