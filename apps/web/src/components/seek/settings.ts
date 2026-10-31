// Tuning for Hide and Seek (Play Kech). Every number that changes how the game feels lives here.

export const FIELD_W = 960;
export const FIELD_H = 600;
export const HOME = { x: 480, y: 300 };
export const HOME_RADIUS = 43;
// The yard the players must stay inside.
export const YARD = { left: 58, right: 902, top: 58, bottom: 542 };

// Hiding spots: bushes, crates and long grass around the yard.
export const SPOTS = [
  { x: 150, y: 150, kind: "bush" }, { x: 310, y: 120, kind: "crate" }, { x: 640, y: 128, kind: "grass" }, { x: 810, y: 165, kind: "bush" },
  { x: 130, y: 420, kind: "crate" }, { x: 330, y: 470, kind: "grass" }, { x: 650, y: 465, kind: "bush" }, { x: 825, y: 420, kind: "crate" },
] as const;

export const SEEK = {
  hiders: 5,
  countSeconds: 5,
  seekerSpeed: 190,
  sprintMultiplier: 1.45,
  sprintDrain: 0.8,
  sprintRegen: 0.3,
  sprintMinimum: 0.2,
  // The seeker spots a hider within this distance, and catches a running one within catchRadius.
  spotRadius: 78,
  catchRadius: 26,
  // A running hider steers away from the seeker once it is this close.
  evadeRadius: 140,
  // How often a hidden hider reconsiders whether to sneak home, in seconds.
  thinkSeconds: 0.6,
};

export type Level = "easy" | "normal" | "hard";

// hiderSpeed: running speed. boldness: chance per think of sneaking home when the race looks winnable.
// nerve: how much head start a hider wants (higher is more cautious). rustle: how often hidden hiders give
// themselves away. decoys: how often empty spots rustle in the wind. seconds: length of a round.
export const LEVELS: Record<Level, { label: string; hiderSpeed: number; boldness: number; nerve: number; rustle: number; decoys: number; seconds: number }> = {
  easy: { label: "Easy", hiderSpeed: 140, boldness: 0.15, nerve: 1.5, rustle: 1.6, decoys: 0, seconds: 90 },
  normal: { label: "Normal", hiderSpeed: 165, boldness: 0.3, nerve: 1.2, rustle: 1, decoys: 0.25, seconds: 75 },
  hard: { label: "Hard", hiderSpeed: 185, boldness: 0.45, nerve: 1, rustle: 0.6, decoys: 0.5, seconds: 60 },
};
