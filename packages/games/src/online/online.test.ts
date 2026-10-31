import { describe, expect, it } from "vitest";
import { applyMove, canMove, newMatch, nextRound, restartRound, type Match } from "../tintanto/match";
import type { Cell, Mark } from "../tintanto/rules";
import { cleanName, ROOM_CODE } from "./protocol";
import { isGameId, ONLINE_GAMES, tinTanTo } from "./games";

// A match in a given position (rows top to bottom, X to move), with each piece's id set to where it stands.
function position(rows: string, toMove: Mark = "X"): Match {
  const board = rows.replace(/\s/g, "").split("").map((c): Cell => (c === "X" || c === "O" ? c : null));
  return { ...newMatch(), board, toMove, pieces: board.flatMap((mark, at) => (mark ? [{ id: at, mark, at }] : [])) };
}

// Plays moves in order, checking each is allowed.
const playAll = (match: Match, moves: [number, number][]) => moves.reduce((m, [from, to]) => {
  expect(canMove(m, { from, to })).toBe(true);
  return applyMove(m, { from, to });
}, match);

describe("Tin Tan To match", () => {
  it("starts with each side on its home row, X to move, and no score", () => {
    const match = newMatch();
    expect(match.toMove).toBe("X");
    expect(match.pieces).toHaveLength(6);
    expect(match.scores).toEqual({ X: 0, O: 0, draws: 0 });
  });

  it("refuses moves that are not the side to move's, not along a line, or onto a piece", () => {
    const match = newMatch();
    expect(canMove(match, { from: 0, to: 3 })).toBe(false); // O's piece, but X is to move
    expect(canMove(match, { from: 7, to: 3 })).toBe(false); // not joined by a line
    expect(canMove(match, { from: 6, to: 7 })).toBe(false); // onto X's own piece
    expect(canMove(match, { from: 99, to: 4 })).toBe(false);
    expect(applyMove(match, { from: 0, to: 3 })).toBe(match);
  });

  it("moves the piece and slides its id along with it", () => {
    const match = playAll(newMatch(), [[7, 4], [0, 3]]);
    expect(match.board[4]).toBe("X");
    expect(match.pieces.find((p) => p.id === 7)?.at).toBe(4);
    expect(match.toMove).toBe("X");
    expect(match.last).toEqual({ from: 0, to: 3 });
  });

  it("scores a three in a row, then starts rounds again with the same or the other side first", () => {
    // X has 3 and 4 and slides 8 → 5 to make the middle row.
    const won = applyMove(position("OOO XX. ..X"), { from: 8, to: 5 });
    expect(won.result).toEqual({ mark: "X", line: [3, 4, 5] });
    expect(won.scores).toEqual({ X: 1, O: 0, draws: 0 });
    expect(canMove(won, { from: 0, to: 1 })).toBe(false);
    expect(restartRound(won).starter).toBe("X");
    const next = nextRound(won);
    expect(next.starter).toBe("O");
    expect(next.result).toBeNull();
    expect(next.scores).toEqual(won.scores);
  });
});

describe("online games", () => {
  it("knows its games and seats Tin Tan To with two players", () => {
    expect(isGameId("tintanto")).toBe(true);
    expect(isGameId("chess")).toBe(false);
    expect(ONLINE_GAMES.tintanto.seats).toBe(2);
  });

  it("lets only the seat whose turn it is move, and only legally", () => {
    const match = tinTanTo.start();
    expect(tinTanTo.turn(match)).toBe(0);
    expect(tinTanTo.act(match, 1, { type: "move", move: { from: 0, to: 3 } })).toBe("It is not your turn.");
    expect(tinTanTo.act(match, 0, { type: "move", move: { from: 6, to: 7 } })).toBe("That move is not allowed.");
    expect(tinTanTo.act(match, 0, { type: "next" })).toBe("The round is not over yet.");
    expect(tinTanTo.act(match, 0, { type: "dance" } as never)).toBe("Unknown action.");
    const moved = tinTanTo.act(match, 0, { type: "move", move: { from: 7, to: 4 } });
    expect(typeof moved).toBe("object");
    expect(tinTanTo.turn(moved as Match)).toBe(1);
  });

  it("plays computer seats to the end of a round, then waits for someone to start the next", () => {
    let match = tinTanTo.start();
    for (let i = 0; i < 200 && !tinTanTo.roundOver(match); i++) {
      const seat = tinTanTo.turn(match)!;
      const action = tinTanTo.cpuAction(match, seat, i % 2 ? "easy" : "hard")!;
      expect(tinTanTo.cpuAction(match, 1 - seat, "hard")).toBeNull();
      match = tinTanTo.act(match, seat, action) as Match;
    }
    expect(tinTanTo.roundOver(match)).toBe(true);
    expect(tinTanTo.turn(match)).toBeNull();
    const next = tinTanTo.act(match, 1, { type: "next" }) as Match;
    expect(next.result).toBeNull();
    expect(next.starter).toBe("O");
  });
});

describe("protocol", () => {
  it("tidies player names", () => {
    expect(cleanName("  Aminata   Kamara ")).toBe("Aminata Kamara");
    expect(cleanName("")).toBe("Player");
    expect(cleanName(42)).toBe("Player");
    expect(cleanName("x".repeat(40))).toHaveLength(20);
  });

  it("accepts four-letter room codes without I or O", () => {
    expect(ROOM_CODE.test("KJWB")).toBe(true);
    expect(ROOM_CODE.test("KIWB")).toBe(false);
    expect(ROOM_CODE.test("kjwb")).toBe(false);
    expect(ROOM_CODE.test("KJW")).toBe(false);
  });
});
