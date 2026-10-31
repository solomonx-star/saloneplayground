import { describe, expect, it } from "vitest";
import { circleAt, dangerTime, dodgeStep, headingTo, incoming, interceptPoint, shouldRun, stepBall, targetCircle, throwVelocity, type Ball } from "./logic";
import { BALANCE, BOUNDS, CIRCLES, LEFT_LINE, RIGHT_LINE } from "./settings";

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

  it("make the run while the ball is flying away to the far end", () => {
    const from = CIRCLES[1]; const to = CIRCLES[2];
    const away: Ball = { x: 600, y: 300, vx: BALANCE.ballSpeed, vy: 0, live: true };
    expect(shouldRun(from, to, dangerTime(to, away, null, throwers, 0), 0)).toBe(true);
  });

  it("wait in the circle while a thrower close by is ready to throw", () => {
    const from = CIRCLES[1]; const to = CIRCLES[2];
    const holder = { x: 760, y: 165 };
    expect(shouldRun(from, to, dangerTime(to, null, holder, throwers, 0), 0)).toBe(false);
  });

  it("move on when their time in the circle is nearly up", () => {
    expect(shouldRun(CIRCLES[1], CIRCLES[2], 0, BALANCE.circleSeconds - 0.5)).toBe(true);
  });

  it("treat a ball that has stopped at the left end as the left team's ball", () => {
    const ball: Ball = { x: LEFT_LINE - 40, y: 300, vx: 0, vy: 0, live: false };
    expect(headingTo(ball)).toBe("left");
    expect(dangerTime({ x: 480, y: 300 }, ball, null, throwers, 0)).toBeGreaterThan(0);
  });
});
