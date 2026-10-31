import { BALANCE, BOUNDS, CIRCLES, DODGE_ZONE, DROP, GATHER, LEFT_LINE, LEVELS, RIGHT_LINE, type Level, type Mode, type Point } from "./settings";

// Plain functions for Balance Ball: the ball's flight, the circles of Round of 24, the caps of Gather, who is
// left standing in All Man Yone, and the decisions of the computer throwers and dodgers. Kept free of Phaser so they can be tested.

export type Side = "left" | "right";
export type Ball = { x: number; y: number; vx: number; vy: number; live: boolean };
export type Tuning = { ballSpeed: number; throwerSpeed: number; windup: [number, number]; reaction: [number, number]; aimError: number; leadChance: number; circleSeconds: number };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const opposite = (side: Side): Side => (side === "left" ? "right" : "left");

// The circle a point is standing in (0 is the middle circle), or null when it is out in the open.
export function circleAt(p: Point): number | null {
  const index = CIRCLES.findIndex((c) => dist(p, c) <= c.r);
  return index < 0 ? null : index;
}

// The circle to reach for round `round` (1-based): 1, 2, 3, 4, 1, 2, … and the middle circle for the last round.
export function targetCircle(round: number): number {
  return round >= BALANCE.rounds ? 0 : ((round - 1) % 4) + 1;
}

// The lap a round belongs to: rounds 1–4 are lap 1, … and rounds 21–24 are lap 6.
export const lapOf = (round: number) => Math.ceil(clamp(round, 1, BALANCE.rounds) / 4);

// How the computer team throws at this level. In Round of 24 they get sharper every lap the runner completes,
// and circles keep a dodger safe for less time.
export function tuning(level: Level, mode: Mode, round: number): Tuning {
  const base = LEVELS[level];
  const laps = mode === "round24" ? lapOf(round) - 1 : 0;
  const ramp = BALANCE.lapRamp;
  const shrink = (k: number) => Math.max(0.4, 1 - k * laps);
  return {
    ballSpeed: base.ballSpeed * (1 + ramp.ballSpeed * laps),
    throwerSpeed: base.throwerSpeed,
    windup: [base.windup[0] * shrink(ramp.windup), base.windup[1] * shrink(ramp.windup)],
    reaction: [base.reaction[0] * shrink(ramp.reaction), base.reaction[1] * shrink(ramp.reaction)],
    aimError: base.aimError * shrink(ramp.aim),
    leadChance: Math.min(0.95, base.leadChance + ramp.lead * laps),
    circleSeconds: Math.max(BALANCE.minCircleSeconds, base.circleSeconds - ramp.circleSeconds * laps),
  };
}

// Round of 24: a dodger is safe only inside their base (the circle they last reached in order) and only until
// its time runs out. The clock keeps running if they step out, so stepping back in does not restart it, and
// circles already run do not count.
export function safeAt(p: Point, base: number, baseTime: number, circleSeconds: number): boolean {
  return circleAt(p) === base && baseTime < circleSeconds;
}

// Where to throw so the ball meets a runner moving at `velocity`, assuming they keep going. Falls back to
// the runner's current spot when they cannot be caught up with in time.
export function interceptPoint(from: Point, target: Point, velocity: Point, speed: number, maxSeconds = 1.6): Point {
  const dx = target.x - from.x; const dy = target.y - from.y;
  const a = velocity.x * velocity.x + velocity.y * velocity.y - speed * speed;
  const b = 2 * (dx * velocity.x + dy * velocity.y);
  const c = dx * dx + dy * dy;
  let t: number | null = null;
  if (Math.abs(a) < 1e-6) t = b ? -c / b : null;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter((r) => r > 0);
      t = roots.length ? Math.min(...roots) : null;
    }
  }
  if (t === null || t > maxSeconds) return target;
  return { x: target.x + velocity.x * t, y: target.y + velocity.y * t };
}

// Ball velocity for a throw from `from` towards `to`, bent if needed so it never goes more than the
// maximum angle off straight across. The ball always travels towards the other end.
export function throwVelocity(from: Point, to: Point, side: Side, speed = BALANCE.ballSpeed): Point {
  const forward = side === "left" ? 1 : -1;
  let angle = Math.atan2(to.y - from.y, (to.x - from.x) * forward);
  angle = clamp(angle, -BALANCE.maxThrowAngle, BALANCE.maxThrowAngle);
  return { x: Math.cos(angle) * speed * forward, y: Math.sin(angle) * speed };
}

// Moves the ball for dt seconds. It bounces off the side lines, and once it is past the far team's line it
// slows to a stop (or stops at the end line). Returns true while it is still crossing the field.
export function stepBall(ball: Ball, dt: number): boolean {
  const r = BALANCE.ballRadius;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  if (ball.y < BOUNDS.top + r) { ball.y = BOUNDS.top + r; ball.vy = Math.abs(ball.vy); }
  if (ball.y > BOUNDS.bottom - r) { ball.y = BOUNDS.bottom - r; ball.vy = -Math.abs(ball.vy); }
  const crossing = ball.vx > 0 ? ball.x < RIGHT_LINE : ball.vx < 0 ? ball.x > LEFT_LINE : false;
  if (crossing) return true;
  const speed = Math.hypot(ball.vx, ball.vy);
  const slowed = Math.max(0, speed - BALANCE.zoneFriction * dt);
  if (slowed === 0) { ball.vx = 0; ball.vy = 0; } else { ball.vx *= slowed / speed; ball.vy *= slowed / speed; }
  if (ball.x < BOUNDS.left + r || ball.x > BOUNDS.right - r) { ball.x = clamp(ball.x, BOUNDS.left + r, BOUNDS.right - r); ball.vx = 0; ball.vy = 0; }
  ball.live = false;
  return false;
}

// The side a ball is heading to; a ball that has stopped belongs to the end it stopped at.
export const headingTo = (ball: Ball): Side => (ball.vx ? (ball.vx > 0 ? "right" : "left") : ball.x < (LEFT_LINE + RIGHT_LINE) / 2 ? "left" : "right");

// Seconds before a throw could reach `spot`: the time for the ball to get to a thrower, for them to pick it
// up and wind up, and for the throw to fly there.
export function dangerTime(spot: Point, ball: Ball | null, holder: Point | null, throwers: Record<Side, Point>, windupLeft: number, ballSpeed = BALANCE.ballSpeed, windupMin = LEVELS.normal.windup[0]): number {
  const flight = (from: Point) => dist(from, spot) / ballSpeed;
  if (holder) return Math.max(0, windupLeft) + flight(holder);
  if (!ball) return Infinity;
  const receiver = throwers[headingTo(ball)];
  const line = ball.vx >= 0 ? RIGHT_LINE : LEFT_LINE;
  const arrive = ball.vx ? Math.max(0, (line - ball.x) / ball.vx) : 0;
  return arrive + BALANCE.pickupSeconds + windupMin + flight(receiver);
}

// Is a flying ball about to hit someone at `p`? True when it is coming their way and will pass within reach.
export function incoming(ball: Ball | null, p: Point, reach = 40): boolean {
  if (!ball || !ball.live) return false;
  const rx = p.x - ball.x; const ry = p.y - ball.y;
  const speed = Math.hypot(ball.vx, ball.vy) || 1;
  const along = (rx * ball.vx + ry * ball.vy) / speed;
  if (along <= 0 || along > 260) return false;
  const miss = Math.abs(rx * ball.vy - ry * ball.vx) / speed;
  return miss < reach;
}

// A sidestep direction away from an incoming ball's line, or null when there is nothing to dodge.
export function dodgeStep(ball: Ball | null, p: Point): Point | null {
  if (!incoming(ball, p)) return null;
  const speed = Math.hypot(ball!.vx, ball!.vy) || 1;
  const px = -ball!.vy / speed; const py = ball!.vx / speed;
  const side = Math.sign((p.x - ball!.x) * px + (p.y - ball!.y) * py) || 1;
  return { x: px * side, y: py * side };
}

// Round of 24: should a computer dodger standing in a circle make the run to the next one now?
// It goes when it can get there before any throw could, or when its time in the circle is nearly up.
export function shouldRun(from: Point, target: Point, danger: number, circleTime: number, courage = 1, circleSeconds = LEVELS.normal.circleSeconds, speed = BALANCE.dodgerSpeed): boolean {
  if (circleTime > circleSeconds - 1.2) return true;
  const run = Math.max(0, dist(from, target) - 30) / speed;
  return run < danger * courage;
}

// ---- Gather ----

// Scatters `count` bottle caps over the dodge zone, spaced apart and clear of the middle circle. Spacing is
// relaxed a little if the field gets crowded, so it always returns `count` caps.
export function scatter(count: number, random: () => number = Math.random): Point[] {
  const caps: Point[] = [];
  const margin = 22;
  let spacing = GATHER.spacing;
  for (let tries = 0; caps.length < count; tries++) {
    if (tries > 0 && tries % 400 === 0) spacing *= 0.85;
    const p = { x: DODGE_ZONE.left + margin + random() * (DODGE_ZONE.right - DODGE_ZONE.left - margin * 2), y: DODGE_ZONE.top + margin + random() * (DODGE_ZONE.bottom - DODGE_ZONE.top - margin * 2) };
    if (dist(p, DROP) < GATHER.clearOfDrop) continue;
    if (caps.some((c) => dist(c, p) < spacing)) continue;
    caps.push(p);
  }
  return caps;
}

// The cap a computer dodger goes for: close to them, and not too far from the middle circle, so each trip is short.
export function nearestItem(from: Point, items: Point[]): number {
  let best = -1; let bestScore = Infinity;
  items.forEach((item, i) => {
    const score = dist(from, item) + dist(item, DROP) * 0.5;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

// ---- All Man Yone ----

// How many players each team still has standing. `out` lists every player, your team first.
export function standing(out: boolean[], perTeam = BALANCE.players) {
  return { you: out.slice(0, perTeam).filter((o) => !o).length, them: out.slice(perTeam).filter((o) => !o).length };
}

// The team that has won the round (the other has no one left), or null while both still have players in.
export function roundWinner(out: boolean[], perTeam = BALANCE.players): "you" | "them" | null {
  const left = standing(out, perTeam);
  return left.you === 0 ? "them" : left.them === 0 ? "you" : null;
}

// Who a neutral thrower goes after: a player still in, usually one of the closest, with some randomness so no
// team is singled out.
export function pickMark(from: Point, players: Point[], out: boolean[], random: () => number = Math.random): number {
  let best = -1; let bestScore = Infinity;
  players.forEach((p, i) => {
    if (out[i]) return;
    const score = dist(from, p) + random() * 220;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}
