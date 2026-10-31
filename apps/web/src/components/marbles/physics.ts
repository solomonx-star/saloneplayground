import { FIELD, PHYSICS } from "./settings";

// A small, deterministic marble physics: rolling friction, walls at the edge of the ground, and elastic
// collisions between circles. It is pure so the computer player can try shots out before taking one.

export type Ball = { id: number; x: number; y: number; vx: number; vy: number; r: number; kind: "target" | "shooter"; color: number };
export type Contact = { x: number; y: number; strength: number };

const mass = (b: Ball) => b.r * b.r;
const speed = (b: Ball) => Math.hypot(b.vx, b.vy);

export const cloneBalls = (balls: Ball[]) => balls.map((b) => ({ ...b }));
export const atRest = (balls: Ball[]) => balls.every((b) => b.vx === 0 && b.vy === 0);

// Advances every ball by one fixed step and reports the collisions that happened.
export function step(balls: Ball[], dt = PHYSICS.step): Contact[] {
  const contacts: Contact[] = [];
  for (const b of balls) {
    const s = speed(b);
    if (!s) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const slowed = s - (PHYSICS.friction + PHYSICS.drag * s) * dt;
    if (slowed <= PHYSICS.restSpeed) { b.vx = 0; b.vy = 0; } else { b.vx *= slowed / s; b.vy *= slowed / s; }
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * PHYSICS.wallRestitution; }
    if (b.x > FIELD - b.r) { b.x = FIELD - b.r; b.vx = -Math.abs(b.vx) * PHYSICS.wallRestitution; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * PHYSICS.wallRestitution; }
    if (b.y > FIELD - b.r) { b.y = FIELD - b.r; b.vy = -Math.abs(b.vy) * PHYSICS.wallRestitution; }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i]; const b = balls[j];
    if (!a.vx && !a.vy && !b.vx && !b.vy) continue;
    const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy);
    const reach = a.r + b.r;
    if (d >= reach || d === 0) continue;
    const nx = dx / d; const ny = dy / d;
    // Push the pair apart so they no longer overlap, the lighter ball moving further.
    const ma = mass(a); const mb = mass(b); const overlap = reach - d;
    a.x -= nx * overlap * mb / (ma + mb); a.y -= ny * overlap * mb / (ma + mb);
    b.x += nx * overlap * ma / (ma + mb); b.y += ny * overlap * ma / (ma + mb);
    const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (approach <= 0) continue;
    const impulse = (1 + PHYSICS.restitution) * approach / (1 / ma + 1 / mb);
    a.vx -= impulse / ma * nx; a.vy -= impulse / ma * ny;
    b.vx += impulse / mb * nx; b.vy += impulse / mb * ny;
    contacts.push({ x: a.x + nx * a.r, y: a.y + ny * a.r, strength: approach });
  }
  return contacts;
}

// Runs the table until everything stops (or a time limit passes) and returns the final positions.
export function settle(balls: Ball[], maxSeconds = 10) {
  const out = cloneBalls(balls);
  for (let t = 0; t < maxSeconds && !atRest(out); t += PHYSICS.step) step(out);
  return out;
}

// Velocity for a shot at `angle` (radians) with power 0..1.
export function shotVelocity(angle: number, power: number) {
  const s = Math.max(0, Math.min(1, power)) * PHYSICS.maxShotSpeed;
  return { vx: Math.cos(angle) * s, vy: Math.sin(angle) * s };
}
