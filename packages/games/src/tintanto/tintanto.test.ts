import { describe, expect, it } from "vitest";
import { bestMoves, chooseMove, DRAW_RULES, movesFor, NEIGHBOURS, other, play, positionKey, resultAfter, safeMoves, solve, startBoard, winner, winningMove, type Board, type Cell, type Level, type Mark, type Result } from "./rules";

const board = (rows: string): Board => rows.replace(/\s/g, "").split("").map((c): Cell => (c === "X" || c === "O" ? c : null));

// Plays a whole game between two computer players, with the draw rules, and returns the result.
function game(x: Level, o: Level, first: Mark = "X", random: () => number = Math.random): "X" | "O" | "draw" {
  let b = startBoard(); let mark = first; let moves = 0;
  const seen = new Map<string, number>();
  for (;;) {
    const move = chooseMove(b, mark, mark === "X" ? x : o, random)!;
    b = play(b, move); mark = other(mark); moves++;
    const key = positionKey(b, mark);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const result: Result = resultAfter(b, mark, seen.get(key)!, moves);
    if (result) return result === "draw" ? "draw" : result.mark;
  }
}

describe("board", () => {
  it("joins points only along the drawn lines", () => {
    NEIGHBOURS.forEach((list, a) => list.forEach((b) => expect(NEIGHBOURS[b]).toContain(a)));
    expect(NEIGHBOURS[0]).toContain(4);
    expect(NEIGHBOURS[4]).toHaveLength(8);
    // The diagonals run corner to corner, so the edge points are not joined diagonally.
    expect(NEIGHBOURS[1]).not.toContain(3);
    expect(NEIGHBOURS[3]).not.toContain(7);
  });

  it("starts each side on its own home row", () => {
    expect(startBoard()).toEqual(board("OOO ... XXX"));
    expect(winner(startBoard())).toBeNull();
  });

  it("lets a piece slide only to an empty point next to it along a line", () => {
    expect(movesFor(startBoard(), "X")).toEqual([{ from: 6, to: 3 }, { from: 6, to: 4 }, { from: 7, to: 4 }, { from: 8, to: 5 }, { from: 8, to: 4 }]);
    expect(play(startBoard(), { from: 7, to: 4 })).toEqual(board("OOO .X. X.X"));
  });
});

describe("rules", () => {
  it("counts three in a row on any line except your own home row", () => {
    expect(winner(board("... XXX ..."))).toEqual({ mark: "X", line: [3, 4, 5] });
    expect(winner(board("X.. .X. ..X"))?.line).toEqual([0, 4, 8]);
    expect(winner(board(".O. .O. .O."))?.line).toEqual([1, 4, 7]);
    // Your own home row does not count, but the other side's does.
    expect(winner(board("... ... XXX"))).toBeNull();
    expect(winner(board("XXX ... ..."))?.mark).toBe("X");
  });

  it("never leaves a side without a move unless the other side already has three in a row", () => {
    for (const key of solve().keys()) {
      const b = board(key.slice(0, 9)); const toMove = key[9] as Mark;
      if (!movesFor(b, toMove).length) expect(winner(b)).not.toBeNull();
    }
  });

  it("calls a draw when a position comes round three times or the move limit is reached", () => {
    const b = board("O.O .O. XXX");
    expect(resultAfter(b, "X", 2, 10)).toBeNull();
    expect(resultAfter(b, "X", DRAW_RULES.repeats, 10)).toBe("draw");
    expect(resultAfter(b, "X", 1, DRAW_RULES.moves)).toBe("draw");
  });
});

describe("solved game", () => {
  it("is a draw from the start with best play", () => {
    expect(solve().get(positionKey(startBoard(), "X"))?.result).toBe("draw");
  });

  it("knows that opening by moving a corner piece into the middle loses", () => {
    expect(solve().get(positionKey(play(startBoard(), { from: 6, to: 4 }), "O"))?.result).toBe("win");
    expect(bestMoves(startBoard(), "X")).not.toContainEqual({ from: 6, to: 4 });
  });
});

describe("computer player", () => {
  it("takes a win when one is there", () => {
    // Here moving 4 → 1 would only fill O's own home row, which does not count.
    expect(winningMove(board("O.O .O. X.X"), "O")).toBeNull();
    expect(winningMove(board("X.O OO. X.X"), "O")).toEqual({ from: 2, to: 5 });
  });

  it("does not hand over a win with a careless move on Normal", () => {
    const b = board("O.O XX. .OX");
    for (const move of safeMoves(b, "O")) expect(winningMove(play(b, move), "X")).toBeNull();
    expect(safeMoves(b, "O").length).toBeLessThan(movesFor(b, "O").length);
  });

  it("cannot be beaten on Hard", () => {
    for (let i = 0; i < 30; i++) {
      expect(game("hard", "easy", i % 2 ? "X" : "O")).not.toBe("O");
      expect(game("easy", "hard", i % 2 ? "X" : "O")).not.toBe("X");
    }
  });

  it("draws against itself on Hard", () => {
    for (let i = 0; i < 6; i++) expect(game("hard", "hard", i % 2 ? "X" : "O")).toBe("draw");
  });

  it("can be beaten on Easy", () => {
    const results = Array.from({ length: 40 }, (_, i) => game("hard", "easy", i % 2 ? "X" : "O"));
    expect(results.filter((r) => r === "X").length).toBeGreaterThan(10);
  });
});
