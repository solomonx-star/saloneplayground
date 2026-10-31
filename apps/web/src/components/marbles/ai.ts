import { cloneBalls, settle, shotVelocity, type Ball } from "./physics";
import { edgePoint, insideRing, makeShooter, type Player, type Point } from "./rules";
import { CENTER, LEVELS, type Level } from "./settings";

export type Shot = { from: Point; angle: number; power: number };

const EDGE_ANGLES = 12;
const POWERS = [0.65, 1];
// From each starting point only the nearest marbles are tried; the far ones are rarely the best shot.
const NEAREST = 5;
// Aim slightly off-centre on a marble as well as dead on, to cut it towards the nearest edge.
const CUTS = [-0.45, 0, 0.45];

// Tries candidate shots in the physics model and keeps the one that knocks out the most marbles,
// preferring shots that leave the shooter inside the ring for another go. The level then adds a human wobble.
export function chooseShot(table: Ball[], player: Player, fromEdge: boolean, shooterAt: Point | null, level: Level, random: () => number = Math.random): Shot {
  const targets = table.filter((b) => b.kind === "target" && insideRing(b));
  const starts = fromEdge || !shooterAt
    ? Array.from({ length: EDGE_ANGLES }, (_, i) => {
      const a = (i / EDGE_ANGLES) * Math.PI * 2;
      return edgePoint({ x: CENTER.x + Math.cos(a), y: CENTER.y + Math.sin(a) });
    })
    : [shooterAt];
  let best: Shot | null = null;
  let bestScore = -Infinity;
  for (const from of starts) {
    const nearest = targets
      .map((target) => ({ target, d: Math.hypot(target.x - from.x, target.y - from.y) }))
      .sort((a, b) => a.d - b.d).slice(0, NEAREST).map((t) => t.target);
    for (const target of nearest) {
      const base = Math.atan2(target.y - from.y, target.x - from.x);
      const dist = Math.hypot(target.x - from.x, target.y - from.y);
      for (const cut of CUTS) {
        const angle = base + Math.asin(Math.max(-1, Math.min(1, (cut * target.r * 2) / dist)));
        for (const power of POWERS) {
          const score = scoreShot(table, player, { from, angle, power });
          if (score > bestScore) { bestScore = score; best = { from, angle, power }; }
        }
      }
    }
  }
  const shot = best ?? { from: starts[0], angle: Math.atan2(CENTER.y - starts[0].y, CENTER.x - starts[0].x), power: 0.8 };
  const { aimError, powerError } = LEVELS[level];
  return {
    from: shot.from,
    angle: shot.angle + (random() * 2 - 1) * aimError,
    power: Math.min(1, Math.max(0.2, shot.power * (1 + (random() * 2 - 1) * powerError))),
  };
}

// 100 points per marble knocked out, plus a bonus when the shooter stays in the ring to shoot again.
export function scoreShot(table: Ball[], player: Player, shot: Shot) {
  const shooter = { ...makeShooter(player, shot.from), ...shotVelocity(shot.angle, shot.power) };
  const before = cloneBalls(table.filter((b) => b.kind === "target"));
  const after = settle([...before, shooter]);
  const wasIn = new Set(before.filter(insideRing).map((b) => b.id));
  const knocked = after.filter((b) => b.kind === "target" && wasIn.has(b.id) && !insideRing(b)).length;
  const stays = insideRing(after.find((b) => b.kind === "shooter")!);
  return knocked * 100 + (knocked && stays ? 30 : 0);
}
