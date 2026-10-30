import type { Ball } from "./physics";
import { CENTER, CROSS_SPACING, EDGE_R, MARBLE_R, RING_R, SHOOTER_R, TARGETS } from "./settings";

// Rules for the ring game: knock marbles out of the ring to keep them. Knock one out and you shoot again
// (from where your shooter stopped, if it is still inside the ring); miss and the turn passes. Most marbles wins.

export type Point = { x: number; y: number };
export type Player = 0 | 1;
export type Match = { scores: [number, number]; current: Player; fromEdge: boolean; over: boolean };
export type ShotResult = { knocked: number[]; again: boolean; match: Match };

const GLASS = [0x7fd1c7, 0xf2c14e, 0xe86f68, 0x9b8cf2, 0x8fd16b, 0x5aa9e6, 0xf29bd0];
export const SHOOTER_COLORS = [0x69c6ef, 0xf29b68];

export const insideRing = (p: Point) => Math.hypot(p.x - CENTER.x, p.y - CENTER.y) <= RING_R;

// Thirteen marbles in a cross at the centre of the ring, as the game is usually set up.
export function setupTargets(): Ball[] {
  const spots: Point[] = [{ x: 0, y: 0 }];
  for (let k = 1; k <= 3; k++) spots.push({ x: k, y: 0 }, { x: -k, y: 0 }, { x: 0, y: k }, { x: 0, y: -k });
  return spots.slice(0, TARGETS).map((p, i) => ({
    id: i, kind: "target", r: MARBLE_R, vx: 0, vy: 0, color: GLASS[i % GLASS.length],
    x: CENTER.x + p.x * CROSS_SPACING, y: CENTER.y + p.y * CROSS_SPACING,
  }));
}

export function newMatch(first: Player = 0): Match {
  return { scores: [0, 0], current: first, fromEdge: true, over: false };
}

// The nearest place on the ring line to shoot from, so the shooter can be slid around the ring.
export function edgePoint(towards: Point): Point {
  const angle = Math.atan2(towards.y - CENTER.y, towards.x - CENTER.x);
  return { x: CENTER.x + Math.cos(angle) * EDGE_R, y: CENTER.y + Math.sin(angle) * EDGE_R };
}

export function makeShooter(player: Player, at: Point): Ball {
  return { id: 100 + player, kind: "shooter", r: SHOOTER_R, vx: 0, vy: 0, color: SHOOTER_COLORS[player], x: at.x, y: at.y };
}

// Scores a finished shot. `before` is the table when the shot was taken and `after` the table at rest.
export function resolveShot(match: Match, before: Ball[], after: Ball[]): ShotResult {
  const wasIn = new Set(before.filter((b) => b.kind === "target" && insideRing(b)).map((b) => b.id));
  const knocked = after.filter((b) => b.kind === "target" && wasIn.has(b.id) && !insideRing(b)).map((b) => b.id);
  const scores: [number, number] = [...match.scores];
  scores[match.current] += knocked.length;
  const remaining = after.filter((b) => b.kind === "target" && insideRing(b)).length;
  const total = scores[0] + scores[1] + remaining;
  // Over when the ring is empty or one player can no longer be caught.
  const over = remaining === 0 || scores[0] > total / 2 || scores[1] > total / 2;
  const shooter = after.find((b) => b.kind === "shooter");
  const again = knocked.length > 0 && !over;
  return {
    knocked,
    again,
    match: {
      scores,
      over,
      current: again || over ? match.current : (1 - match.current) as Player,
      fromEdge: !again || !shooter || !insideRing(shooter),
    },
  };
}
