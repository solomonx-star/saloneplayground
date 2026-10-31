import { describe, expect, it } from "vitest";
import { ARROWS, cellOf, COLUMN_CELLS, TRACK_CELLS, YARD } from "./board";
import { ARROW_TIPS, chooseMove, COLOURS, COLUMN, current, LAST, move, newGame, NO_RULES, play, plays, rolled, SAFE, skip, square, START, threats, walk, walkBack, type Colour, type Game, type Level, type Rule, type Token } from "./rules";

const on = (pos: number): Token => ({ where: "track", pos });
const yard: Token = { where: "yard", pos: 0 };
const home: Token = { where: "home", pos: 0 };
const column = (pos: number): Token => ({ where: "column", pos });
// Track position for `colour` that puts its token on absolute track square `at`.
const at = (colour: Colour, square: number) => on((square - START[colour] + 52) % 52);
// The tokens that can move forward with die number `die`.
const legalFor = (game: Game, die: number) => plays(game).filter((p) => p.die === die && !p.back).map((p) => p.token);
const withRules = (...on: Rule[]) => ({ ...NO_RULES, ...Object.fromEntries(on.map((r) => [r, true])) });

// A two-player game (red against blue) with the given tokens placed and house rules on, red to move with `dice`.
function setUp(place: Partial<Record<Colour, Token[]>>, dice: number[] = [], ...rules: Rule[]): Game {
  const game = newGame(2, withRules(...rules));
  for (const [c, tokens] of Object.entries(place)) game.tokens[c as Colour] = tokens;
  return { ...game, dice };
}

// Plays a whole game between computer players and returns the winner.
function playOut(players: number, rules: Rule[], levels: Partial<Record<Colour, Level>> = {}, random: () => number = Math.random): Colour | null {
  const die = () => 1 + Math.floor(random() * 6);
  let game = newGame(players, withRules(...rules));
  for (let step = 0; step < 30000 && !game.winner; step++) {
    if (!game.dice.length) { game = rolled(game, die(), die()); continue; }
    const chosen = chooseMove(game, levels[current(game)] ?? "normal", random);
    game = chosen ? move(game, chosen) : skip(game);
  }
  return game.winner;
}

describe("board", () => {
  it("lays the track out as one loop of 52 squares, each next to the one before", () => {
    expect(new Set(TRACK_CELLS.map((c) => c.join())).size).toBe(52);
    TRACK_CELLS.forEach((cell, i) => {
      const next = TRACK_CELLS[(i + 1) % 52];
      expect(Math.max(Math.abs(cell[0] - next[0]), Math.abs(cell[1] - next[1]))).toBe(1);
    });
  });

  it("puts each start square beside its own yard and turns each colour into its own home column", () => {
    for (const c of COLOURS) {
      const [r, col] = TRACK_CELLS[START[c]]; const [yr, yc] = YARD[c];
      expect(r >= yr - 1 && r <= yr + 6 && col >= yc - 1 && col <= yc + 6).toBe(true);
      const turnOff = TRACK_CELLS[square(c, LAST)]; const first = COLUMN_CELLS[c][0];
      expect(Math.abs(turnOff[0] - first[0]) + Math.abs(turnOff[1] - first[1])).toBe(1);
    }
    expect(cellOf("green", on(0), 0)).toEqual([1, 8]);
  });

  it("goes round red, green, blue, yellow (Players 1 to 4), with two players sitting opposite", () => {
    expect(COLOURS).toEqual(["red", "green", "blue", "yellow"]);
    expect(TRACK_CELLS[START.blue]).toEqual([8, 13]);
    expect(TRACK_CELLS[START.yellow]).toEqual([13, 6]);
    expect(newGame(2).seats).toEqual(["red", "blue"]);
  });

  it("draws an arrow to every poison square, and points the other arrows into the home columns", () => {
    const tips = new Set<number>();
    for (const { colour, to } of ARROWS) {
      const cell = [Math.floor(to.y), Math.floor(to.x)].join();
      const onTrack = TRACK_CELLS.findIndex((c) => c.join() === cell);
      if (onTrack >= 0) tips.add(onTrack);
      else expect(COLUMN_CELLS[colour][0].join()).toBe(cell);
    }
    expect([...tips].sort((a, b) => a - b)).toEqual([...ARROW_TIPS].sort((a, b) => a - b));
  });
});

describe("two dice", () => {
  it("needs a 6 to bring a token out of the yard, and must land home exactly", () => {
    expect(walk(yard, 5)).toBeNull();
    expect(walk(yard, 6)).toEqual([on(0)]);
    expect(walk(on(LAST - 1), 3)?.at(-1)).toEqual(column(1));
    expect(walk(column(2), 3)?.at(-1)).toEqual(home);
    expect(walk(column(2), 4)).toBeNull();
  });

  it("plays each die separately: a 6 brings a token out and the other die can move it on", () => {
    let game = setUp({ red: [yard, yard, yard, yard] }, [6, 3]);
    expect(legalFor(game, 0)).toEqual([0, 1, 2, 3]);
    expect(legalFor(game, 1)).toEqual([]);
    game = move(game, { token: 0, die: 0 });
    game = move(game, { token: 0, die: 0 });
    expect(game.tokens.red[0]).toEqual(on(3));
    expect(current(game)).toBe("blue");
  });

  it("can use both dice on different tokens, and counts a double once", () => {
    let game = setUp({ red: [on(2), on(10), yard, yard] }, [4, 5]);
    game = move(move(game, { token: 0, die: 1 }), { token: 1, die: 0 });
    expect(game.tokens.red.slice(0, 2)).toEqual([on(7), on(14)]);
    expect(plays(setUp({ red: [on(2), yard, yard, yard] }, [3, 3]))).toEqual([{ token: 0, die: 0 }]);
  });

  it("loses a die that cannot be used, and passes the turn when nothing can move", () => {
    expect(current(move(setUp({ red: [column(2), yard, yard, yard] }, [2, 5]), { token: 0, die: 0 }))).toBe("blue");
    expect(current(skip(setUp({}, [3, 4])))).toBe("blue");
  });

  it("captures off the safe squares, sending the token home and earning another roll", () => {
    const game = move(setUp({ red: [on(1), yard, yard, yard], blue: [at("blue", 5), yard, yard, yard] }, [4, 1]), { token: 0, die: 0 });
    expect(game.tokens.blue[0]).toEqual(yard);
    expect(game.bonus).toBe(true);
    // Only the four coloured start squares are safe.
    expect([...SAFE]).toEqual([0, 13, 26, 39]);
    const safe = move(setUp({ red: [on(22), yard, yard, yard], blue: [on(0), yard, yard, yard] }, [4, 1]), { token: 0, die: 0 });
    expect(safe.tokens.blue[0].where).toBe("track");
  });

  it("gives another roll for a double 6 only, without Double Number Repeat", () => {
    expect(rolled(newGame(2), 6, 6).bonus).toBe(true);
    expect(rolled(newGame(2), 3, 3).bonus).toBe(false);
  });
});

describe("Double Number Repeat", () => {
  it("gives another roll on any double", () => {
    let game = rolled(setUp({ red: [on(3), on(20), yard, yard] }, [], "doubles"), 2, 2);
    expect(game.bonus).toBe(true);
    game = move(move(game, { token: 0, die: 0 }), { token: 1, die: 0 });
    expect(current(game)).toBe("red");
    expect(game.dice).toEqual([]);
  });
});

describe("Poison Arrow", () => {
  it("sends a token landing on a square an arrow points to back to its yard", () => {
    expect([...ARROW_TIPS].sort((a, b) => a - b)).toEqual([3, 5, 16, 18, 29, 31, 42, 44]);
    // 13 + 3 lands on 16, where the arrow along green's start lane points.
    const poisoned = play(setUp({ red: [on(13), yard, yard, yard] }, [3, 1], "poison"), { token: 0, die: 0 });
    expect(poisoned.outcome.poisoned).toBe(true);
    expect(poisoned.game.tokens.red[0]).toEqual(yard);
    // Without the rule, it is just a square.
    expect(move(setUp({ red: [on(13), yard, yard, yard] }, [3, 1]), { token: 0, die: 0 }).tokens.red[0]).toEqual(on(16));
  });

  it("catches a token on its own start lane too", () => {
    expect(move(setUp({ red: [on(0), on(20), yard, yard] }, [3, 1], "poison"), { token: 0, die: 0 }).tokens.red[0]).toEqual(yard);
  });
});

describe("Back & Front", () => {
  it("lets a token move backward only to capture", () => {
    expect(walkBack(on(10), 3)?.at(-1)).toEqual(on(7));
    const game = setUp({ red: [on(10), yard, yard, yard], blue: [at("blue", 6), yard, yard, yard] }, [4, 1], "backFront");
    expect(plays(game)).toContainEqual({ token: 0, die: 0, back: true });
    // No backward move with the 1: nothing to capture there.
    expect(plays(game)).not.toContainEqual({ token: 0, die: 1, back: true });
    const after = move(game, { token: 0, die: 0, back: true });
    expect(after.tokens.red[0]).toEqual(on(6));
    expect(after.tokens.blue[0]).toEqual(yard);
  });

  it("can capture back across its own start square, and then has the whole lap to run again", () => {
    // Red's token is 2 squares out; blue's sits 3 squares behind it, on the far side of red's start square.
    const game = setUp({ red: [on(2), yard, yard, yard], blue: [at("blue", 51), yard, yard, yard] }, [3, 1], "backFront");
    expect(plays(game)).toContainEqual({ token: 0, die: 0, back: true });
    const after = move(game, { token: 0, die: 0, back: true });
    expect(after.tokens.blue[0]).toEqual(yard);
    expect(after.tokens.red[0]).toEqual(on(-1));
    expect(square("red", -1)).toBe(51);
    expect(cellOf("red", on(-1), 0)).toEqual(TRACK_CELLS[51]);
    // Going forward again it passes its start square and goes round, rather than turning for home.
    expect(walk(on(-1), 4)?.at(-1)).toEqual(on(3));
  });

  it("is not allowed without the rule", () => {
    const game = setUp({ red: [on(10), yard, yard, yard], blue: [at("blue", 6), yard, yard, yard] }, [4, 1]);
    expect(plays(game).some((p) => p.back)).toBe(false);
  });

  it("makes tokens just ahead a threat too", () => {
    const game = setUp({ blue: [at("blue", 15), yard, yard, yard] }, [], "backFront");
    expect(threats(game, "red", 12)).toBe(1);
    expect(threats({ ...game, rules: NO_RULES }, "red", 12)).toBe(0);
  });
});

describe("Hanged Rule", () => {
  it("sends a token landing on step 55, the last square before home, back to its yard", () => {
    const hanged = play(setUp({ red: [column(1), on(5), yard, yard] }, [3, 1], "hanged"), { token: 0, die: 0 });
    expect(hanged.outcome.hanged).toBe(true);
    expect(hanged.game.tokens.red[0]).toEqual(yard);
    // Walking past it to land home exactly is fine.
    expect(move(setUp({ red: [column(1), on(5), yard, yard] }, [4, 1], "hanged"), { token: 0, die: 0 }).tokens.red[0]).toEqual(home);
    expect(column(COLUMN - 1).pos).toBe(4);
  });
});

describe("Taxi", () => {
  // Red catches blue's token two squares ahead; blue's token becomes a taxi carrying red's.
  const caught = () => play(setUp({ red: [on(3), yard, yard, yard], blue: [at("blue", 5), on(0), yard, yard] }, [2, 1], "taxi"), { token: 0, die: 0 });

  it("turns a captured token into a taxi carrying the token that caught it", () => {
    const { game, outcome } = caught();
    expect(outcome.taxi).toBe(true);
    expect(game.taxis).toEqual([{ driver: { colour: "blue", index: 0 }, rider: { colour: "red", index: 0 } }]);
    expect(game.tokens.blue[0].where).toBe("track");
    // Red cannot move the token riding in the taxi.
    expect(plays({ ...game, dice: [1, 2] }).some((p) => p.token === 0)).toBe(false);
  });

  it("makes every die its owner rolls move the taxi, carrying the rider along", () => {
    let game = caught().game;
    game = rolled({ ...game, turn: 1, dice: [], bonus: false }, 4, 2);
    expect(plays(game)).toEqual([{ token: 0, die: 0 }, { token: 0, die: 1 }]);
    game = move(game, { token: 0, die: 0 });
    expect(game.tokens.red[0]).toEqual(on(9));
    expect(square("blue", game.tokens.blue[0].pos)).toBe(square("red", 9));
  });

  it("drops the rider at its home entrance and sends the taxi back to its yard", () => {
    let game = caught().game;
    game.tokens.red[0] = on(LAST - 2);
    game.tokens.blue[0] = at("blue", square("red", LAST - 2));
    game = { ...game, turn: 1, dice: [5, 1], bonus: false };
    const { game: after, outcome } = play(game, { token: 0, die: 0 });
    expect(outcome.dropped).toBe(true);
    expect(after.tokens.red[0]).toEqual(on(LAST));
    expect(after.tokens.blue[0]).toEqual(yard);
    expect(after.taxis).toEqual([]);
  });

  it("sends a captured token straight home without the rule", () => {
    const game = move(setUp({ red: [on(3), yard, yard, yard], blue: [at("blue", 5), yard, yard, yard] }, [2, 1]), { token: 0, die: 0 });
    expect(game.taxis).toEqual([]);
    expect(game.tokens.blue[0]).toEqual(yard);
  });
});

describe("computer player", () => {
  it("takes a capture when it can, playing its dice in the order that sets one up", () => {
    expect(chooseMove(setUp({ red: [on(1), on(20), yard, yard], blue: [at("blue", 5), yard, yard, yard] }, [4, 2]), "hard")).toEqual({ token: 0, die: 0 });
    expect(chooseMove(setUp({ red: [yard, on(30), yard, yard], blue: [at("blue", 2), yard, yard, yard] }, [2, 6]), "hard")?.die).toBe(1);
  });

  it("steers clear of the hanging square and poison arrows", () => {
    expect(chooseMove(setUp({ red: [column(1), on(20), yard, yard] }, [3, 3], "hanged"), "hard")?.token).toBe(1);
    expect(chooseMove(setUp({ red: [on(12), on(20), yard, yard] }, [4, 4], "poison"), "hard")?.token).toBe(1);
  });

  it("finishes games with every house rule, alone and all together", () => {
    for (const rules of [[], ["doubles"], ["poison"], ["backFront"], ["hanged"], ["taxi"], ["doubles", "poison", "backFront", "hanged", "taxi"]] as Rule[][]) {
      expect(playOut(4, rules)).not.toBeNull();
    }
  });

  it("wins more often on Hard than Easy", () => {
    const wins = Array.from({ length: 60 }, () => playOut(2, [], { red: "hard", blue: "easy" })).filter((w) => w === "red").length;
    expect(wins).toBeGreaterThan(33);
  });
});
