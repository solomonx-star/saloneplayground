import { describe, expect, it } from "vitest";
import { HOME_LINE, LINES, TURN_LINE } from "./field";
import { TouchMatch, type TouchEvent } from "./match";
import { LEVELS, TOUCH } from "./settings";

// A small seeded random, so computer players make the same choices every run.
function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

function newMatch(count = 3) {
  return new TouchMatch({ count, tuning: [LEVELS.normal, LEVELS.normal], random: seeded(7) });
}

function run(match: TouchMatch, frames: number, until?: (event: TouchEvent) => boolean) {
  const events: TouchEvent[] = [];
  for (let i = 0; i < frames; i++) {
    const step = match.step(16);
    events.push(...step);
    if (until && step.some(until)) break;
  }
  return events;
}

describe("touch match", () => {
  it("gives each person a player on their side: attackers in order, defenders from the Main Line out", () => {
    const match = newMatch();
    match.join("a1", 0); match.join("a2", 0); match.join("d1", 1); match.join("d2", 1);
    match.begin();
    expect(match.phase).toBe("playing");
    expect(match.controllers.get("a1")!.body).toBe(match.attackers[0]);
    expect(match.controllers.get("a2")!.body).toBe(match.attackers[1]);
    expect(match.controllers.get("d1")!.body).toBe(match.mainDefender);
    expect(match.controllers.get("d2")!.body!.getData("lineY")).toBe(LINES[0]);
    // People's attackers have no computer route.
    expect(match.attackers[0].getData("goal")).toBeNull();
    expect(match.attackers[2].getData("goal")).not.toBeNull();
  });

  it("lets a person switch only to a player nobody else controls", () => {
    const match = newMatch();
    match.join("d1", 1); match.join("d2", 1);
    match.begin();
    const line1 = match.controllers.get("d2")!.body!;
    expect(match.control("d1", line1)).toBe(false);
    expect(match.control("d1", match.attackers[0])).toBe(false);
    expect(match.switchNext("d1")).toBe(true);
    const taken = match.controllers.get("d1")!.body!;
    expect(taken).not.toBe(line1);
    expect(taken).not.toBe(match.mainDefender);
  });

  it("does not hand over players before the run starts", () => {
    const match = newMatch();
    match.join("d1", 1);
    expect(match.switchNext("d1")).toBe(false);
  });

  it("moves line defenders only along their line and the Main Line defender only along the Main Line", () => {
    const match = newMatch();
    match.join("d1", 1);
    match.begin();
    const main = match.mainDefender;
    const x = main.x;
    match.setInput("d1", { x: 1, y: 1, sprint: false });
    run(match, 10);
    expect(main.x).toBe(x);
    expect(main.y).toBeGreaterThan(300);
  });

  it("scores lines on the way up and down, and the home run, for the attacking team", () => {
    const match = newMatch(1);
    match.join("a1", 0);
    match.begin();
    const runner = match.attackers[0];
    // Keep the defenders out of the way.
    for (const defender of match.defenders) { defender.x = 44; defender.y = defender.getData("lineY") as number ?? 300; }
    match.mainDefender.y = 518;
    runner.x = 520;
    // Run in strides short enough for the match to see every line go by.
    const runTo = (y: number) => {
      const events: TouchEvent[] = [];
      while (Math.abs(runner.y - y) > 1) { runner.y += Math.sign(y - runner.y) * Math.min(30, Math.abs(y - runner.y)); events.push(...match.step(16)); }
      return events;
    };
    runTo(TURN_LINE - 2);
    expect(match.score[0]).toBe(LINES.length * TOUCH.linePoints);
    const events = runTo(HOME_LINE + 2);
    expect(events.filter((event) => event.type === "line")).toHaveLength(LINES.length);
    expect(events.at(-1)).toMatchObject({ type: "home", team: 0 });
    expect(match.score).toEqual([LINES.length * TOUCH.linePoints * 2 + TOUCH.homePoints, 0]);
    expect(match.phase).toBe("stopped");
    // A home run keeps the same team attacking.
    match.begin();
    expect(match.attacking).toBe(0);
  });

  it("plays a touch out in slow motion, then changes sides", () => {
    const match = newMatch();
    match.join("a1", 0);
    match.begin();
    const runner = match.attackers[0];
    runner.x = match.mainDefender.x; runner.y = match.mainDefender.y + 5;
    const touch = match.step(16).find((event) => event.type === "touch");
    expect(touch).toMatchObject({ type: "touch", attacker: runner, defender: match.mainDefender });
    expect(match.phase).toBe("slowmo");
    const events = run(match, Math.ceil(TOUCH.slowMoMs / 16) + 1);
    expect(events.find((event) => event.type === "turnOver")).toMatchObject({ over: false });
    expect(match.phase).toBe("stopped");
    expect(match.turn).toBe(2);
    expect(match.attacking).toBe(1);
    // The person now defends, from the Main Line.
    match.begin();
    expect(match.controllers.get("a1")!.body).toBe(match.mainDefender);
  });

  it("ends after the last turn", () => {
    const match = newMatch();
    match.begin();
    match.turn = match.totalTurns;
    match.attackers[0].x = match.mainDefender.x; match.attackers[0].y = match.mainDefender.y;
    const events = run(match, 100, (event) => event.type === "turnOver");
    expect(events.at(-1)).toMatchObject({ type: "turnOver", over: true });
    expect(match.phase).toBe("over");
    expect(match.begin()).toBe(false);
  });

  it("keeps every computer player on the field through a minute of play", () => {
    const match = newMatch(4);
    match.begin();
    run(match, 60 * 60, (event) => event.type === "home" || event.type === "turnOver");
    for (const player of [...match.attackers, ...match.defenders]) {
      expect(player.x).toBeGreaterThanOrEqual(42); expect(player.x).toBeLessThanOrEqual(518);
      expect(player.y).toBeGreaterThanOrEqual(44); expect(player.y).toBeLessThanOrEqual(556);
    }
  });

  it("sprints until stamina runs out", () => {
    const match = newMatch();
    match.join("a1", 0);
    match.begin();
    match.setInput("a1", { x: 1, y: 0, sprint: true });
    match.step(16);
    const controller = match.controllers.get("a1")!;
    expect(controller.sprinting).toBe(true);
    controller.stamina = 0.001;
    match.step(16);
    match.step(16);
    expect(controller.sprinting).toBe(false);
  });
});
