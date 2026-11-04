// The Snakes and Ladders board: 100 squares in ten rows, square 1 at the bottom left, each row running the other
// way from the one below it (so square 11 sits above square 10). The layout is our own. Ladders are bamboo, three of
// them named after places in Sierra Leone; the snakes are ones found there.

export const SQUARES = 100;
export const SIZE = 10;

export type Jump = { from: number; to: number; name: string };

// Foot → top.
export const LADDERS: Jump[] = [
  { from: 4, to: 25, name: "Bamboo ladder" },
  { from: 9, to: 31, name: "Bamboo ladder" },
  { from: 21, to: 42, name: "Bamboo ladder" },
  { from: 28, to: 56, name: "Up Sugar Loaf" },
  { from: 50, to: 67, name: "Bamboo ladder" },
  { from: 62, to: 83, name: "Up the Cotton Tree" },
  { from: 71, to: 91, name: "Up Mount Bintumani" },
];

// Head → tail. The last is the long one near the top: with Snake Bite on, it sends you right back to the start.
export const SNAKES: Jump[] = [
  { from: 17, to: 6, name: "Night adder" },
  { from: 33, to: 12, name: "Green mamba" },
  { from: 45, to: 24, name: "Rhinoceros viper" },
  { from: 54, to: 34, name: "Spitting cobra" },
  { from: 64, to: 43, name: "Royal python" },
  { from: 87, to: 58, name: "Gaboon viper" },
  { from: 93, to: 73, name: "Bush viper" },
  { from: 98, to: 39, name: "Great rock python" },
];
export const WORST_SNAKE = SNAKES[SNAKES.length - 1];

const ladderAt = new Map(LADDERS.map((j) => [j.from, j]));
const snakeAt = new Map(SNAKES.map((j) => [j.from, j]));

// The ladder or snake starting on a square, if any.
export function jumpAt(square: number): { kind: "ladder" | "snake"; jump: Jump } | null {
  const ladder = ladderAt.get(square);
  if (ladder) return { kind: "ladder", jump: ladder };
  const snake = snakeAt.get(square);
  return snake ? { kind: "snake", jump: snake } : null;
}

// Where a square is drawn: its row from the top (0–9) and column from the left (0–9).
export function cellOf(square: number): { row: number; col: number } {
  const index = Math.min(SQUARES, Math.max(1, square)) - 1;
  const fromBottom = Math.floor(index / SIZE);
  const along = index % SIZE;
  return { row: SIZE - 1 - fromBottom, col: fromBottom % 2 === 0 ? along : SIZE - 1 - along };
}
