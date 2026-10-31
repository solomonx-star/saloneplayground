import { HOME, HOME_RADIUS, LEVELS, SEEK, YARD, type Level } from "./settings";

// Computer hiders. Plain functions over plain data so the decisions can be tested without Phaser.

export type Point = { x: number; y: number };
export type HiderMode = "hidden" | "running" | "caught" | "safe";
export type Hider = { id: number; x: number; y: number; spot: Point; mode: HiderMode; think: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Would a hider win a straight race home? It compares its own run with the seeker's, with `nerve` as the
// head start it wants: 1.2 means it only goes if it would arrive with 20% of the seeker's time to spare.
export function canBeatSeekerHome(hider: Point, seeker: Point, level: Level) {
  const { hiderSpeed, nerve } = LEVELS[level];
  const hiderTime = Math.max(0, distance(hider, HOME) - HOME_RADIUS) / hiderSpeed;
  const seekerTime = Math.max(0, distance(seeker, HOME) - HOME_RADIUS) / (SEEK.seekerSpeed * SEEK.sprintMultiplier);
  return hiderTime * nerve < seekerTime;
}

// Advances one hider by dt seconds. Returns the event that happened this step, if any.
export function stepHider(hider: Hider, seeker: Point, level: Level, dt: number, random: () => number = Math.random): "spotted" | "dash" | "safe" | null {
  if (hider.mode === "hidden") {
    if (distance(hider, seeker) < SEEK.spotRadius) { hider.mode = "running"; return "spotted"; }
    hider.think -= dt;
    if (hider.think > 0) return null;
    hider.think = SEEK.thinkSeconds * (0.6 + random() * 0.8);
    if (canBeatSeekerHome(hider, seeker, level) && random() < LEVELS[level].boldness) { hider.mode = "running"; return "dash"; }
    return null;
  }
  if (hider.mode !== "running") return null;
  const toHome = { x: HOME.x - hider.x, y: HOME.y - hider.y };
  const homeLength = Math.hypot(toHome.x, toHome.y) || 1;
  let dx = toHome.x / homeLength; let dy = toHome.y / homeLength;
  // Swerve away from a nearby seeker, more sharply the closer it is, while still heading home.
  const gap = distance(hider, seeker);
  if (gap < SEEK.evadeRadius && gap > 0) {
    const weight = (1 - gap / SEEK.evadeRadius) * 1.4;
    dx += (hider.x - seeker.x) / gap * weight; dy += (hider.y - seeker.y) / gap * weight;
  }
  const length = Math.hypot(dx, dy) || 1;
  const step = LEVELS[level].hiderSpeed * dt;
  hider.x = clamp(hider.x + dx / length * step, YARD.left, YARD.right);
  hider.y = clamp(hider.y + dy / length * step, YARD.top, YARD.bottom);
  if (distance(hider, HOME) <= HOME_RADIUS) { hider.mode = "safe"; return "safe"; }
  return null;
}

// Chance per second that a hidden spot rustles. Hiders get jumpier as the seeker comes closer; empty spots
// rustle in the wind on harder levels as decoys.
export function rustleRate(occupied: boolean, seekerDistance: number, level: Level) {
  const { rustle, decoys } = LEVELS[level];
  if (!occupied) return decoys * 0.12;
  const nearness = clamp(1 - seekerDistance / 400, 0, 1);
  return rustle * (0.08 + nearness * 0.5);
}
