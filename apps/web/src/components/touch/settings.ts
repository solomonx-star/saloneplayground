// All Touch balance numbers live here. Speeds are in game pixels per second.
export const TOUCH = {
  fieldWidth: 560,
  humanSpeed: 205,
  attackerSpeed: 120,
  dashMultiplier: 1.3,
  defenderSpeed: 118,
  mainDefenderMultiplier: 1.25,
  baitDistance: 95,
  baitCooldownMs: 2500,
  baitLengthMs: 700,
  turnsPerTeam: 3,
  // Sprint for the player you control. Stamina runs from 0 to 1: sprinting uses sprintDrain per second, resting
  // regains sprintRegen per second, and a new sprint needs at least sprintMinimum.
  sprintMultiplier: 1.5,
  sprintDrain: 0.9,
  sprintRegen: 0.3,
  sprintMinimum: 0.2,
  // Scoring: points for each defended line crossed in the direction of the run, and for a safe return home.
  linePoints: 1,
  homePoints: 5,
  // A touch plays out in slow motion for slowMoMs, at slowMoScale of normal speed, before the sides change.
  slowMoMs: 650,
  slowMoScale: 0.25,
};

export type Level = "easy" | "normal" | "hard";

// How strong a computer-controlled side plays. The level applies to the opposing team; the player's own
// computer teammates always play at "normal".
// - speed: multiplier on running speed
// - lunge: how much faster a defender moves when an attacker commits to crossing
// - baitRate: chance per second that a defender fakes a gap to tempt a crossing
// - courage: range of safety margins an attacker needs before crossing (higher waits for a bigger gap)
// - impatience: how quickly a waiting attacker's safety margin shrinks, per second
export type SideTuning = { label: string; speed: number; lunge: number; baitRate: number; courage: [number, number]; impatience: number };

export const LEVELS: Record<Level, SideTuning> = {
  easy: { label: "Easy", speed: 0.85, lunge: 1.15, baitRate: 0.15, courage: [0.85, 1.2], impatience: 0.2 },
  normal: { label: "Normal", speed: 1, lunge: 1.35, baitRate: 0.5, courage: [1.15, 1.7], impatience: 0.12 },
  hard: { label: "Hard", speed: 1.12, lunge: 1.5, baitRate: 0.8, courage: [1.25, 1.6], impatience: 0.1 },
};
