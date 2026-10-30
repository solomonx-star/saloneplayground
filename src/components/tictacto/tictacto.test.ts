import { describe, expect, it } from "vitest";
import { bestMoves, chooseMove, emptyBoard, isDraw, openCells, other, play, urgentMove, winner, type Board, type Cell, type Level, type Mark } from "./rules";

const board = (rows: string): Board => rows.replace(/\s/g, "").split("").map((c): Cell => (c === "X" || c === "O" ? c : null));

// Plays a whole game between two computer players and returns the result.
function game(x: Level, o: Level, random: () => number = Math.random) {
  let b = emptyBoard(); let mark: Mark = "X";
  while (!winner(b) && openCells(b).length) { b = play(b, chooseMove(b, mark, mark === "X" ? x : o, random), mark); mark = other(mark); }
  return winner(b)?.mark ?? "draw";
}

describe("rules", () => {
  it("finds rows, columns and diagonals", () => {
    expect(winner(board("XXX ... ..."))).toEqual({ mark: "X", line: [0, 1, 2] });
    expect(winner(board("O.. O.. O.."))?.line).toEqual([0, 3, 6]);
    expect(winner(board("..X .X. X.."))?.line).toEqual([2, 4, 6]);
    expect(winner(board("XO. ... ..."))).toBeNull();
  });

  it("calls a full board with no line a draw", () => {
    expect(isDraw(board("XOX XOO OXX"))).toBe(true);
    expect(isDraw(board("XOX XO. OXX"))).toBe(false);
  });
});

describe("computer player", () => {
  it("takes a win when one is there", () => {
    expect(urgentMove(board("OO. XX. ..."), "O")).toBe(2);
  });

  it("blocks the opponent's win", () => {
    expect(urgentMove(board("XX. O.. ..."), "O")).toBe(2);
  });

  it("answers a corner opening with the centre on Hard", () => {
    expect(bestMoves(board("X.. ... ..."), "O")).toEqual([4]);
  });

  it("cannot be beaten on Hard", () => {
    for (let i = 0; i < 40; i++) {
      expect(game("hard", "easy")).not.toBe("O");
      expect(game("easy", "hard")).not.toBe("X");
    }
  });

  it("draws against itself on Hard", () => {
    for (let i = 0; i < 10; i++) expect(game("hard", "hard")).toBe("draw");
  });

  it("sometimes loses on Easy, so it can be beaten", () => {
    const results = Array.from({ length: 60 }, () => game("hard", "easy"));
    expect(results.filter((r) => r === "X").length).toBeGreaterThan(10);
  });
});
