// Tuning for Marbles (ring game). Every number that changes how the game feels lives here.

export const FIELD = 720;
export const CENTER = { x: FIELD / 2, y: FIELD / 2 };
export const RING_R = 260;
// Shots from the edge start just outside the ring line, "knuckles down" on the line.
export const EDGE_R = RING_R + 16;

export const MARBLE_R = 9;
export const SHOOTER_R = 12;
export const TARGETS = 13;
// Gap between the centres of neighbouring marbles in the starting cross.
export const CROSS_SPACING = 26;

export const PHYSICS = {
  // Rolling friction (px/s²) plus drag proportional to speed, so fast shots slow down quickly at first.
  // Packed earth is rough: a full-power shot rolls about 440 px, so marbles must be chipped out, not blasted.
  friction: 420,
  drag: 1.5,
  restitution: 0.92,
  wallRestitution: 0.5,
  restSpeed: 6,
  maxShotSpeed: 1100,
  step: 1 / 120,
};

// How far back (in field pixels) a drag must go for a full-power shot.
export const MAX_DRAG = 130;

export type Level = "easy" | "normal" | "hard";
// aimError: random wobble added to the computer's chosen angle (radians); powerError: relative power wobble.
// Measured in self-play, these clear about 1, 2 and 3 marbles a turn on average.
export const LEVELS: Record<Level, { label: string; aimError: number; powerError: number }> = {
  easy: { label: "Easy", aimError: 0.12, powerError: 0.24 },
  normal: { label: "Normal", aimError: 0.07, powerError: 0.14 },
  hard: { label: "Hard", aimError: 0.03, powerError: 0.06 },
};
