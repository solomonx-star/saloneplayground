import { nextLineFor } from "./attackers";
import { clamp, EDGE, FIELD_W, HOME_LINE, LINES, MID, TURN_LINE, type Body, type Point } from "./field";
import { TOUCH } from "./settings";
import type { World } from "./world";

export type DefenderIntent = "home" | "guard" | "lunge" | "bait";

// A human-controlled attacker has no set route, so the defenders predict one from how that player is moving.
export function goalOf(world: World, player: Body): Point | null {
  const goal = (player.getData("goal") as Point | null | undefined) ?? null;
  if (goal || !world.humans.has(player)) return goal;
  const y = player.getData("direction") === -1 ? HOME_LINE : TURN_LINE;
  const vel = (player.getData("vel") as Point | undefined) ?? { x: 0, y: 0 };
  const towardGoal = vel.y !== 0 && Math.sign(vel.y) === Math.sign(y - player.y);
  const x = towardGoal ? player.x + vel.x / Math.abs(vel.y) * Math.abs(y - player.y) : player.x + vel.x * 120;
  return { x: clamp(x, EDGE, FIELD_W - EDGE), y };
}

// The first defended line between a player and where they are heading.
export function nextTrapLine(world: World, player: Body) {
  const goal = goalOf(world, player);
  if (!goal) return null;
  const returning = goal.y > player.y;
  const lines = returning ? LINES : [...LINES].reverse();
  return lines.find((lineY) => returning ? player.y < lineY && goal.y > lineY : player.y > lineY && goal.y < lineY) ?? null;
}

// Where a player's current route meets the horizontal line at lineY.
export function projectedX(world: World, player: Body, lineY: number) {
  const goal = goalOf(world, player);
  if (!goal || Math.abs(goal.y - player.y) < 1) return player.x;
  const ratio = clamp((lineY - player.y) / (goal.y - player.y), 0, 1);
  return clamp(player.x + (goal.x - player.x) * ratio, EDGE, FIELD_W - EDGE);
}

// Where a player's current route meets the Main Line.
export function projectedYAtMain(world: World, player: Body) {
  const goal = goalOf(world, player) as Point;
  if (Math.abs(goal.x - player.x) < 1) return player.y;
  const ratio = clamp((MID - player.x) / (goal.x - player.x), 0, 1);
  return player.y + (goal.y - player.y) * ratio;
}

// The line an attacker will cross next, whether they are already committed to the run, and where they are lining up.
export function attackerIntent(world: World, a: Body): { line: number | null; dashing: boolean; aimX: number } {
  if (world.humans.has(a)) {
    const line = nextLineFor(a);
    const vel = (a.getData("vel") as Point | undefined) ?? { x: 0, y: 0 };
    const towardLine = line !== null && vel.y !== 0 && Math.sign(vel.y) === Math.sign(line - a.y);
    return { line, dashing: towardLine && Math.abs(a.y - (line as number)) < 90, aimX: a.x };
  }
  const crossLine = a.getData("crossLine") as number | null | undefined;
  const before = crossLine != null && (a.getData("direction") !== -1 ? a.y > crossLine + 10 : a.y < crossLine - 10);
  const dashing = a.getData("mode") === "cross" && before;
  return { line: dashing ? (crossLine as number) : nextLineFor(a), dashing, aimX: (a.getData("targetX") as number | null) ?? a.x };
}

// A line defender guards its own line against every attacker heading for it: it lunges at a runner who has committed,
// otherwise covers the gap between waiting attackers, and now and then fakes a gap to tempt a crossing.
export function guardLine(world: World, d: Body, dt: number) {
  const lineY = d.getData("lineY") as number;
  let lunge: { x: number; dist: number } | null = null;
  const watch: { x: number; w: number }[] = [];
  for (const a of world.attackers) {
    const { line, dashing, aimX } = attackerIntent(world, a);
    if (line === lineY) {
      const dist = Math.abs(a.y - lineY);
      if (dashing) { if (!lunge || dist < lunge.dist) lunge = { x: projectedX(world, a, lineY), dist }; }
      else watch.push({ x: a.x * 0.6 + aimX * 0.4, w: (a === world.aiTarget ? 1.6 : 1) * (2 - Math.min(dist, 150) / 150) });
    } else if (line !== null && Math.abs(line - lineY) === 90 && (a.getData("direction") !== -1) === (lineY < line)) {
      // Attackers one line away: get into position before they arrive.
      watch.push({ x: a.x, w: 0.35 });
    }
  }
  const tuning = world.defense;
  let targetX = d.getData("homeX") as number;
  let speed = TOUCH.defenderSpeed * tuning.speed;
  let intent: DefenderIntent = "home";
  if (lunge) { targetX = lunge.x; speed *= tuning.lunge; intent = "lunge"; }
  else if (watch.length) {
    intent = "guard";
    const xs = watch.map((w) => w.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    const weighted = watch.reduce((sum, w) => sum + w.x * w.w, 0) / watch.reduce((sum, w) => sum + w.w, 0);
    // Attackers far apart: stand between them so none gets an easy gap. Close together: shadow the group.
    targetX = spread < 160 ? weighted : (Math.min(...xs) + Math.max(...xs)) / 2 * 0.6 + weighted * 0.4;
    const baitUntil = (d.getData("baitUntil") as number | null) ?? 0;
    if (watch.length === 1 && world.now > baitUntil + TOUCH.baitCooldownMs && Math.abs(d.x - watch[0].x) < 50 && world.random() < dt * tuning.baitRate) {
      d.setData("baitUntil", world.now + TOUCH.baitLengthMs); d.setData("baitSide", watch[0].x < MID ? 1 : -1);
    }
    if (world.now < ((d.getData("baitUntil") as number | null) ?? 0)) {
      targetX = watch[0].x + (d.getData("baitSide") as number) * TOUCH.baitDistance;
      intent = "bait";
    }
  }
  d.setData("guardX", targetX);
  d.setData("intent", intent);
  d.x = clamp(d.x + clamp(targetX - d.x, -speed * dt, speed * dt), EDGE, FIELD_W - EDGE);
}

// The Main Line defender patrols the centre: it hunts attackers who must pass the middle and pressures anyone waiting near it.
export function guardMainLine(world: World, d: Body, dt: number) {
  let targetY = world.attackers.reduce((sum, a) => sum + a.y, 0) / world.attackers.length;
  let best = 0.25;
  for (const a of world.attackers) {
    const { aimX } = attackerIntent(world, a);
    const passing = (a.x - MID) * (aimX - MID) <= 0;
    let score = passing ? 1.6 : Math.max(0, 1 - Math.abs(a.x - MID) / 220) * 1.4;
    score -= Math.abs(a.y - d.y) / 450;
    if (a === world.aiTarget) score += 0.4;
    if (score > best) { best = score; targetY = a.y; }
  }
  d.setData("guardY", targetY);
  d.setData("intent", "guard");
  const speed = TOUCH.defenderSpeed * world.defense.speed * TOUCH.mainDefenderMultiplier;
  d.y = clamp(d.y + clamp(targetY - d.y, -speed * dt, speed * dt), 52, 518);
}

// Every computer defender guards its own line, instead of all following one target.
export function moveComputerDefenders(world: World, dt: number) {
  for (const defender of world.defenders) {
    if (world.humans.has(defender)) continue;
    if (defender.getData("main")) guardMainLine(world, defender, dt);
    else guardLine(world, defender, dt);
  }
}

// How dangerous an attacker is right now: far along their run, with an open line and Main Line ahead.
export function threatScore(world: World, player: Body) {
  const goal = goalOf(world, player) as Point;
  const returning = goal.y > player.y;
  const progress = clamp(returning ? (player.y - TURN_LINE) / 420 : (HOME_LINE - player.y) / 420, 0, 1);
  const trapLine = nextTrapLine(world, player);
  let lineExposure = 0.5;
  if (trapLine !== null) {
    const lineDefender = world.defenders.find((defender) => defender.getData("lineY") === trapLine);
    if (lineDefender) lineExposure = clamp(Math.abs(projectedX(world, player, trapLine) - lineDefender.x) / 360, 0, 1);
  }
  let mainExposure = 0.65;
  if ((player.x - MID) * (goal.x - MID) <= 0) mainExposure = clamp(Math.abs(projectedYAtMain(world, player) - world.mainDefender.y) / 260, 0, 1);
  const approachingLine = trapLine === null ? 0 : 1 - clamp(Math.abs(player.y - trapLine) / 170, 0, 1);
  return progress * 1.6 + lineExposure * 1.15 + mainExposure * 0.9 + approachingLine * 0.35;
}

// The attacker the Main Line should mark: the most dangerous one that is on the move.
export function chooseComputerTarget(world: World) {
  const moving = world.attackers.filter((player) => {
    const goal = goalOf(world, player);
    return player.active !== false && goal !== null && Number.isFinite(goal.y) && goal.y !== player.y;
  });
  return moving.sort((a, b) => threatScore(world, b) - threatScore(world, a))[0] ?? null;
}
