import { NEIGHBOURS, other, play, positionKey, resultAfter, startBoard, type Board, type Mark, type Move, type Result } from "./rules";

// A Tin Tan To match: rounds of the game with a running score. The same functions run the game on one device and
// on the game server for online play.

// Pieces keep an id so a screen can slide each one from point to point instead of jumping.
export type Piece = { id: number; mark: Mark; at: number };
export type Scores = { X: number; O: number; draws: number };
export type Match = {
  board: Board;
  pieces: Piece[];
  toMove: Mark;
  // Who moved first this round; it swaps every round.
  starter: Mark;
  result: Result;
  scores: Scores;
  last: Move | null;
  // How many times each position has come round this round (for the draw rule), and the moves made.
  seen: Record<string, number>;
  moves: number;
};

export function newRound(starter: Mark): Omit<Match, "scores"> {
  const board = startBoard();
  const pieces = board.flatMap((mark, at): Piece[] => (mark ? [{ id: at, mark, at }] : []));
  return { board, pieces, toMove: starter, starter, result: null, last: null, seen: { [positionKey(board, starter)]: 1 }, moves: 0 };
}

export const newMatch = (): Match => ({ ...newRound("X"), scores: { X: 0, O: 0, draws: 0 } });

// Starts the round again with the same side moving first.
export const restartRound = (match: Match): Match => ({ ...match, ...newRound(match.starter) });

// Starts the next round, with the other side moving first.
export const nextRound = (match: Match): Match => ({ ...match, ...newRound(other(match.starter)) });

// Whether the side to move may make this move: its own piece, to an empty point joined by a line.
export function canMove(match: Match, move: Move): boolean {
  const { from, to } = move;
  return !match.result && Number.isInteger(from) && Number.isInteger(to) && match.board[from] === match.toMove && match.board[to] === null && NEIGHBOURS[from]?.includes(to);
}

// Makes a move, scoring the round if it ends it. An illegal move leaves the match as it is.
export function applyMove(match: Match, move: Move): Match {
  if (!canMove(match, move)) return match;
  const board = play(match.board, move);
  const toMove = other(match.toMove);
  const key = positionKey(board, toMove);
  const seen = { ...match.seen, [key]: (match.seen[key] ?? 0) + 1 };
  const moves = match.moves + 1;
  const result = resultAfter(board, toMove, seen[key], moves);
  const scores = { ...match.scores };
  if (result === "draw") scores.draws++;
  else if (result) scores[result.mark]++;
  const pieces = match.pieces.map((p) => (p.at === move.from ? { ...p, at: move.to } : p));
  return { ...match, board, pieces, toMove, result, scores, last: move, seen, moves };
}
