import { describe, expect, it } from "vitest";
import { chooseTurn } from "./ai";
import { applyTurn, countPieces, emptyBoard, initialBoard, legalTurns, type Board, type Side } from "./rules";

function place(pieces: [number, number, Side, boolean?][]): Board {
  const board = emptyBoard();
  for (const [r, c, side, king] of pieces) board[r][c] = { side, king: !!king };
  return board;
}

const forced = { forceCapture: true };
const ends = (board: Board, side: Side) => legalTurns(board, side, forced).map((t) => t.steps[t.steps.length - 1].to);

describe("rules", () => {
  it("sets up 20 pieces a side with 9 opening moves for Black", () => {
    const board = initialBoard();
    expect(countPieces(board)).toEqual({ black: 20, white: 20 });
    expect(legalTurns(board, "black")).toHaveLength(9);
  });

  it("makes capturing optional, so a player can leave a piece alone", () => {
    const board = place([[5, 4, "black"], [4, 5, "white"], [7, 0, "black"]]);
    const turns = legalTurns(board, "black");
    expect(turns[0].captured).toEqual([{ r: 4, c: 5 }]);
    expect(turns.filter((t) => !t.captured.length).length).toBeGreaterThan(0);
  });

  it("makes capturing compulsory under the strict rule", () => {
    const board = place([[5, 4, "black"], [4, 5, "white"], [7, 0, "black"]]);
    const turns = legalTurns(board, "black", forced);
    expect(turns).toHaveLength(1);
    expect(turns[0].captured).toEqual([{ r: 4, c: 5 }]);
  });

  it("lets men capture backwards but only move forwards", () => {
    const board = place([[4, 4, "black"], [5, 5, "white"]]);
    expect(legalTurns(board, "black")[0].steps[0].to).toEqual({ r: 6, c: 6 });
    const quiet = place([[4, 4, "black"]]);
    expect(ends(quiet, "black")).toEqual([{ r: 3, c: 3 }, { r: 3, c: 5 }]);
  });

  it("chains captures into a single turn with the same piece", () => {
    const board = place([[6, 1, "black"], [5, 2, "white"], [3, 4, "white"]]);
    expect(legalTurns(board, "black").map((t) => t.captured.length).filter(Boolean)).toEqual([1, 2]);
    const turns = legalTurns(board, "black", forced);
    expect(turns).toHaveLength(1);
    expect(turns[0].captured).toHaveLength(2);
    const after = applyTurn(board, turns[0]);
    expect(countPieces(after)).toEqual({ black: 1, white: 0 });
    expect(after[2][5]).toEqual({ side: "black", king: false });
  });

  it("lets a king fly to capture from a distance and land on any free square beyond", () => {
    const board = place([[9, 0, "black", true], [5, 4, "white"]]);
    expect(ends(board, "black")).toEqual([{ r: 4, c: 5 }, { r: 3, c: 6 }, { r: 2, c: 7 }, { r: 1, c: 8 }, { r: 0, c: 9 }]);
  });

  it("does not let a piece be jumped twice in one turn", () => {
    // The king could circle back over the first piece; captured pieces stay on the board until the turn ends.
    const board = place([[7, 2, "black", true], [5, 4, "white"], [2, 5, "white"], [4, 1, "white"]]);
    const turns = legalTurns(board, "black");
    expect(Math.max(...turns.map((t) => t.captured.length))).toBe(3);
    for (const turn of turns) {
      const keys = turn.captured.map((p) => `${p.r},${p.c}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("crowns a man only when the turn ends on the far row", () => {
    const through = place([[2, 1, "black"], [1, 2, "white"], [1, 4, "white"]]);
    const chain = legalTurns(through, "black", forced)[0];
    expect(chain.captured).toHaveLength(2);
    expect(applyTurn(through, chain)[2][5]).toEqual({ side: "black", king: false });

    const ending = place([[2, 1, "black"], [1, 2, "white"]]);
    expect(applyTurn(ending, legalTurns(ending, "black")[0])[0][3]).toEqual({ side: "black", king: true });
  });
});

describe("computer player", () => {
  it("takes the bigger capture", () => {
    const board = place([[3, 2, "white"], [4, 3, "black"], [6, 5, "black"], [2, 7, "white"], [3, 6, "black"]]);
    expect(legalTurns(board, "white", forced).map((t) => t.captured.length).sort()).toEqual([1, 2]);
    const turn = chooseTurn(board, "white", "hard", () => 0)!;
    expect(turn.captured).toHaveLength(2);
  });

  it("does not walk into a capture when it can wait safely", () => {
    // Moving the right-hand man to (5,5) lets Black jump it; the man on the left edge can move safely.
    const board = place([[4, 4, "white"], [4, 0, "white"], [6, 6, "black"]]);
    expect(ends(board, "white")).toContainEqual({ r: 5, c: 5 });
    const turn = chooseTurn(board, "white", "normal", () => 0)!;
    const to = turn.steps[0].to;
    expect(to).not.toEqual({ r: 5, c: 5 });
  });

  it("declines a capture that is really a trap", () => {
    // Taking (4,3) lands on (5,4), where Black jumps back twice. Stepping away from the threat is safer.
    const board = place([[3, 2, "white"], [4, 3, "black"], [6, 3, "black"], [7, 2, "black"], [3, 6, "white"], [0, 1, "white"]]);
    expect(legalTurns(board, "white", forced).every((t) => t.captured.length > 0)).toBe(true);
    const turn = chooseTurn(board, "white", "hard", () => 0)!;
    expect(turn.captured).toHaveLength(0);
  });
});
