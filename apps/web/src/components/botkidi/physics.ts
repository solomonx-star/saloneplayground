import { FACE_DOWN_FACTOR, FIELD, LID_R, PHYSICS, SQUARE, WALL_Y } from "./settings";

// Bottle lids sliding on the yard: friction, the wall at the top, the edges of the yard, and lids clacking into
// each other. Pure and deterministic, so the computer player can try shots out before taking one.

export type Face = "up" | "down";
// `out`: picked up (not on the yard), for example a lid waiting to be thrown again, or one already home.
export type Lid = { player: number; x: number; y: number; vx: number; vy: number; face: Face; out: boolean };
export type Contact = { x: number; y: number; strength: number };

const speed = (l: Lid) => Math.hypot(l.vx, l.vy);
export const cloneLids = (lids: Lid[]) => lids.map((l) => ({ ...l }));
export const atRest = (lids: Lid[]) => lids.every((l) => l.out || (l.vx === 0 && l.vy === 0));
export const inSquare = (l: { x: number; y: number }) => l.x >= SQUARE.x0 && l.x <= SQUARE.x1 && l.y >= SQUARE.y0 && l.y <= SQUARE.y1;

// Advances every lid by one fixed step and reports the collisions that happened.
export function step(lids: Lid[], dt = PHYSICS.step): Contact[] {
  const contacts: Contact[] = [];
  const live = lids.filter((l) => !l.out);
  for (const l of live) {
    const s = speed(l);
    if (!s) continue;
    l.x += l.vx * dt; l.y += l.vy * dt;
    const slowed = s - (PHYSICS.friction + PHYSICS.drag * s) * dt;
    if (slowed <= PHYSICS.restSpeed) { l.vx = 0; l.vy = 0; } else { l.vx *= slowed / s; l.vy *= slowed / s; }
    if (l.y < WALL_Y + LID_R) { l.y = WALL_Y + LID_R; l.vy = Math.abs(l.vy) * PHYSICS.wallRestitution; contacts.push({ x: l.x, y: WALL_Y, strength: s }); }
    if (l.x < LID_R) { l.x = LID_R; l.vx = Math.abs(l.vx) * PHYSICS.edgeRestitution; }
    if (l.x > FIELD - LID_R) { l.x = FIELD - LID_R; l.vx = -Math.abs(l.vx) * PHYSICS.edgeRestitution; }
    if (l.y > FIELD - LID_R) { l.y = FIELD - LID_R; l.vy = -Math.abs(l.vy) * PHYSICS.edgeRestitution; }
  }
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]; const b = live[j];
    if (!a.vx && !a.vy && !b.vx && !b.vy) continue;
    const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy);
    if (d >= LID_R * 2 || d === 0) continue;
    const nx = dx / d; const ny = dy / d;
    const overlap = LID_R * 2 - d;
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2; b.y += ny * overlap / 2;
    const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (approach <= 0) continue;
    // Equal masses. A face-down lid takes less of the blow, the same as when it is hit with the stick.
    const impulse = (1 + PHYSICS.restitution) * approach / 2;
    const take = (l: Lid) => (l.face === "down" ? FACE_DOWN_FACTOR : 1);
    a.vx -= impulse * nx; a.vy -= impulse * ny;
    b.vx += impulse * nx * take(b); b.vy += impulse * ny * take(b);
    contacts.push({ x: a.x + nx * LID_R, y: a.y + ny * LID_R, strength: approach });
  }
  return contacts;
}

// Runs the yard until every lid stops (or a time limit passes) and returns the final positions.
export function settle(lids: Lid[], maxSeconds = 8) {
  const out = cloneLids(lids);
  for (let t = 0; t < maxSeconds && !atRest(out); t += PHYSICS.step) step(out);
  for (const l of out) { l.vx = 0; l.vy = 0; }
  return out;
}

// The lid's velocity when it is thrown or hit at `angle` (radians) with power 0..1. A face-down lid is harder to hit
// (only with Flat Side on: otherwise every lid is face-up).
export function hitVelocity(lid: Pick<Lid, "face">, angle: number, power: number) {
  const s = Math.max(0, Math.min(1, power)) * PHYSICS.maxSpeed * (lid.face === "down" ? FACE_DOWN_FACTOR : 1);
  return { vx: Math.cos(angle) * s, vy: Math.sin(angle) * s };
}
