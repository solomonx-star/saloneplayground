import { describe, expect, it } from "vitest";
import { snakes } from "../online/games";
import { cellOf, jumpAt, LADDERS, SNAKES, SQUARES, WORST_SNAKE } from "./board";
import { canRoll, newSnakesMatch, rematch, rollDie, standIn } from "./match";
import { newGame, NO_RULES, roll, type Game, type Rules } from "./rules";

const at = (positions: number[], rules: Partial<Rules> = {}, turn = 0): Game => ({ ...newGame(positions.length, { ...NO_RULES, ...rules }), positions, turn });

describe("board", () => {
  it("runs from 1 at the bottom left, each row turning back the other way", () => {
    expect(cellOf(1)).toEqual({ row: 9, col: 0 });
    expect(cellOf(10)).toEqual({ row: 9, col: 9 });
    expect(cellOf(11)).toEqual({ row: 8, col: 9 });
    expect(cellOf(20)).toEqual({ row: 8, col: 0 });
    expect(cellOf(100)).toEqual({ row: 0, col: 0 });
  });

  it("has ladders going up and snakes going down, never two on a square and none chaining into another", () => {
    for (const l of LADDERS) expect(l.to).toBeGreaterThan(l.from);
    for (const s of SNAKES) expect(s.to).toBeLessThan(s.from);
    const starts = [...LADDERS, ...SNAKES].map((j) => j.from);
    expect(new Set(starts).size).toBe(starts.length);
    for (const j of [...LADDERS, ...SNAKES]) expect(jumpAt(j.to)).toBeNull();
    expect(starts).not.toContain(SQUARES);
    expect(starts).not.toContain(1);
  });
});

describe("rolling", () => {
  it("moves the token and passes the turn", () => {
    const { game, move } = roll(at([0, 0]), 3);
    expect(move).toMatchObject({ from: 0, path: [1, 2, 3], to: 3, jump: null, again: false });
    expect(game.positions).toEqual([3, 0]);
    expect(game.turn).toBe(1);
  });

  it("climbs ladders and slides down snakes", () => {
    const ladder = LADDERS[0];
    const up = roll(at([ladder.from - 2, 0]), 2);
    expect(up.move.jump?.kind).toBe("ladder");
    expect(up.game.positions[0]).toBe(ladder.to);
    const snake = SNAKES[0];
    const down = roll(at([snake.from - 1, 0]), 1);
    expect(down.move.jump?.kind).toBe("snake");
    expect(down.game.positions[0]).toBe(snake.to);
  });

  it("wins on reaching 100; without Exact Roll a roll past it still wins", () => {
    const { game, move } = roll(at([97, 5]), 6);
    expect(move).toMatchObject({ path: [98, 99, 100], to: 100, won: true });
    expect(game.winner).toBe(0);
    // Nothing more happens once the game is won.
    expect(roll(game, 4).game).toBe(game);
  });

  it("Exact Roll bounces back from 100", () => {
    const { move } = roll(at([97, 0], { exact: true }), 5);
    expect(move).toMatchObject({ path: [98, 99, 100, 99, 98], to: WORST_SNAKE.from === 98 ? WORST_SNAKE.to : 98, bounced: true, won: false });
    expect(roll(at([96, 0], { exact: true }), 4).move).toMatchObject({ to: 100, won: true, bounced: false });
  });

  it("Six Rolls Again gives another roll, and three 6s in a row end the turn without moving", () => {
    let game = at([0, 0], { sixAgain: true });
    let r = roll(game, 6);
    expect(r.move.again).toBe(true);
    expect(r.game.turn).toBe(0);
    r = roll(r.game, 6);
    expect(r.game.turn).toBe(0);
    const before = r.game.positions[0];
    r = roll(r.game, 6);
    expect(r.move).toMatchObject({ threeSixes: true, to: before, path: [] });
    expect(r.game.turn).toBe(1);
    expect(r.game.sixes).toBe(0);
    game = roll(at([0, 0]), 6).game;
    expect(game.turn).toBe(1);
  });

  it("Six to Start waits for a 6, which puts the token on square 1", () => {
    const wait = roll(at([0, 0], { sixStart: true }), 5);
    expect(wait.move).toMatchObject({ waiting: true, to: 0 });
    expect(wait.game.turn).toBe(1);
    const enter = roll(at([0, 0], { sixStart: true }), 6);
    expect(enter.move).toMatchObject({ path: [1], to: 1 });
    expect(enter.game.positions[0]).toBe(1);
  });

  it("Snake Bite sends a token on the worst snake right back to the start", () => {
    const from = WORST_SNAKE.from - 2;
    expect(roll(at([from, 0]), 2).game.positions[0]).toBe(WORST_SNAKE.to);
    const bitten = roll(at([from, 0], { bite: true }), 2);
    expect(bitten.move).toMatchObject({ bitten: true, to: 0 });
    // Any other snake works as usual.
    const other = SNAKES[0];
    expect(roll(at([other.from - 1, 0], { bite: true }), 1).game.positions[0]).toBe(other.to);
  });

  it("always finishes a game with random rolls and every house rule on", () => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const rules of [NO_RULES, { exact: true, sixAgain: true, sixStart: true, bite: true }]) {
      let match = newSnakesMatch(4, rules);
      for (let i = 0; i < 20000 && canRoll(match); i++) match = rollDie(match, 1 + Math.floor(random() * 6));
      expect(match.game.winner).not.toBeNull();
    }
  });
});

describe("the match", () => {
  it("records each roll as an event, keeps the die, and rematches with the same players and rules", () => {
    let match = newSnakesMatch(3, { ...NO_RULES, exact: true });
    match = rollDie(match, 4);
    expect(match.die).toBe(4);
    expect(match.seq).toBe(1);
    expect(match.events[0]).toMatchObject({ kind: "rolled", move: { player: 0, roll: 4 } });
    match = standIn(match, "away", 2);
    expect(match.events.map((e) => e.kind)).toEqual(["rolled", "stood-in", "rolled"]);
    const again = rematch(match);
    expect(again.game.positions).toEqual([0, 0, 0]);
    expect(again.game.rules.exact).toBe(true);
  });

  it("runs online: only the player to move may roll, the computer rolls, and a rematch waits for the end", () => {
    const options = snakes.options({ players: 3, rules: { sixStart: true, nonsense: true } }, snakes.defaultOptions);
    expect(options).toEqual({ players: 3, rules: { ...NO_RULES, sixStart: true } });
    expect(snakes.seats(options)).toBe(3);
    const match = snakes.start(options);
    expect(snakes.act(match, 1, { type: "roll" })).toMatch(/not your turn/);
    expect(snakes.act(match, 0, { type: "rematch" })).toMatch(/not over/);
    expect(snakes.cpuAction(match, 0, "normal")).toEqual({ type: "roll" });
    expect(snakes.cpuAction(match, 1, "normal")).toBeNull();
    const after = snakes.act(match, 0, { type: "roll" }, () => 0.99);
    expect(typeof after).toBe("object");
    expect((after as typeof match).die).toBe(6);
    // Six to Start: the 6 brings Player 1 onto square 1, and the turn passes (Six Rolls Again is off).
    expect((after as typeof match).game.positions[0]).toBe(1);
    expect(snakes.turn(after as typeof match)).toBe(1);
  });
});
