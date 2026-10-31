// Rules and computer player for Tin Tan To. The board is nine points joined by the outer rectangle, the middle
// row and column, and the two long diagonals. Each side starts with three pieces on its own end row and moves
// them along the lines. Pure functions so they can be tested.

export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = Cell[];
export type Move = { from: number; to: number };
// blocked: the loser had no move left, so there is no line to show.
export type Win = { mark: Mark; line: number[]; blocked?: boolean };
export type Result = Win | "draw" | null;

// Points are numbered 0–8 row by row from the top left. X (you, or player 1) starts on the bottom row and
// O on the top row.
export const HOME: Record<Mark, number[]> = { X: [6, 7, 8], O: [0, 1, 2] };

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// The points each point is joined to by a drawn line. The diagonals only run corner to corner through the
// middle, so an edge point is not joined to its diagonal neighbours.
export const NEIGHBOURS: number[][] = [
  [1, 3, 4], [0, 2, 4], [1, 5, 4],
  [0, 6, 4], [0, 1, 2, 3, 5, 6, 7, 8], [2, 8, 4],
  [3, 7, 4], [6, 8, 4], [5, 7, 4],
];

// A game is a draw when a position comes round this many times, or after this many moves in all.
export const DRAW_RULES = { repeats: 3, moves: 60 };

export const startBoard = (): Board => Array.from({ length: 9 }, (_, i): Cell => (HOME.O.includes(i) ? "O" : HOME.X.includes(i) ? "X" : null));
export const other = (mark: Mark): Mark => (mark === "X" ? "O" : "X");
export const positionKey = (board: Board, toMove: Mark) => `${board.map((c) => c ?? ".").join("")}${toMove}`;

// Three in a row along any drawn line wins, except along a side's own home row.
export function winner(board: Board): Win | null {
  for (const line of LINES) {
    const mark = board[line[0]];
    if (mark && board[line[1]] === mark && board[line[2]] === mark && line.join() !== HOME[mark].join()) return { mark, line };
  }
  return null;
}

export function movesFor(board: Board, mark: Mark): Move[] {
  return board.flatMap((cell, from) => (cell === mark ? NEIGHBOURS[from].filter((to) => !board[to]).map((to) => ({ from, to })) : []));
}

export function play(board: Board, move: Move): Board {
  const next = board.slice();
  next[move.to] = next[move.from];
  next[move.from] = null;
  return next;
}

// The result once a move has been made and `toMove` is next: a line wins, a side left with no move loses, and a
// position seen for the third time (`repeats`) or a game past the move limit is a draw.
export function resultAfter(board: Board, toMove: Mark, repeats: number, moves: number): Result {
  const win = winner(board);
  if (win) return win;
  if (!movesFor(board, toMove).length) return { mark: other(toMove), line: [], blocked: true };
  if (repeats >= DRAW_RULES.repeats || moves >= DRAW_RULES.moves) return "draw";
  return null;
}

// ---- Solving the game ----

// The value of a position for the side to move with best play on both sides: a win or loss in `depth` moves, or
// a draw (neither side can force a win, so the game goes round until a draw rule ends it).
export type Outcome = { result: "win" | "loss" | "draw"; depth: number };

let solved: Map<string, Outcome> | null = null;

// Works out every position by retrograde analysis: there are only 3,360, so this takes a moment once and is cached.
export function solve(): Map<string, Outcome> {
  if (solved) return solved;
  const table = new Map<string, Outcome>();
  const states: { board: Board; toMove: Mark; key: string }[] = [];
  for (let n = 0; n < 3 ** 9; n++) {
    const board: Board = [];
    for (let i = 0, k = n; i < 9; i++, k = Math.floor(k / 3)) board.push(k % 3 === 1 ? "X" : k % 3 === 2 ? "O" : null);
    if (board.filter((c) => c === "X").length !== 3 || board.filter((c) => c === "O").length !== 3) continue;
    for (const toMove of ["X", "O"] as Mark[]) states.push({ board, toMove, key: positionKey(board, toMove) });
  }
  // Positions that are already over: the side to move has lost if the other side has a line or if it cannot move.
  for (const s of states) {
    const win = winner(s.board);
    if (win) table.set(s.key, { result: win.mark === s.toMove ? "win" : "loss", depth: 0 });
    else if (!movesFor(s.board, s.toMove).length) table.set(s.key, { result: "loss", depth: 0 });
  }
  // Then, one move further out each pass: a position is won if some move reaches a lost position for the other
  // side, and lost if every move reaches a won one.
  for (let depth = 1; ; depth++) {
    const found: [string, Outcome][] = [];
    for (const s of states) {
      if (table.has(s.key)) continue;
      const next = movesFor(s.board, s.toMove).map((m) => table.get(positionKey(play(s.board, m), other(s.toMove))));
      if (next.some((o) => o?.result === "loss")) found.push([s.key, { result: "win", depth }]);
      else if (next.every((o) => o?.result === "win")) found.push([s.key, { result: "loss", depth }]);
    }
    if (!found.length) break;
    for (const [key, outcome] of found) table.set(key, outcome);
  }
  for (const s of states) if (!table.has(s.key)) table.set(s.key, { result: "draw", depth: 0 });
  solved = table;
  return table;
}

// How good a move is for the side making it: wins (sooner is better) above draws above losses (later is better).
function moveScore(board: Board, move: Move, mark: Mark): number {
  const next = solve().get(positionKey(play(board, move), other(mark)))!;
  return next.result === "loss" ? 100 - next.depth : next.result === "win" ? next.depth - 100 : 0;
}

// Every best move for `mark`; the caller picks one at random so the computer does not always play the same game.
export function bestMoves(board: Board, mark: Mark): Move[] {
  const scored = movesFor(board, mark).map((move) => ({ move, score: moveScore(board, move, mark) }));
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === top).map((s) => s.move);
}

// A move that makes three in a row on the spot, if there is one.
export function winningMove(board: Board, mark: Mark): Move | null {
  return movesFor(board, mark).find((m) => winner(play(board, m))?.mark === mark) ?? null;
}

// Moves that do not let the other side make three in a row with their very next move.
export function safeMoves(board: Board, mark: Mark): Move[] {
  return movesFor(board, mark).filter((m) => !winningMove(play(board, m), other(mark)));
}

export type Level = "easy" | "normal" | "hard";
// mistakes: chance of a random move instead of a good one. Easy sometimes misses a win on the spot and may walk
// into a loss; Normal always takes a win and its random moves never hand one over; Hard plays the solved game.
export const LEVELS: Record<Level, { label: string; mistakes: number; careful: boolean }> = {
  easy: { label: "Easy", mistakes: 0.55, careful: false },
  normal: { label: "Normal", mistakes: 0.3, careful: true },
  hard: { label: "Hard", mistakes: 0, careful: true },
};

export function chooseMove(board: Board, mark: Mark, level: Level, random: () => number = Math.random): Move | null {
  const moves = movesFor(board, mark);
  if (!moves.length) return null;
  const pick = (list: Move[]) => list[Math.floor(random() * list.length)];
  const { mistakes, careful } = LEVELS[level];
  const win = winningMove(board, mark);
  if (win && (careful || random() < 0.5)) return win;
  if (random() < mistakes) {
    const safe = careful ? safeMoves(board, mark) : moves;
    return pick(safe.length ? safe : moves);
  }
  return pick(bestMoves(board, mark));
}
