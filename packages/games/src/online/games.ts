import { chooseTurn, LEVELS as DRAFT_LEVELS, type Level as DraftLevel } from "../draft/ai";
import { findTurn, newDraftMatch, playTurn, type DraftMatch } from "../draft/match";
import type { Pos, Side } from "../draft/rules";
import { canRoll, makePlay, newLudoMatch, rematch, rollDice, standIn, type LudoMatch, type StandInReason } from "../ludo/match";
import { chooseMove as chooseLudoMove, LEVELS as LUDO_LEVELS, NO_RULES, RULES, TURN_SECONDS, type Level as LudoLevel, type Play, type Rule, type Rules } from "../ludo/rules";
import { applyMove, canMove, newMatch, nextRound, type Match } from "../tintanto/match";
import { chooseMove, LEVELS as TIN_TAN_TO_LEVELS, type Level, type Move } from "../tintanto/rules";
import { newSummary, readOptions, seatsFor, type TouchAction, type TouchOptions, type TouchSummary } from "../touch/online";
import { LEVELS as TOUCH_LEVELS } from "../touch/settings";
import type { GameId } from "./protocol";

// What the game server needs to know to run a game it otherwise knows nothing about. Everything here is pure: the
// server keeps the match, passes in each action (and random numbers, for dice) and saves what comes back.
export type OnlineGame<M, A, O> = {
  label: string;
  levels: Record<string, { label: string }>;
  // Settings the host chooses in the lobby, and how to read them safely from a request.
  defaultOptions: O;
  options(requested: unknown, current: O): O;
  // Number of seats at the table, all of which must be filled (by guests or computer players) to start.
  seats(options: O): number;
  start(options: O): M;
  // The seat to act next, or null when nobody needs to (for example between rounds).
  turn(match: M): number | null;
  // Applies an action sent by the guest in `seat`: the new match, or why the action was refused.
  act(match: M, seat: number, action: A, random?: () => number): M | string;
  // The action a computer player in `seat` takes, or null if it has nothing to do.
  cpuAction(match: M, seat: number, level: string): A | null;
  // Seconds the player to move has before the game plays for them, or null for no limit.
  timeLimit(match: M): number | null;
  // Whether to play for a player who is away (disconnected) on their turn, rather than wait for them.
  playsForAway: boolean;
  // Plays one step for the player to move, who ran out of time or is away.
  standIn(match: M, reason: StandInReason, random?: () => number): M;
  // Whether the current round or game has finished, so its result can be recorded.
  roundOver(match: M): boolean;
  // A real-time game runs on the server's clock instead of in turns (Touch: see touch.live.ts in the server). The
  // match here is only a summary saved between runs, actions go to the live match, and the computer plays any seat
  // nobody has taken, so the game can start with seats free.
  realtime?: boolean;
};

// ---- Tin Tan To ----

// Seat 0 plays X (blue, bottom row), seat 1 plays O (orange, top row). Between rounds any player can start the next.
export type TinTanToAction = { type: "move"; move: Move } | { type: "next" };
const MARKS = ["X", "O"] as const;

export const tinTanTo: OnlineGame<Match, TinTanToAction, Record<string, never>> = {
  label: "Tin Tan To",
  levels: TIN_TAN_TO_LEVELS,
  defaultOptions: {},
  options: () => ({}),
  seats: () => 2,
  start: () => newMatch(),
  turn: (match) => (match.result ? null : MARKS.indexOf(match.toMove)),
  act(match, seat, action) {
    if (action?.type === "next") return match.result ? nextRound(match) : "The round is not over yet.";
    if (action?.type !== "move") return "Unknown action.";
    if (match.result) return "The round is over.";
    if (MARKS[seat] !== match.toMove) return "It is not your turn.";
    if (!action.move || !canMove(match, action.move)) return "That move is not allowed.";
    return applyMove(match, action.move);
  },
  cpuAction(match, seat, level) {
    if (match.result || MARKS[seat] !== match.toMove) return null;
    const move = chooseMove(match.board, match.toMove, (level in TIN_TAN_TO_LEVELS ? level : "normal") as Level);
    return move ? { type: "move", move } : null;
  },
  timeLimit: () => null,
  // A thinking game: wait for a player who drops out rather than move for them.
  playsForAway: false,
  standIn: (match) => match,
  roundOver: (match) => !!match.result,
};

// ---- Ludo ----

// Seat i plays the i-th colour of the game (Players 1 to 4 in turn order). The server rolls the dice.
export type LudoAction = { type: "roll" } | { type: "move"; play: Play } | { type: "rematch" };
export type LudoOptions = { players: number; rules: Rules };
const die = (random: () => number) => 1 + Math.floor(random() * 6);

export const ludo: OnlineGame<LudoMatch, LudoAction, LudoOptions> = {
  label: "Ludo",
  levels: LUDO_LEVELS,
  defaultOptions: { players: 4, rules: NO_RULES },
  options(requested, current) {
    const asked = (requested ?? {}) as Partial<LudoOptions>;
    const players = [2, 3, 4].includes(asked.players as number) ? (asked.players as number) : current.players;
    const rules = { ...current.rules };
    for (const rule of Object.keys(RULES) as Rule[]) if (typeof asked.rules?.[rule] === "boolean") rules[rule] = asked.rules[rule];
    return { players, rules };
  },
  seats: (options) => options.players,
  start: (options) => newLudoMatch(options.players, options.rules),
  turn: (match) => (match.game.winner ? null : match.game.turn),
  act(match, seat, action, random = Math.random) {
    if (action?.type === "rematch") return match.game.winner ? rematch(match) : "The game is not over yet.";
    if (match.game.winner) return "The game is over.";
    if (seat !== match.game.turn) return "It is not your turn.";
    if (action?.type === "roll") return canRoll(match) ? rollDice(match, die(random), die(random)) : "Play your dice first.";
    if (action?.type === "move") {
      if (canRoll(match)) return "Roll the dice first.";
      return makePlay(match, action.play) ?? "That move is not allowed.";
    }
    return "Unknown action.";
  },
  cpuAction(match, seat, level) {
    if (match.game.winner || seat !== match.game.turn) return null;
    if (canRoll(match)) return { type: "roll" };
    const play = chooseLudoMove(match.game, (level in LUDO_LEVELS ? level : "normal") as LudoLevel);
    return play ? { type: "move", play } : null;
  },
  timeLimit: (match) => (match.game.rules.timer && !match.game.winner ? TURN_SECONDS : null),
  playsForAway: true,
  standIn: (match, reason, random = Math.random) => standIn(match, reason, die(random), die(random)),
  roundOver: (match) => !!match.game.winner,
};

// ---- Draft ----

// Seat 0 plays Black (bottom, moves first: the Blackman Trouble Rule), seat 1 plays White. A turn is sent as its steps
// (from and to squares) and checked against the rules. A rematch starts a new game once one is over.
export type DraftAction = { type: "turn"; steps: { from: Pos; to: Pos }[] } | { type: "rematch" };
const SIDES: Side[] = ["black", "white"];

export const draft: OnlineGame<DraftMatch, DraftAction, Record<string, never>> = {
  label: "Draft",
  levels: DRAFT_LEVELS,
  defaultOptions: {},
  options: () => ({}),
  seats: () => 2,
  start: () => newDraftMatch(),
  turn: (match) => (match.result ? null : SIDES.indexOf(match.side)),
  act(match, seat, action) {
    if (action?.type === "rematch") return match.result ? newDraftMatch() : "The game is not over yet.";
    if (action?.type !== "turn") return "Unknown action.";
    if (match.result) return "The game is over.";
    if (SIDES[seat] !== match.side) return "It is not your turn.";
    const turn = findTurn(match, action.steps);
    return turn ? playTurn(match, turn) : "That move is not allowed.";
  },
  cpuAction(match, seat, level) {
    if (match.result || SIDES[seat] !== match.side) return null;
    const turn = chooseTurn(match.board, match.side, (level in DRAFT_LEVELS ? level : "normal") as DraftLevel);
    return turn ? { type: "turn", steps: turn.steps.map(({ from, to }) => ({ from, to })) } : null;
  },
  timeLimit: () => null,
  // A thinking game: wait for a player who drops out rather than move for them.
  playsForAway: false,
  standIn: (match) => match,
  roundOver: (match) => !!match.result,
};

// ---- Touch ----

// Seats alternate between the teams (even seats Blue, odd seats Orange); see touch/online.ts.
export const touch: OnlineGame<TouchSummary, TouchAction, TouchOptions> = {
  label: "Touch",
  levels: TOUCH_LEVELS,
  defaultOptions: { count: 4, level: "normal" },
  options: readOptions,
  seats: (options) => seatsFor(options.count),
  start: newSummary,
  turn: () => null,
  act: () => "Touch is played live on the game server.",
  cpuAction: () => null,
  timeLimit: () => null,
  playsForAway: false,
  standIn: (match) => match,
  roundOver: (match) => match.over,
  realtime: true,
};

export const ONLINE_GAMES: Record<GameId, OnlineGame<unknown, unknown, unknown>> = { tintanto: tinTanTo, ludo, draft, touch };
export const isGameId = (value: unknown): value is GameId => typeof value === "string" && value in ONLINE_GAMES;
