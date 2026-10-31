import { describe, expect, it } from "vitest";
import { circleAt, dangerTime, dodgeStep, headingTo, incoming, interceptPoint, lapOf, nearestItem, pickMark, roundWinner, safeAt, scatter, shouldRun, standing, stepBall, targetCircle, throwVelocity, tuning, type Ball } from "./logic";
import { BALANCE, BOUNDS, CIRCLES, DODGE_ZONE, DROP, GATHER, LEFT_LINE, LEVELS, RIGHT_LINE } from "./settings";

const throwers = { left: { x: 110, y: 300 }, right: { x: 850, y: 300 } };

describe("Round of 24", () => {
  it("runs the circles 1, 2, 3, 4 in order and finishes round 24 in the middle", () => {
    expect([1, 2, 3, 4, 5, 6, 23].map(targetCircle)).toEqual([1, 2, 3, 4, 1, 2, 3]);
    expect(targetCircle(24)).toBe(0);
  });

  it("knows which circle a player stands in, and when they are out in the open", () => {
    expect(circleAt(CIRCLES[0])).toBe(0);
    expect(circleAt({ x: CIRCLES[2].x + 10, y: CIRCLES[2].y })).toBe(2);
    expect(circleAt({ x: 480, y: 165 })).toBeNull();
  });

  it("spaces the circles far apart, each run a long dash in the open, all inside the dodge zone", () => {
    for (let i = 1; i <= 4; i++) {
      const a = CIRCLES[i]; const b = CIRCLES[(i % 4) + 1];
      expect(Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r).toBeGreaterThan(280);
      expect(a.x - a.r).toBeGreaterThanOrEqual(DODGE_ZONE.left);
      expect(a.x + a.r).toBeLessThanOrEqual(DODGE_ZONE.right);
      expect(a.y - a.r).toBeGreaterThanOrEqual(DODGE_ZONE.top);
      expect(a.y + a.r).toBeLessThanOrEqual(DODGE_ZONE.bottom);
    }
  });

  it("keeps you safe only in your base circle, and only until its time runs out", () => {
    expect(safeAt(CIRCLES[2], 2, 1, 6)).toBe(true);
    expect(safeAt(CIRCLES[2], 2, 6, 6)).toBe(false);
    // A circle already run is no shelter.
    expect(safeAt(CIRCLES[1], 2, 1, 6)).toBe(false);
    expect(safeAt({ x: 480, y: 112 }, 2, 1, 6)).toBe(false);
  });

  it("counts six laps of four rounds", () => {
    expect([1, 4, 5, 8, 21, 24].map(lapOf)).toEqual([1, 1, 2, 2, 6, 6]);
  });
});

describe("levels", () => {
  it("make the computer team faster and sharper as the level goes up", () => {
    const [easy, normal, hard] = (["easy", "normal", "hard"] as const).map((level) => tuning(level, "classic", 1));
    expect(easy.ballSpeed).toBeLessThan(normal.ballSpeed);
    expect(normal.ballSpeed).toBeLessThan(hard.ballSpeed);
    expect(easy.throwerSpeed).toBeLessThan(hard.throwerSpeed);
    expect(easy.windup[0]).toBeGreaterThan(hard.windup[0]);
    expect(easy.aimError).toBeGreaterThan(hard.aimError);
    expect(easy.circleSeconds).toBeGreaterThan(hard.circleSeconds);
    expect(LEVELS.easy.dodgerSpeed).toBeLessThan(LEVELS.hard.dodgerSpeed);
  });

  it("sharpen the throwers lap by lap in Round of 24, but not in Classic", () => {
    const first = tuning("normal", "round24", 1); const last = tuning("normal", "round24", 24);
    expect(last.windup[0]).toBeLessThan(first.windup[0]);
    expect(last.reaction[0]).toBeLessThan(first.reaction[0]);
    expect(last.leadChance).toBeGreaterThan(first.leadChance);
    expect(last.ballSpeed).toBeGreaterThan(first.ballSpeed);
    expect(last.circleSeconds).toBeLessThan(first.circleSeconds);
    expect(tuning("hard", "round24", 24).circleSeconds).toBeGreaterThanOrEqual(BALANCE.minCircleSeconds);
    expect(tuning("normal", "classic", 24)).toEqual(tuning("normal", "classic", 1));
  });
});

describe("ball", () => {
  it("bounces off the side lines and stops once it reaches the far team", () => {
    const ball: Ball = { x: 300, y: BOUNDS.top + 20, vx: 300, vy: -300, live: true };
    let crossing = true;
    for (let i = 0; i < 400 && (crossing || ball.vx); i++) crossing = stepBall(ball, 1 / 60);
    expect(ball.x).toBeGreaterThan(RIGHT_LINE);
    expect(ball.vx).toBe(0);
    expect(ball.live).toBe(false);
    expect(ball.y).toBeGreaterThan(BOUNDS.top);
  });

  it("is always thrown towards the other end, never sideways or backwards", () => {
    const v = throwVelocity({ x: 110, y: 300 }, { x: 100, y: 50 }, "left");
    expect(v.x).toBeGreaterThan(0);
    expect(Math.atan2(Math.abs(v.y), v.x)).toBeLessThanOrEqual(BALANCE.maxThrowAngle + 1e-9);
    expect(throwVelocity({ x: 850, y: 300 }, { x: 480, y: 300 }, "right").x).toBeLessThan(0);
  });
});

describe("computer throwers", () => {
  it("lead a running dodger instead of throwing where they are now", () => {
    const aim = interceptPoint({ x: 110, y: 300 }, { x: 480, y: 300 }, { x: 0, y: 200 }, BALANCE.ballSpeed);
    expect(aim.y).toBeGreaterThan(400);
  });
});

describe("computer dodgers", () => {
  it("see a ball that is coming at them and step out of its line", () => {
    const ball: Ball = { x: 300, y: 300, vx: 440, vy: 0, live: true };
    expect(incoming(ball, { x: 420, y: 310 })).toBe(true);
    expect(incoming(ball, { x: 420, y: 400 })).toBe(false);
    expect(dodgeStep(ball, { x: 420, y: 310 })!.y).toBeGreaterThan(0);
  });

  it("make the run while the ball is flying away to the far end, and wait while it heads for the thrower beside their circle", () => {
    const from = CIRCLES[1]; const to = CIRCLES[2];
    const away: Ball = { x: 600, y: 300, vx: -BALANCE.ballSpeed, vy: 0, live: true };
    expect(shouldRun(from, to, dangerTime(to, away, null, throwers, 0), 0)).toBe(true);
    const towards: Ball = { ...away, vx: BALANCE.ballSpeed };
    expect(shouldRun(from, to, dangerTime(to, towards, null, throwers, 0), 0)).toBe(false);
  });

  it("wait in the circle while a thrower close by is ready to throw", () => {
    const from = CIRCLES[1]; const to = CIRCLES[2];
    const holder = { x: 760, y: 165 };
    expect(shouldRun(from, to, dangerTime(to, null, holder, throwers, 0), 0)).toBe(false);
  });

  it("move on when their time in the circle is nearly up", () => {
    expect(shouldRun(CIRCLES[1], CIRCLES[2], 0, LEVELS.normal.circleSeconds - 0.5)).toBe(true);
  });

  it("treat a ball that has stopped at the left end as the left team's ball", () => {
    const ball: Ball = { x: LEFT_LINE - 40, y: 300, vx: 0, vy: 0, live: false };
    expect(headingTo(ball)).toBe("left");
    expect(dangerTime({ x: 480, y: 300 }, ball, null, throwers, 0)).toBeGreaterThan(0);
  });
});

// A repeatable stand-in for Math.random.
function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

describe("Gather", () => {
  it("never scatters fewer than 10 caps, at any level", () => {
    for (const level of Object.values(LEVELS)) expect(level.items).toBeGreaterThanOrEqual(10);
  });

  it("scatters every cap inside the dodge zone, spread out and clear of the middle circle", () => {
    for (const seed of [1, 7, 42]) {
      const caps = scatter(LEVELS.hard.items, seeded(seed));
      expect(caps).toHaveLength(LEVELS.hard.items);
      for (const [i, c] of caps.entries()) {
        expect(c.x).toBeGreaterThan(DODGE_ZONE.left); expect(c.x).toBeLessThan(DODGE_ZONE.right);
        expect(c.y).toBeGreaterThan(DODGE_ZONE.top); expect(c.y).toBeLessThan(DODGE_ZONE.bottom);
        expect(Math.hypot(c.x - DROP.x, c.y - DROP.y)).toBeGreaterThanOrEqual(GATHER.clearOfDrop);
        for (const d of caps.slice(i + 1)) expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeGreaterThanOrEqual(GATHER.spacing);
      }
    }
  });

  it("still returns every cap when asked for more than fit comfortably", () => {
    expect(scatter(60, seeded(3))).toHaveLength(60);
  });

  it("sends a computer gatherer for a handy cap rather than one across the field", () => {
    const caps = [{ x: 720, y: 520 }, { x: 600, y: 300 }, { x: 250, y: 80 }];
    expect(nearestItem({ x: 560, y: 320 }, caps)).toBe(1);
    expect(nearestItem({ x: 560, y: 320 }, [])).toBe(-1);
  });
});

describe("All Man Yone", () => {
  it("counts who is still standing on each team", () => {
    expect(standing([false, true, false, true, true, false])).toEqual({ you: 2, them: 1 });
  });

  it("ends the round only when one team has no one left", () => {
    expect(roundWinner([false, true, true, false, true, true])).toBeNull();
    expect(roundWinner([false, true, true, true, true, true])).toBe("you");
    expect(roundWinner([true, true, true, false, false, true])).toBe("them");
  });

  it("has the neutral throwers go after a player who is still in, usually one close by", () => {
    const players = [{ x: 220, y: 300 }, { x: 700, y: 300 }, { x: 480, y: 300 }];
    expect(pickMark({ x: 110, y: 300 }, players, [true, false, false], () => 0)).toBe(2);
    expect(pickMark({ x: 110, y: 300 }, players, [false, false, false], () => 0)).toBe(0);
    expect(pickMark({ x: 110, y: 300 }, players, [true, true, true])).toBe(-1);
  });

  it("does not single out one team over many throws", () => {
    const random = seeded(11);
    const players = [{ x: 300, y: 150 }, { x: 660, y: 450 }, { x: 420, y: 300 }, { x: 540, y: 300 }];
    const picks = { you: 0, them: 0 };
    for (let i = 0; i < 400; i++) {
      const from = i % 2 ? { x: 110, y: 300 } : { x: 850, y: 300 };
      const pick = pickMark(from, players, [false, false, false, false], random);
      // Players 0 and 2 stand for one team, 1 and 3 for the other, mirrored across the field.
      if (pick === 0 || pick === 2) picks.you++; else picks.them++;
    }
    expect(Math.abs(picks.you - picks.them)).toBeLessThan(80);
  });
});
