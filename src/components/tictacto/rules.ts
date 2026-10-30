// Rules and computer player for Tic Tac To (3×3). Pure functions so they can be tested.

export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = Cell[];
export type Win = { mark: Mark; line: number[] };

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const emptyBoard = (): Board => Array<Cell>(9).fill(null);
export const other = (mark: Mark): Mark => (mark === "X" ? "O" : "X");
export const openCells = (board: Board) => board.flatMap((cell, i) => (cell ? [] : [i]));

export function winner(board: Board): Win | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a]!, line };
  }
  return null;
}

export const isDraw = (board: Board) => !winner(board) && openCells(board).length === 0;

export function play(board: Board, cell: number, mark: Mark): Board {
  const next = board.slice();
  next[cell] = mark;
  return next;
}

// Score of the position for `mark` with `toMove` to play: positive is good for `mark`. Faster wins score higher
// and slower losses score less badly, so the computer finishes games and holds out when behind.
// Scores are cached: there are fewer than 6,000 positions, but the full game tree revisits them many times.
const cache = new Map<string, number>();
function minimax(board: Board, mark: Mark, toMove: Mark, depth: number): number {
  const key = `${board.map((c) => c ?? ".").join("")}${mark}${toMove}${depth}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const win = winner(board);
  let score = 0;
  if (win) score = win.mark === mark ? 10 - depth : depth - 10;
  else {
    const cells = openCells(board);
    if (cells.length) {
      const scores = cells.map((cell) => minimax(play(board, cell, toMove), mark, other(toMove), depth + 1));
      score = toMove === mark ? Math.max(...scores) : Math.min(...scores);
    }
  }
  cache.set(key, score);
  return score;
}

// Every best move for `mark`; the caller picks one at random so the computer does not always play the same game.
export function bestMoves(board: Board, mark: Mark): number[] {
  const scored = openCells(board).map((cell) => ({ cell, score: minimax(play(board, cell, mark), mark, other(mark), 1) }));
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === top).map((s) => s.cell);
}

// A move that wins on the spot, or failing that one that blocks the opponent's win.
export function urgentMove(board: Board, mark: Mark): number | null {
  for (const who of [mark, other(mark)]) {
    const cell = openCells(board).find((c) => winner(play(board, c, who))?.mark === who);
    if (cell !== undefined) return cell;
  }
  return null;
}

export type Level = "easy" | "normal" | "hard";
// mistakes: chance of a random move instead of a good one. Easy also sometimes misses a win or a block;
// Normal always takes wins and blocks; Hard plays perfectly and can only be held to a draw.
export const LEVELS: Record<Level, { label: string; mistakes: number; seesThreats: boolean }> = {
  easy: { label: "Easy", mistakes: 0.55, seesThreats: false },
  normal: { label: "Normal", mistakes: 0.3, seesThreats: true },
  hard: { label: "Hard", mistakes: 0, seesThreats: true },
};

export function chooseMove(board: Board, mark: Mark, level: Level, random: () => number = Math.random): number {
  const cells = openCells(board);
  const pick = (list: number[]) => list[Math.floor(random() * list.length)];
  const { mistakes, seesThreats } = LEVELS[level];
  if (seesThreats) {
    const urgent = urgentMove(board, mark);
    if (urgent !== null) return urgent;
  }
  if (random() < mistakes) return pick(cells);
  return pick(bestMoves(board, mark));
}
