import { describe, expect, it } from "vitest";
import { chooseShot, tryShot } from "./ai";
import { hitVelocity, inSquare, settle, type Lid } from "./physics";
import { lidToPlay, matchOver, newMatch, newRound, places, pointsFor, resolveShot, scoreRound, type Round } from "./rules";
import { FIELD, LINE_Y, SQUARE_CENTER, WALL_Y } from "./settings";

// A seeded random source, so the tests always play the same game.
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const at = (player: number, x: number, y: number, face: Lid["face"] = "up"): Lid => ({ player, x, y, vx: 0, vy: 0, face, out: false });
const homeX = SQUARE_CENTER.x;
const homeY = SQUARE_CENTER.y;

// Plays one shot the way the screen does: move the lid, let everything settle, apply the rules.
function play(round: Round, shot: { lineX: number; angle: number; power: number }, random = Math.random) {
  const lids = round.lids.map((l) => ({ ...l }));
  const lid = lidToPlay(round, shot.lineX);
  lids[round.target] = { ...lid, ...hitVelocity(lid, shot.angle, shot.power) };
  return resolveShot(round, round.lids, settle(lids), random);
}

describe("physics", () => {
  it("slides a lid to a stop, off the wall and inside the yard", () => {
    const [lid] = settle([{ ...at(0, 360, 400), ...hitVelocity({ face: "up" }, -Math.PI / 2, 1) }]);
    expect(lid.y).toBeGreaterThanOrEqual(WALL_Y);
    expect(lid.vx).toBe(0);
    const [far] = settle([{ ...at(0, 360, 300), ...hitVelocity({ face: "up" }, Math.PI / 2, 1) }]);
    expect(far.y).toBeLessThanOrEqual(FIELD);
  });

  it("sends a face-down lid less far than a face-up one (Flat Side)", () => {
    const go = (face: Lid["face"]) => settle([{ ...at(0, 360, 650), ...hitVelocity({ face }, -Math.PI / 2, 0.6) }])[0].y;
    expect(650 - go("down")).toBeLessThan((650 - go("up")) * 0.7);
  });
});

describe("rules", () => {
  it("makes the only lid thrown into the square the Hitter, who then hits every other lid away", () => {
    let round = newRound(3, { flatSide: false });
    round = resolveShot(round, round.lids, [at(0, homeX, homeY), round.lids[1], round.lids[2]]).round;
    expect(round.current).toBe(1);
    round = resolveShot(round, round.lids, [round.lids[0], at(1, 200, 400), round.lids[2]]).round;
    const result = resolveShot(round, round.lids, [round.lids[0], round.lids[1], at(2, 500, 300)]);
    expect(result.outcomes).toContainEqual({ kind: "throw-off", result: "hitter", players: [0] });
    expect(result.round).toMatchObject({ hitter: 0, phase: "whack", current: 0, target: 1, whackQueue: [2] });
  });

  it("has tied players throw again, and everyone throw again when nobody gets in", () => {
    let round = newRound(3, { flatSide: false });
    round = resolveShot(round, round.lids, [at(0, homeX - 20, homeY), round.lids[1], round.lids[2]]).round;
    round = resolveShot(round, round.lids, [round.lids[0], at(1, homeX + 20, homeY), round.lids[2]]).round;
    const tie = resolveShot(round, round.lids, [round.lids[0], round.lids[1], at(2, 100, 500)]);
    expect(tie.outcomes).toContainEqual({ kind: "throw-off", result: "tie", players: [0, 1] });
    expect(tie.round).toMatchObject({ phase: "throw", contenders: [0, 1], current: 0 });
    // Player 3 is out of the throw-off: their lid stays where it landed.
    expect(tie.round.lids[2]).toMatchObject({ x: 100, y: 500, out: false });

    let none = newRound(2, { flatSide: false });
    none = resolveShot(none, none.lids, [at(0, 100, 300), none.lids[1]]).round;
    const missed = resolveShot(none, none.lids, [none.lids[0], at(1, 600, 300)]);
    expect(missed.outcomes).toContainEqual({ kind: "throw-off", result: "none", players: [0, 1] });
    expect(missed.round.lids.every((l) => l.out)).toBe(true);
  });

  it("gives a miss to the Hitter to hit away again, and ends the round when every lid is in", () => {
    // Player 0 is the Hitter; players 1 and 2 are out on the yard, with the whacks done.
    let round: Round = { ...newRound(3, { flatSide: false }), hitter: 0, phase: "hit", current: 1, target: 1,
      lids: [{ ...at(0, homeX, homeY), out: true }, at(1, 200, 500), at(2, 500, 500)] };
    let r = resolveShot(round, round.lids, [round.lids[0], at(1, 220, 300), round.lids[2]]);
    expect(r.outcomes[0]).toEqual({ kind: "hit", player: 1, inSquare: false });
    expect(r.round).toMatchObject({ phase: "punish", current: 0, target: 1 });
    r = resolveShot(r.round, r.round.lids, [r.round.lids[0], at(1, 100, 650), r.round.lids[2]]);
    expect(r.round).toMatchObject({ phase: "hit", current: 2, target: 2 });
    r = resolveShot(r.round, r.round.lids, [r.round.lids[0], r.round.lids[1], at(2, homeX, homeY)]);
    expect(r.round).toMatchObject({ phase: "hit", current: 1, finished: [2] });
    round = r.round;
    r = resolveShot(round, round.lids, [round.lids[0], at(1, homeX + 10, homeY + 10), round.lids[2]]);
    expect(r.round.phase).toBe("done");
    expect(places(r.round)).toEqual([0, 2, 1]);
  });

  it("counts a lid knocked into the square by someone else's shot as home", () => {
    const round: Round = { ...newRound(3, { flatSide: false }), hitter: 0, phase: "hit", current: 1, target: 1,
      lids: [{ ...at(0, homeX, homeY), out: true }, at(1, 200, 500), at(2, 500, 500)] };
    const r = resolveShot(round, round.lids, [round.lids[0], at(1, 250, 400), at(2, homeX, homeY + 20)]);
    expect(r.outcomes).toContainEqual({ kind: "lucky", player: 2 });
    expect(r.round.finished).toEqual([2]);
  });

  it("turns lids that moved face-up or face-down only with Flat Side on", () => {
    const off = newRound(2, { flatSide: false });
    expect(resolveShot(off, off.lids, [at(0, 100, 300), off.lids[1]], () => 0).round.lids[0].face).toBe("up");
    const on = newRound(2, { flatSide: true });
    expect(resolveShot(on, on.lids, [at(0, 100, 300), on.lids[1]], () => 0).round.lids[0].face).toBe("down");
  });

  it("scores places over a match: the Hitter top, the last one in nothing", () => {
    expect([0, 1, 2].map((p) => pointsFor(p, 3))).toEqual([2, 1, 0]);
    const round: Round = { ...newRound(3, { flatSide: false }), hitter: 2, finished: [0, 1], phase: "done" };
    let match = scoreRound(newMatch(3, 2), round);
    expect(match.scores).toEqual([1, 0, 2]);
    expect(matchOver(match)).toBe(false);
    match = scoreRound(match, round);
    expect(matchOver(match)).toBe(true);
  });
});

describe("computer player", () => {
  it("gets a lid into the square from across the yard in a few tries on Hard", () => {
    const random = seeded(3);
    let made = 0;
    for (const [x, y] of [[150, 500], [600, 420], [360, 650], [90, 250], [640, 640]]) {
      const round: Round = { ...newRound(2, { flatSide: false }), hitter: 0, phase: "hit", current: 1, target: 1,
        lids: [{ ...at(0, homeX, homeY), out: true }, at(1, x, y)] };
      for (let tries = 0; tries < 3; tries++) {
        if (inSquare(tryShot(round, chooseShot(round, "hard", random)))) { made++; break; }
      }
    }
    expect(made).toBeGreaterThanOrEqual(4);
  });

  it("as the Hitter, sends a lid well away from the square", () => {
    const round: Round = { ...newRound(2, { flatSide: false }), hitter: 0, phase: "whack", current: 0, target: 1,
      lids: [{ ...at(0, homeX, homeY), out: true }, at(1, 360, 300)] };
    const lid = tryShot(round, chooseShot(round, "hard", seeded(5)));
    expect(Math.hypot(lid.x - homeX, lid.y - homeY)).toBeGreaterThan(400);
  });

  it("plays whole rounds to the end, every player a computer, with Flat Side on", () => {
    const random = seeded(11);
    for (const players of [2, 5]) {
      let round = newRound(players, { flatSide: true });
      let shots = 0;
      while (round.phase !== "done" && shots < 400) {
        round = play(round, chooseShot(round, "normal", random), random).round;
        shots++;
      }
      expect(round.phase).toBe("done");
      expect(places(round).sort()).toEqual(Array.from({ length: players }, (_, i) => i));
    }
  }, 60_000);

  it("throws from the line", () => {
    const round = newRound(2, { flatSide: false });
    const shot = chooseShot(round, "hard", seeded(2));
    expect(lidToPlay(round, shot.lineX).y).toBe(LINE_Y);
  });
});
