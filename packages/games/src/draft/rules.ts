// Rules for Draft, the 10×10 African checkers played in Sierra Leone. Pure functions over a board, so they can be tested.

export type Side = "black" | "white";
export type Piece = { side: Side; king: boolean } | null;
export type Pos = { r: number; c: number };
export type Board = Piece[][];
// One hop of a turn. A plain move is a single step; a capture turn is a chain of steps by the same piece.
export type Step = { from: Pos; to: Pos; captured?: Pos };
export type Turn = { steps: Step[]; captured: Pos[] };

export const SIZE = 10;
// Black (the player) starts at the bottom and moves up; White starts at the top and moves down.
export const FORWARD: Record<Side, number> = { black: -1, white: 1 };
const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;

export const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const other = (side: Side): Side => (side === "black" ? "white" : "black");
export const posKey = (p: Pos) => `${p.r},${p.c}`;
export const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
export const promotionRow = (side: Side) => (side === "black" ? 0 : SIZE - 1);

export function initialBoard(): Board {
  return Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c): Piece => {
    if ((r + c) % 2 !== 1) return null;
    if (r < 4) return { side: "white", king: false };
    if (r > 5) return { side: "black", king: false };
    return null;
  }));
}

export function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Piece>(SIZE).fill(null));
}

// Single captures for the piece on `from`. Pieces already jumped this turn stay on the board until the
// turn ends, so they block the path, but they cannot be jumped a second time.
export function capturesFrom(board: Board, from: Pos, jumped: ReadonlySet<string> = new Set()): Step[] {
  const piece = board[from.r][from.c];
  if (!piece) return [];
  const out: Step[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    let r = from.r + dr; let c = from.c + dc;
    // Men capture an adjacent piece in any direction; kings fly along the diagonal to reach one.
    if (piece.king) while (inside(r, c) && !board[r][c]) { r += dr; c += dc; }
    if (!inside(r, c)) continue;
    const target = board[r][c];
    if (!target || target.side === piece.side || jumped.has(posKey({ r, c }))) continue;
    const captured = { r, c };
    r += dr; c += dc;
    while (inside(r, c) && !board[r][c]) {
      out.push({ from, to: { r, c }, captured });
      if (!piece.king) break;
      r += dr; c += dc;
    }
  }
  return out;
}

// Moves the piece for one step without removing anything or crowning it; used while a capture chain is in progress.
export function moveOnly(board: Board, step: Step): Board {
  const next = board.map((row) => row.slice());
  next[step.to.r][step.to.c] = next[step.from.r][step.from.c];
  next[step.from.r][step.from.c] = null;
  return next;
}

// Capturing is optional, as it is played in Sierra Leone: offering a piece that need not be taken is how
// players set traps. A capture chain may also stop after any jump. forceCapture switches to the stricter
// rule where any capture must be taken and a chain must run until nothing is left to take.
export type RuleOptions = { forceCapture?: boolean };

// Every legal turn for `side`: capture turns first, then plain moves.
export function legalTurns(board: Board, side: Side, { forceCapture = false }: RuleOptions = {}): Turn[] {
  const captures: Turn[] = [];
  const extend = (current: Board, at: Pos, steps: Step[], captured: Pos[]) => {
    const next = capturesFrom(current, at, new Set(captured.map(posKey)));
    if (steps.length && (!forceCapture || !next.length)) captures.push({ steps, captured });
    for (const step of next) extend(moveOnly(current, step), step.to, [...steps, step], [...captured, step.captured!]);
  };
  const pieces: Pos[] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]?.side === side) pieces.push({ r, c });
  for (const from of pieces) extend(board, from, [], []);
  if (forceCapture && captures.length) return captures;

  const moves: Turn[] = [];
  for (const from of pieces) {
    const piece = board[from.r][from.c]!;
    for (const [dr, dc] of DIRECTIONS) {
      if (!piece.king && dr !== FORWARD[side]) continue;
      let r = from.r + dr; let c = from.c + dc;
      while (inside(r, c) && !board[r][c]) {
        moves.push({ steps: [{ from, to: { r, c } }], captured: [] });
        if (!piece.king) break;
        r += dr; c += dc;
      }
    }
  }
  return [...captures, ...moves];
}

// Plays a whole turn: the piece ends on its last square, captured pieces come off together, and a man is
// crowned only if the turn ends on the far row (passing through it mid-capture does not count).
export function applyTurn(board: Board, turn: Turn): Board {
  const start = turn.steps[0].from;
  const end = turn.steps[turn.steps.length - 1].to;
  const piece = board[start.r][start.c];
  const next = board.map((row) => row.slice());
  next[start.r][start.c] = null;
  for (const p of turn.captured) next[p.r][p.c] = null;
  if (piece) next[end.r][end.c] = { ...piece, king: piece.king || end.r === promotionRow(piece.side) };
  return next;
}

export function countPieces(board: Board) {
  const count = { black: 0, white: 0 };
  for (const row of board) for (const p of row) if (p) count[p.side]++;
  return count;
}

// A turn that only shuffles a king without capturing; a long run of these ends the game as a draw.
export function isQuietTurn(board: Board, turn: Turn) {
  const from = turn.steps[0].from;
  return turn.captured.length === 0 && !!board[from.r][from.c]?.king;
}
