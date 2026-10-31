// Tuning and field layout for Balance Ball. Every number that changes how the game feels lives here.

export type Point = { x: number; y: number };
export type Mode = "classic" | "round24";

export const FIELD_W = 960;
export const FIELD_H = 600;
// Playing area inside the painted border.
export const BOUNDS = { left: 32, right: 928, top: 34, bottom: 566 };
// The throwing teams stand beyond these lines; the dodge zone is between them.
export const LEFT_LINE = 185;
export const RIGHT_LINE = 775;
export const DODGE_ZONE = { left: 200, right: 760, top: 50, bottom: 550 };
export const THROW_ZONES = {
  left: { left: 50, right: 168, top: 52, bottom: 548 },
  right: { left: 792, right: 910, top: 52, bottom: 548 },
};
export const START = { x: 480, y: 300 };

// Round of 24: a middle circle where the run starts and ends, and four circles on the diagonals, numbered
// clockwise from the top left. Index 0 is the middle circle.
export const CIRCLES = [
  { x: 480, y: 300, r: 44 },
  { x: 330, y: 165, r: 38 },
  { x: 630, y: 165, r: 38 },
  { x: 630, y: 435, r: 38 },
  { x: 330, y: 435, r: 38 },
];

export const BALANCE = {
  dodgerSpeed: 210,
  throwerSpeed: 175,
  // The receiver runs faster to fetch the ball once it has reached their end.
  fetchSpeed: 260,
  ballSpeed: 440,
  ballRadius: 9,
  hitRadius: 22,
  closeRadius: 48,
  // A throw may go at most this far off straight across (radians), so every ball reaches the other end.
  maxThrowAngle: (60 * Math.PI) / 180,
  // How quickly a ball slows down once it is in the receiving team's zone (px/s²).
  zoneFriction: 1100,
  pickupSeconds: 0.35,
  // Computer throwers wait this long (random between the two) after getting the ball before throwing.
  windup: [0.45, 0.9] as const,
  // Random aim error of computer throws (radians), and how often they aim ahead of a runner rather than at them.
  aimError: 0.08,
  leadChance: 0.7,
  // Round of 24: when a dodger leaves a circle, a computer thrower needs this long (random between the two) to react.
  reaction: [0.3, 0.5] as const,
  // Round of 24: how long a computer thrower holds the ball while the dodger is safe before passing it across.
  holdBeforePass: 2.2,
  rounds: 24,
  // A circle only keeps you safe for this many seconds; then you must move on.
  circleSeconds: 6,
  players: 3,
  slowMoMs: 650,
  slowMoScale: 0.25,
};

export const MODES: Record<Mode, { label: string; blurb: string }> = {
  classic: { label: "Classic", blurb: "Dodge in the middle for as long as you can. Every throw you dodge scores a point." },
  round24: { label: "Round of 24", blurb: "Run the circles 1, 2, 3, 4 and round again. You are only safe inside a circle. Round 24 ends in the middle." },
};
