import { clamp, FIELD_W, HOME_LINE, LINES, MID, TOUCH_RADIUS, TURN_LINE, type Body, type Point } from "./field";
import { TOUCH } from "./settings";
import type { World } from "./world";

// Each computer attacker works one line at a time: wait in the space between lines, slide sideways to find a gap, and
// only dash across when that line's defender is too far away to make the touch. Line defenders cannot leave their line,
// so only the Main Line defender can reach a waiting attacker.

// The next defended line in the attacker's direction of travel, or null when only the turn line or home is ahead.
export function nextLineFor(a: Body) {
  return a.getData("direction") !== -1
    ? [...LINES].reverse().find((lineY) => a.y > lineY + 4) ?? null
    : LINES.find((lineY) => a.y < lineY - 4) ?? null;
}

// Whether an attacker at its current distance from `line` can dash across at `x` before that line's defender gets there.
// A courage above 1 asks for a margin on top of the bare timing.
export function crossingSafe(world: World, a: Body, line: number, x: number, courage: number) {
  if (Math.abs(x - MID) < 55 && Math.abs(world.mainDefender.y - line) < 120) return false;
  const guard = world.defenders.find((defender) => defender.getData("lineY") === line);
  if (!guard) return true;
  const gap = Math.abs(guard.x - x) - TOUCH_RADIUS;
  if (gap <= 0) return false;
  const guardSpeed = !world.humanAttacks && guard === world.selected ? TOUCH.humanSpeed * 0.8 : TOUCH.defenderSpeed * world.defense.speed;
  const attackerTime = (Math.abs(a.y - line) + 28) / (TOUCH.attackerSpeed * world.attack.speed * TOUCH.dashMultiplier);
  return gap / guardSpeed > attackerTime * courage;
}

// Where along `line` this attacker should try to cross.
export function pickCrossing(world: World, a: Body, line: number) {
  const guard = world.defenders.find((defender) => defender.getData("lineY") === line);
  const seed = (a.getData("seed") as number | null) ?? 0;
  const others = world.attackers.filter((other) => other !== a);
  let best = a.x; let bestScore = -Infinity;
  for (let x = 60; x <= FIELD_W - 60; x += 30) {
    if (Math.abs(x - MID) < 60) continue;
    // Prefer gaps far from the guard and close to hand, with a personal bias so attackers do not all pick the same spot.
    let score = (guard ? Math.min(Math.abs(x - guard.x), 400) : 400) - Math.abs(x - a.x) * 0.55 + Math.sin(x * 0.04 + seed) * 35;
    if ((x - MID) * (a.x - MID) < 0 && Math.abs(world.mainDefender.y - a.y) < 110) score -= 500;
    for (const other of others) if (Math.abs(other.y - a.y) < 60 && Math.abs(other.x - x) < 70) score -= 90;
    if (score > bestScore) { bestScore = score; best = x; }
  }
  return best;
}

// Moves an attacker toward a point without stepping onto the Main Line while its defender is close. Returns true on arrival.
export function stepAttacker(world: World, a: Body, tx: number, ty: number, step: number) {
  const dx = tx - a.x; const dy = ty - a.y; const distance = Math.hypot(dx, dy);
  if (distance < 1) return true;
  const move = Math.min(step, distance);
  let nx = a.x + dx / distance * move;
  const ny = a.y + dy / distance * move;
  if (Math.abs(nx - MID) < 40 && Math.abs(nx - MID) < Math.abs(a.x - MID) && Math.abs(world.mainDefender.y - ny) < 85) nx = a.x;
  a.x = clamp(nx, 44, FIELD_W - 44);
  a.y = ny;
  return distance <= step;
}

export function thinkAttacker(world: World, a: Body, dt: number) {
  const step = TOUCH.attackerSpeed * world.attack.speed * dt;
  if (a.getData("courage") == null) {
    const [low, high] = world.attack.courage;
    a.setData("courage", low + world.random() * (high - low));
    a.setData("seed", world.random() * 100);
  }
  const up = a.getData("direction") !== -1;
  const main = world.mainDefender;
  if (Math.hypot(a.x - main.x, a.y - main.y) < 75) {
    a.setData("mode", "hold"); a.setData("think", 0);
    stepAttacker(world, a, a.x + (a.x >= MID ? 60 : -60), a.y, step * 1.2);
    return;
  }
  if (a.getData("mode") === "cross") {
    const to = a.getData("crossTo") as Point;
    const crossLine = a.getData("crossLine") as number;
    const before = up ? a.y > crossLine + 10 : a.y < crossLine - 10;
    // Turn back if the defender closes the gap before the attacker reaches the line.
    if (before && !crossingSafe(world, a, crossLine, a.x, 0.85)) { a.setData("mode", "hold"); a.setData("think", 0); }
    else {
      a.setData("goal", to);
      if (stepAttacker(world, a, to.x, to.y, step * TOUCH.dashMultiplier)) { a.setData("mode", "hold"); a.setData("think", 0); }
      return;
    }
  }
  const line = nextLineFor(a);
  if (line === null) {
    // Only an undefended line is ahead: the turn line at the top, or home at the start line.
    const to = { x: a.x, y: up ? TURN_LINE - 6 : HOME_LINE + 8 };
    a.setData("goal", to);
    stepAttacker(world, a, to.x, to.y, step * 1.1);
    return;
  }
  const holdY = up ? line + 45 : line - 45;
  const beyondY = up ? line - 45 : line + 45;
  const holdTime = ((a.getData("holdTime") as number | null) ?? 0) + dt;
  let think = ((a.getData("think") as number | null) ?? 0) - dt;
  let targetX = (a.getData("targetX") as number | null) ?? a.x;
  if (think <= 0) { targetX = pickCrossing(world, a, line); think = 0.25 + world.random() * 0.45; }
  a.setData("holdTime", holdTime); a.setData("think", think); a.setData("targetX", targetX); a.setData("mode", "hold");
  a.setData("goal", { x: targetX, y: beyondY });
  stepAttacker(world, a, targetX, holdY, step);
  // Waiting makes an attacker bolder, so a defender cannot freeze them forever.
  const courage = Math.max(0.75, (a.getData("courage") as number) - holdTime * world.attack.impatience);
  if (Math.abs(a.y - holdY) < 8 && crossingSafe(world, a, line, a.x, courage)) {
    a.setData("mode", "cross"); a.setData("crossLine", line); a.setData("holdTime", 0);
    a.setData("crossTo", { x: clamp(a.x + (targetX - a.x) * 0.3, 44, FIELD_W - 44), y: beyondY });
  }
}

export function moveComputerAttackers(world: World, dt: number, excluded?: Body) {
  for (const attacker of world.attackers) if (attacker !== excluded) thinkAttacker(world, attacker, dt);
}

// Starting lane with the most room from the defenders.
export function chooseOpenLane(world: World) {
  const clearance = (x: number) => Math.min(...world.defenders.map((defender) => defender.getData("main") ? Math.abs(x - MID) : Math.abs(x - defender.x)));
  const options = [70, 140, 210, FIELD_W - 210, FIELD_W - 140, FIELD_W - 70];
  return options.sort((a, b) => clearance(b) - clearance(a))[0];
}
