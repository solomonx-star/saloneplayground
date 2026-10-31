import { applyMove, canMove, newMatch, nextRound, type Match } from "../tintanto/match";
import { chooseMove, LEVELS as TIN_TAN_TO_LEVELS, type Level, type Move } from "../tintanto/rules";
import type { GameId } from "./protocol";

// What the game server needs to know to run a game it otherwise knows nothing about. Everything here is pure: the
// server keeps the match, passes in each action and saves what comes back.
export type OnlineGame<M, A> = {
  label: string;
  // Number of seats at the table, all of which must be filled (by guests or computer players) to start.
  seats: number;
  levels: Record<string, { label: string }>;
  start(): M;
  // The seat to act next, or null when nobody needs to (for example between rounds).
  turn(match: M): number | null;
  // Applies an action sent by the guest in `seat`: the new match, or why the action was refused.
  act(match: M, seat: number, action: A): M | string;
  // The move a computer player in `seat` makes, or null if it has nothing to do.
  cpuAction(match: M, seat: number, level: string): A | null;
  // Whether the current round has finished, so its result can be recorded.
  roundOver(match: M): boolean;
};

// Tin Tan To: seat 0 plays X (blue, bottom row), seat 1 plays O (orange, top row). Between rounds any player
// can start the next one.
export type TinTanToAction = { type: "move"; move: Move } | { type: "next" };
const MARKS = ["X", "O"] as const;

export const tinTanTo: OnlineGame<Match, TinTanToAction> = {
  label: "Tin Tan To",
  seats: 2,
  levels: TIN_TAN_TO_LEVELS,
  start: newMatch,
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
  roundOver: (match) => !!match.result,
};

export const ONLINE_GAMES: Record<GameId, OnlineGame<unknown, unknown>> = { tintanto: tinTanTo };
export const isGameId = (value: unknown): value is GameId => typeof value === "string" && value in ONLINE_GAMES;
