import { COLOURS, square, START, type Colour, type Token } from "./rules";

// Layout of the 15×15 Ludo board. Cells are [row, column] from the top left; fractions are allowed for spots that
// sit between cells. Red (Player 1) is top left, green (2) top right, blue (3) bottom right and yellow (4) bottom
// left, and play goes clockwise in that order.

export type Cell = [number, number];
// A point in board units (one unit per cell), for drawing.
export type Point = { x: number; y: number };

export const SIZE = 15;

// The shared track, starting at red's start square and running clockwise. It turns diagonally round the inner
// corners of the arms, as the corner arrows show.
export const TRACK_CELLS: Cell[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

// Each colour's home column, from the square after its turn-off to the one before the centre.
export const COLUMN_CELLS: Record<Colour, Cell[]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

// Top-left cell of each 6×6 yard, and where tokens wait inside it (set high enough to leave room for the player's
// name underneath).
export const YARD: Record<Colour, Cell> = { red: [0, 0], green: [0, 9], blue: [9, 9], yellow: [9, 0] };
const YARD_SPOTS: Cell[] = [[1.4, 1.6], [1.4, 3.6], [3.3, 1.6], [3.3, 3.6]];

// Where finished tokens sit: at the outer edge of each colour's triangle of the centre, leaving the middle free
// for the dice.
export const HOME_CELL: Record<Colour, Cell> = { red: [7, 5.8], green: [5.8, 7], blue: [7, 8.2], yellow: [8.2, 7] };

// fill: the colour on the board; light: its pale tint in the centre; shine: the highlight on its tokens.
export const COLOUR_HEX: Record<Colour, { fill: string; light: string; dark: string; shine: string }> = {
  red: { fill: "#f44a3b", light: "#f8c4c4", dark: "#b3261b", shine: "#ff8a7e" },
  green: { fill: "#4cae50", light: "#c8e6c9", dark: "#2e7d32", shine: "#8fd593" },
  blue: { fill: "#2196f3", light: "#bbdefb", dark: "#1565c0", shine: "#7cc2fb" },
  yellow: { fill: "#fce83a", light: "#fff4c2", dark: "#c9a800", shine: "#fff59a" },
};

export const startCell = (colour: Colour) => TRACK_CELLS[START[colour]];

// The cell a token is drawn in. `index` places yard tokens on their own spot.
export function cellOf(colour: Colour, token: Token, index: number): Cell {
  if (token.where === "yard") { const [r, c] = YARD[colour]; const [dr, dc] = YARD_SPOTS[index % 4]; return [r + dr, c + dc]; }
  if (token.where === "track") return TRACK_CELLS[square(colour, token.pos)];
  if (token.where === "column") return COLUMN_CELLS[colour][token.pos];
  return HOME_CELL[colour];
}

// The black arrows drawn on the board, in board units. Each colour has three, drawn here for red and turned a
// quarter clockwise for each colour after it: one into its home column, one along its start lane, and one round
// the inner corner after that.
const RED_ARROWS: [Point, Point][] = [
  [{ x: 0.45, y: 7.5 }, { x: 1.8, y: 7.5 }],
  [{ x: 3.4, y: 6.5 }, { x: 4.75, y: 6.5 }],
  [{ x: 5.55, y: 6.3 }, { x: 6.5, y: 5.3 }],
];
const turn = ({ x, y }: Point, quarters: number): Point => {
  let p = { x: x - SIZE / 2, y: y - SIZE / 2 };
  for (let i = 0; i < quarters; i++) p = { x: -p.y, y: p.x };
  return { x: p.x + SIZE / 2, y: p.y + SIZE / 2 };
};
export const ARROWS: { colour: Colour; from: Point; to: Point }[] = COLOURS.flatMap((colour, quarters) =>
  RED_ARROWS.map(([from, to]) => ({ colour, from: turn(from, quarters), to: turn(to, quarters) })));
