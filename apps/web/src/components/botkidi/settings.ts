// Tuning for Botkidi. Every number that changes how the game feels lives here.
//
// The yard is seen from above: a wall along the top with a chalk square drawn against it, and a chalk throwing
// line near the bottom. In the street the square is about 40 cm and the line about 5 m away; here the square is a
// little bigger so it can be hit on a phone.

export const FIELD = 720;
// The face of the wall: the yard starts below it.
export const WALL_Y = 56;
// The chalk square against the wall.
export const SQUARE = { x0: 312, x1: 408, y0: WALL_Y, y1: WALL_Y + 96 };
export const SQUARE_CENTER = { x: (SQUARE.x0 + SQUARE.x1) / 2, y: (SQUARE.y0 + SQUARE.y1) / 2 };
// The throwing line, and where on it a thrower stands by default.
export const LINE_Y = 630;
export const LINE_X = { min: 120, max: 600 };

export const LID_R = 12;

export const PHYSICS = {
  // Sliding friction (px/s²) plus drag proportional to speed. A full-power hit slides about 790 px on a face-up lid.
  friction: 380,
  drag: 1.2,
  // Lids clack off each other and thud off the wall without much bounce.
  restitution: 0.6,
  wallRestitution: 0.35,
  edgeRestitution: 0.3,
  restSpeed: 6,
  maxSpeed: 1500,
  step: 1 / 120,
};

// Flat Side: a lid lying face-down (flat side down) is much harder to hit, so it only gets this share of the speed.
export const FACE_DOWN_FACTOR = 0.6;
// How often a lid that moved comes to rest face-down, with Flat Side on.
export const FACE_DOWN_CHANCE = 0.5;

// How far back (in field pixels) a drag must go for a full-power shot.
export const MAX_DRAG = 140;

export const MAX_PLAYERS = 5;
export const PLAYER_COLORS = [0xe8533f, 0x3a8fd9, 0xf2c14e, 0x4caf50, 0x9b6bd6];
export const PLAYER_NAMES = ["Red", "Blue", "Yellow", "Green", "Purple"];

export type Level = "easy" | "normal" | "hard";
// aimError: random wobble added to the computer's angle (radians); powerError: relative power wobble.
export const LEVELS: Record<Level, { label: string; aimError: number; powerError: number }> = {
  easy: { label: "Easy", aimError: 0.09, powerError: 0.22 },
  normal: { label: "Normal", aimError: 0.05, powerError: 0.12 },
  hard: { label: "Hard", aimError: 0.02, powerError: 0.05 },
};
