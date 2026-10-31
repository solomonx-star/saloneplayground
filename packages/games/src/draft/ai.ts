import { applyTurn, legalTurns, other, SIZE, type Board, type Side, type Turn } from "./rules";

export type Level = "easy" | "normal" | "hard";
// depth: whole turns searched ahead. noise: random points added to each choice, so easier levels slip up.
export const LEVELS: Record<Level, { label: string; depth: number; noise: number }> = {
  easy: { label: "Easy", depth: 1, noise: 90 },
  normal: { label: "Normal", depth: 3, noise: 12 },
  hard: { label: "Hard", depth: 4, noise: 0 },
};

const MAN = 100;
const KING = 320;
const WIN = 100_000;
// Keeps a search from stalling the page in open king endgames, where turns branch widely.
const NODE_BUDGET = 80_000;

// Board score from `side`'s point of view: material first, then advanced men, central men and a guarded back row.
export function evaluate(board: Board, side: Side) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = board[r][c];
    if (!p) continue;
    let value = KING;
    if (!p.king) {
      const advanced = p.side === "black" ? SIZE - 1 - r : r;
      const homeRow = advanced === 0;
      value = MAN + advanced * 3 + (4.5 - Math.abs(c - 4.5)) * 1.5 + (homeRow ? 6 : 0);
    }
    score += p.side === side ? value : -value;
  }
  return score;
}

export function chooseTurn(board: Board, side: Side, level: Level, random: () => number = Math.random): Turn | null {
  const turns = legalTurns(board, side);
  if (turns.length <= 1) return turns[0] ?? null;
  const { depth, noise } = LEVELS[level];
  const budget = { nodes: 0 };
  let best: Turn | null = null;
  let bestScore = -Infinity;
  for (const turn of order(turns)) {
    const score = -search(applyTurn(board, turn), other(side), depth - 1, -Infinity, Infinity, budget) + random() * noise;
    if (score > bestScore) { bestScore = score; best = turn; }
  }
  return best;
}

// Negamax with alpha-beta pruning. Past the depth limit only captures are searched, so a board is not judged
// halfway through an exchange; because capturing is optional, the side to move may also decline ("stand pat").
function search(board: Board, side: Side, depth: number, alpha: number, beta: number, budget: { nodes: number }): number {
  budget.nodes++;
  const turns = legalTurns(board, side);
  if (!turns.length) return -(WIN + depth);
  let best = -Infinity;
  let candidates = turns;
  if (depth <= 0) {
    best = evaluate(board, side);
    candidates = turns.filter((turn) => turn.captured.length > 0);
    if (budget.nodes > NODE_BUDGET || depth <= -4 || !candidates.length || best >= beta) return best;
    if (best > alpha) alpha = best;
  } else if (budget.nodes > NODE_BUDGET) return evaluate(board, side);
  for (const turn of order(candidates)) {
    const score = -search(applyTurn(board, turn), other(side), depth - 1, -beta, -alpha, budget);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

// Searching bigger captures first lets alpha-beta cut off more of the tree.
function order(turns: Turn[]) {
  return turns.slice().sort((a, b) => b.captured.length - a.captured.length);
}
