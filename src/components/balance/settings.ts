// Tuning and field layout for Balance Ball. Every number that changes how the game feels lives here.

export type Point = { x: number; y: number };
export type Mode = "classic" | "round24" | "gather" | "allman";
export type Level = "easy" | "normal" | "hard";

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

// Round of 24: a middle circle where the run starts and ends, and four circles out towards the corners of the
// dodge zone, numbered clockwise from the top left. Index 0 is the middle circle. The outer circles sit close
// to the throwing lines, so every run is a long dash in the open.
export const CIRCLES = [
  { x: 480, y: 300, r: 42 },
  { x: 255, y: 112, r: 36 },
  { x: 705, y: 112, r: 36 },
  { x: 705, y: 488, r: 36 },
  { x: 255, y: 488, r: 36 },
];

// Gather: the small circle in the middle where every bottle cap has to be brought.
export const DROP = { x: 480, y: 300, r: 30 };
export const GATHER = {
  // How close a dodger must get to a cap to pick it up. Caps are carried one at a time.
  pickupRadius: 20,
  // A dodger carrying a cap runs at this share of their speed.
  carrySpeed: 0.85,
  // Caps are scattered at least this far apart, and at least this far from the middle circle.
  spacing: 46,
  clearOfDrop: 95,
  // Points for bringing in every cap, on top of the point for each cap.
  clearBonus: 5,
};

// All Man Yone: both teams are in the field together and the throwers at the ends are neutral. A round ends
// when one team has no one left standing; the first team to win this many rounds wins the match.
export const ALLMAN = { winsNeeded: 2 };

export const BALANCE = {
  dodgerSpeed: 210,
  throwerSpeed: 175,
  // The receiver runs this much faster to fetch the ball once it has reached their end.
  fetchBoost: 1.5,
  // Speed of throws by your own team; the computer team throws at its level's speed.
  ballSpeed: 440,
  ballRadius: 9,
  hitRadius: 22,
  closeRadius: 48,
  // A throw may go at most this far off straight across (radians), so every ball reaches the other end.
  maxThrowAngle: (60 * Math.PI) / 180,
  // How quickly a ball slows down once it is in the receiving team's zone (px/s²).
  zoneFriction: 1100,
  pickupSeconds: 0.35,
  // Round of 24: how long a computer thrower holds the ball while the dodger is safe before passing it across.
  holdBeforePass: 2.2,
  rounds: 24,
  // Round of 24: four rounds make a lap. Each lap the computer throwers get sharper and circles keep you
  // safe for less time, down to the floor below.
  lapRamp: { windup: 0.07, reaction: 0.06, aim: 0.08, lead: 0.04, ballSpeed: 0.025, circleSeconds: 0.4 },
  minCircleSeconds: 3,
  // Points for making it home to the middle after round 24, on top of the point for the round.
  homeBonus: 5,
  players: 3,
  slowMoMs: 650,
  slowMoScale: 0.25,
};

// The level sets the computer team. ballSpeed and throwerSpeed are how fast they throw and move; windup is how
// long (random between the two) a thrower waits after getting the ball; reaction is how long they need when a
// dodger breaks from a circle; aimError is their random aim error (radians) and leadChance how often they aim
// ahead of a runner. dodgerSpeed and seen are their dodger's speed and the chance it sees a throw coming.
// circleSeconds is how long a circle keeps a dodger safe (for both teams). items is how many bottle caps are
// scattered in Gather (never fewer than 10). In All Man Yone the level sets the neutral throwers and the
// computer team; your teammates always play at Normal.
export const LEVELS: Record<Level, { label: string; ballSpeed: number; throwerSpeed: number; windup: readonly [number, number]; reaction: readonly [number, number]; aimError: number; leadChance: number; dodgerSpeed: number; seen: number; circleSeconds: number; items: number }> = {
  easy: { label: "Easy", ballSpeed: 380, throwerSpeed: 150, windup: [0.7, 1.2], reaction: [0.5, 0.75], aimError: 0.13, leadChance: 0.45, dodgerSpeed: 185, seen: 0.45, circleSeconds: 8, items: 10 },
  normal: { label: "Normal", ballSpeed: 440, throwerSpeed: 175, windup: [0.45, 0.9], reaction: [0.3, 0.5], aimError: 0.08, leadChance: 0.7, dodgerSpeed: 210, seen: 0.6, circleSeconds: 6, items: 12 },
  hard: { label: "Hard", ballSpeed: 520, throwerSpeed: 200, windup: [0.3, 0.6], reaction: [0.18, 0.32], aimError: 0.045, leadChance: 0.85, dodgerSpeed: 225, seen: 0.75, circleSeconds: 5, items: 15 },
};

export const MODES: Record<Mode, { label: string; blurb: string }> = {
  classic: { label: "Classic", blurb: "Dodge in the middle for as long as you can. Every throw you dodge scores a point." },
  round24: { label: "Round of 24", blurb: "Run the circles 1, 2, 3, 4 and round again. You are only safe in the circle you last reached, and not for long. Round 24 ends in the middle." },
  gather: { label: "Gather", blurb: "Bottle caps are scattered all over the field. Pick them up one at a time and bring every one to the small circle in the middle, without being hit." },
  allman: { label: "All Man Yone", blurb: "Both teams in the field together, everyone dodging the same ball. Last team standing wins the round; first to 2 rounds wins." },
};
