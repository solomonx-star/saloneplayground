import { describe, expect, it } from "vitest";
import { chooseShot, scoreShot } from "./ai";
import { settle, shotVelocity, step, type Ball } from "./physics";
import { edgePoint, insideRing, makeShooter, newMatch, resolveShot, setupTargets } from "./rules";
import { CENTER, EDGE_R, MARBLE_R, RING_R, TARGETS } from "./settings";

const marble = (id: number, x: number, y: number, vx = 0, vy = 0): Ball => ({ id, x, y, vx, vy, r: MARBLE_R, kind: "target", color: 0 });

describe("physics", () => {
  it("passes the speed on in a head-on hit between equal marbles", () => {
    const balls = [marble(0, 100, 100, 300, 0), marble(1, 100 + MARBLE_R * 2 + 1, 100)];
    for (let i = 0; i < 4; i++) step(balls);
    expect(balls[1].vx).toBeGreaterThan(250);
    expect(Math.abs(balls[0].vx)).toBeLessThan(30);
  });

  it("brings a rolling marble to rest", () => {
    const [ball] = settle([marble(0, 200, 360, 500, 0)]);
    expect(ball.vx).toBe(0);
    expect(ball.x).toBeGreaterThan(300);
  });

  it("keeps marbles on the ground with the edges as walls", () => {
    const [ball] = settle([marble(0, 700, 360, 900, 0)]);
    expect(ball.x).toBeLessThanOrEqual(720 - MARBLE_R);
  });
});

describe("rules", () => {
  it("sets up 13 marbles in a cross inside the ring", () => {
    const targets = setupTargets();
    expect(targets).toHaveLength(TARGETS);
    expect(targets.every(insideRing)).toBe(true);
  });

  it("puts the shooter on the ring line nearest to where the player points", () => {
    const p = edgePoint({ x: CENTER.x + 10, y: CENTER.y });
    expect(p.x).toBeCloseTo(CENTER.x + EDGE_R);
    expect(p.y).toBeCloseTo(CENTER.y);
  });

  it("scores knocked-out marbles and lets the player shoot again from inside the ring", () => {
    const before = [marble(0, CENTER.x + RING_R - 20, CENTER.y), marble(1, CENTER.x, CENTER.y)];
    const after = [marble(0, CENTER.x + RING_R + 30, CENTER.y), marble(1, CENTER.x, CENTER.y), makeShooter(0, { x: CENTER.x + 100, y: CENTER.y })];
    const result = resolveShot(newMatch(), before, after);
    expect(result.knocked).toEqual([0]);
    expect(result.match.scores).toEqual([1, 0]);
    expect(result.again).toBe(true);
    expect(result.match.fromEdge).toBe(false);
  });

  it("passes the turn after a miss", () => {
    const table = [marble(0, CENTER.x, CENTER.y)];
    const result = resolveShot(newMatch(), table, [...table, makeShooter(0, { x: CENTER.x + 50, y: CENTER.y })]);
    expect(result.again).toBe(false);
    expect(result.match.current).toBe(1);
    expect(result.match.fromEdge).toBe(true);
  });

  it("ends the match once one player has more than half the marbles", () => {
    const match = { ...newMatch(), scores: [6, 2] as [number, number] };
    const before = [marble(0, CENTER.x + RING_R - 5, CENTER.y), ...Array.from({ length: 4 }, (_, i) => marble(i + 1, CENTER.x, CENTER.y + i * 20))];
    const after = [marble(0, CENTER.x + RING_R + 40, CENTER.y), ...before.slice(1)];
    expect(resolveShot(match, before, after).match.over).toBe(true);
  });
});

describe("computer player", () => {
  it("knocks out a marble sitting near the ring line", () => {
    const table = [marble(0, CENTER.x + RING_R - 25, CENTER.y), marble(1, CENTER.x, CENTER.y)];
    const shot = chooseShot(table, 1, true, null, "hard", () => 0.5);
    expect(scoreShot(table, 1, shot)).toBeGreaterThanOrEqual(100);
  });

  it("finds a scoring shot into the starting cross", () => {
    const shot = chooseShot(setupTargets(), 1, true, null, "hard", () => 0.5);
    const shooter = { ...makeShooter(1, shot.from), ...shotVelocity(shot.angle, shot.power) };
    const after = settle([...setupTargets(), shooter]);
    expect(after.filter((b) => b.kind === "target" && !insideRing(b)).length).toBeGreaterThan(0);
  });
});
