import { applyTurn, countPieces, initialBoard, isQuietTurn, legalTurns, other, type Board, type Pos, type Side, type Turn } from "./rules";

// A Draft game: the board, whose move it is, the last turn and how the game ended. The same functions run the game on
// one device and on the game server for online play.

// 25 king moves each without a capture ends the game as a draw.
export const DRAW_AFTER_QUIET_TURNS = 50;

// How a game ended: a side won by capturing every piece or leaving the other side with no move, or it was a draw
// after a long run of king moves without a capture.
export type DraftResult = { winner: Side | null; reason: "captured" | "blocked" | "quiet" };

export type DraftMatch = {
  board: Board;
  side: Side;
  // The previous turn, highlighted on the board; crowned is true when it made a new king.
  last: (Turn & { side: Side; crowned: boolean }) | null;
  // Quiet turns in a row (king moves without a capture), for the draw rule.
  quiet: number;
  result: DraftResult | null;
  turns: number;
};

// Black moves first: the Blackman Trouble Rule.
export const newDraftMatch = (): DraftMatch => ({ board: initialBoard(), side: "black", last: null, quiet: 0, result: null, turns: 0 });

const isPos = (p: unknown): p is Pos => !!p && Number.isInteger((p as Pos).r) && Number.isInteger((p as Pos).c);

// The legal turn for the side to move that takes exactly these steps (from and to squares), or null. A turn sent
// over the network is matched against the rules rather than trusted.
export function findTurn(match: DraftMatch, steps: unknown): Turn | null {
  if (match.result || !Array.isArray(steps) || !steps.length) return null;
  const wanted = steps as { from?: unknown; to?: unknown }[];
  if (!wanted.every((s) => isPos(s?.from) && isPos(s?.to))) return null;
  return legalTurns(match.board, match.side).find((turn) => turn.steps.length === wanted.length && turn.steps.every((s, i) => {
    const w = wanted[i] as { from: Pos; to: Pos };
    return s.from.r === w.from.r && s.from.c === w.from.c && s.to.r === w.to.r && s.to.c === w.to.c;
  })) ?? null;
}

// Plays a legal turn for the side to move and decides whether the game is over.
export function playTurn(match: DraftMatch, turn: Turn): DraftMatch {
  const mover = match.side;
  const board = applyTurn(match.board, turn);
  const quiet = isQuietTurn(match.board, turn) ? match.quiet + 1 : 0;
  const next = other(mover);
  const start = turn.steps[0].from;
  const end = turn.steps[turn.steps.length - 1].to;
  const crowned = !match.board[start.r][start.c]?.king && !!board[end.r][end.c]?.king;
  const played: DraftMatch = { board, side: next, last: { ...turn, side: mover, crowned }, quiet, result: null, turns: match.turns + 1 };
  if (!legalTurns(board, next).length) return { ...played, result: { winner: mover, reason: countPieces(board)[next] === 0 ? "captured" : "blocked" } };
  if (quiet >= DRAW_AFTER_QUIET_TURNS) return { ...played, result: { winner: null, reason: "quiet" } };
  return played;
}
