import { describe, expect, it } from "vitest";
import { crossingSafe, nextLineFor, pickCrossing, thinkAttacker } from "./attackers";
import { goalOf, guardLine, guardMainLine } from "./defenders";
import { FIELD_W, LINES, MID, linesCrossed, type Body } from "./field";
import { LEVELS } from "./settings";
import type { World } from "./world";

function body(x: number, y: number, data: Record<string, unknown> = {}): Body {
  const store = new Map(Object.entries(data));
  return { x, y, active: true, getData: (key) => store.get(key), setData(key, value) { store.set(key, value); return this; } };
}

// Line defenders parked at the left edge, Main Line defender in the middle, normal level on both sides.
function makeWorld(overrides: Partial<World> = {}): World {
  const lineDefenders = LINES.map((lineY) => body(130, lineY, { lineY, homeX: 130 }));
  const mainDefender = overrides.mainDefender ?? body(MID, 300, { main: true });
  return {
    attackers: [],
    defenders: [...lineDefenders, mainDefender],
    mainDefender,
    humans: new Set(),
    aiTarget: null,
    attack: LEVELS.normal,
    defense: LEVELS.normal,
    now: 0,
    random: () => 0.5,
    ...overrides,
  };
}

const guardOf = (world: World, lineY: number) => world.defenders.find((d) => d.getData("lineY") === lineY)!;

describe("field", () => {
  it("counts lines crossed only in the direction of the run", () => {
    expect(linesCrossed(410, 400, 1)).toEqual([402]);
    expect(linesCrossed(300, 320, -1)).toEqual([312]);
    expect(linesCrossed(400, 410, 1)).toEqual([]);
    expect(linesCrossed(140, 60, 1)).toEqual([132]);
  });
});

describe("attackers", () => {
  it("finds the next defended line in the direction of travel", () => {
    expect(nextLineFor(body(200, 544, { direction: 1 }))).toBe(402);
    expect(nextLineFor(body(200, 177, { direction: 1 }))).toBe(132);
    expect(nextLineFor(body(200, 100, { direction: 1 }))).toBeNull();
    expect(nextLineFor(body(200, 87, { direction: -1 }))).toBe(132);
    expect(nextLineFor(body(200, 447, { direction: -1 }))).toBeNull();
  });

  it("only treats a crossing as safe when the guard is far enough away", () => {
    const world = makeWorld({ mainDefender: body(MID, 540, { main: true }) });
    const attacker = body(150, 447, { direction: 1 });
    guardOf(world, 402).x = 160;
    expect(crossingSafe(world, attacker, 402, attacker.x, 1)).toBe(false);
    guardOf(world, 402).x = FIELD_W - 50;
    expect(crossingSafe(world, attacker, 402, attacker.x, 1)).toBe(true);
  });

  it("needs a bigger gap when courage is higher", () => {
    const world = makeWorld({ mainDefender: body(MID, 540, { main: true }) });
    const attacker = body(100, 447, { direction: 1 });
    guardOf(world, 402).x = 200;
    expect(crossingSafe(world, attacker, 402, attacker.x, 1)).toBe(true);
    expect(crossingSafe(world, attacker, 402, attacker.x, 2)).toBe(false);
  });

  it("will not cross next to the Main Line while its defender is near that line", () => {
    const world = makeWorld({ mainDefender: body(MID, 400, { main: true }) });
    guardOf(world, 402).x = 40;
    expect(crossingSafe(world, body(MID + 20, 447, { direction: 1 }), 402, MID + 20, 1)).toBe(false);
  });

  it("picks a crossing point away from the guard and off the Main Line", () => {
    const attacker = body(140, 447, { direction: 1, seed: 0 });
    const world = makeWorld({ attackers: [attacker], mainDefender: body(MID, 540, { main: true }) });
    guardOf(world, 402).x = 140;
    const x = pickCrossing(world, attacker, 402);
    expect(Math.abs(x - 140)).toBeGreaterThanOrEqual(60);
    expect(Math.abs(x - MID)).toBeGreaterThanOrEqual(60);
  });

  it("eventually crosses when the guard leaves a gap", () => {
    const attacker = body(120, 447, { direction: 1 });
    const world = makeWorld({ attackers: [attacker], mainDefender: body(MID, 540, { main: true }) });
    guardOf(world, 402).x = FIELD_W - 50;
    for (let frame = 0; frame < 180 && attacker.y > 402; frame++) thinkAttacker(world, attacker, 1 / 60);
    expect(attacker.y).toBeLessThan(402);
  });

  it("waits instead of crossing into a guard that shadows it", () => {
    const attacker = body(120, 447, { direction: 1 });
    const world = makeWorld({ attackers: [attacker], mainDefender: body(MID, 540, { main: true }) });
    for (let frame = 0; frame < 120; frame++) {
      guardOf(world, 402).x = attacker.x;
      thinkAttacker(world, attacker, 1 / 60);
    }
    expect(attacker.y).toBeGreaterThan(402);
  });
});

describe("defenders", () => {
  it("lunges at an attacker who has committed to crossing its line", () => {
    const runner = body(300, 430, { direction: 1, mode: "cross", crossLine: 402, crossTo: { x: 300, y: 357 }, goal: { x: 300, y: 357 } });
    const world = makeWorld({ attackers: [runner] });
    const guard = guardOf(world, 402);
    const before = guard.x;
    guardLine(world, guard, 0.1);
    expect(guard.getData("intent")).toBe("lunge");
    expect(guard.getData("guardX")).toBeCloseTo(300, 0);
    expect(guard.x - before).toBeCloseTo(118 * LEVELS.normal.lunge * 0.1, 3);
  });

  it("stands between two waiting attackers that are far apart", () => {
    const left = body(80, 447, { direction: 1, targetX: 80 });
    const right = body(480, 447, { direction: 1, targetX: 480 });
    const world = makeWorld({ attackers: [left, right] });
    const guard = guardOf(world, 402);
    guardLine(world, guard, 0.016);
    const guardX = guard.getData("guardX") as number;
    expect(guard.getData("intent")).toBe("guard");
    expect(guardX).toBeGreaterThan(200);
    expect(guardX).toBeLessThan(360);
  });

  it("goes home when no attacker is coming to its line", () => {
    const world = makeWorld({ attackers: [body(100, 87, { direction: -1 })] });
    const guard = guardOf(world, 402);
    guardLine(world, guard, 0.016);
    expect(guard.getData("intent")).toBe("home");
    expect(guard.getData("guardX")).toBe(130);
  });

  it("sends the Main Line defender after an attacker who must pass the middle", () => {
    const passer = body(200, 357, { direction: 1, targetX: 400 });
    const farAway = body(60, 177, { direction: 1, targetX: 60 });
    const world = makeWorld({ attackers: [farAway, passer] });
    guardMainLine(world, world.mainDefender, 0.016);
    expect(world.mainDefender.getData("guardY")).toBe(357);
  });

  it("predicts where the human attacker is running", () => {
    const human = body(200, 400, { direction: 1, vel: { x: 0.6, y: -0.8 } });
    const world = makeWorld({ attackers: [human], humans: new Set([human]) });
    const goal = goalOf(world, human)!;
    expect(goal.y).toBe(72);
    expect(goal.x).toBeGreaterThan(200);
  });
});
