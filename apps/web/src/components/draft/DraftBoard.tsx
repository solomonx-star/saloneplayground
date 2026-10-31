"use client";

import { posKey, samePos, SIZE, type Side, type Turn } from "@salone/games/draft/rules";
import type { DraftMatch, DraftResult } from "@salone/games/draft/match";
import type { DraftPicker } from "@/components/draft/useDraftPicker";

// The 10×10 Draft board, shared by Draft on one device and online. `flipped` turns it round so White plays from the
// bottom (for the White player online).

type BoardProps = {
  match: DraftMatch;
  picker: DraftPicker;
  // A move suggested by the HINT button, shown until the player taps.
  suggestion?: Turn | null;
  waiting: boolean;
  flipped?: boolean;
  // Called on any tap on the board, before the tap is played (for example to clear a hint).
  onTap?: () => void;
};

export default function DraftBoard({ match, picker, suggestion = null, waiting, flipped = false, onTap }: BoardProps) {
  const { last } = match;
  const { view, at, targets, taken, capturers } = picker;
  const suggested = new Set(suggestion ? [posKey(suggestion.steps[0].from), ...suggestion.steps.map((step) => posKey(step.to))] : []);
  const lastPath = new Set(last ? [posKey(last.steps[0].from), ...last.steps.map((s) => posKey(s.to))] : []);
  const lastTaken = new Set(last ? last.captured.map(posKey) : []);
  const order = Array.from({ length: SIZE }, (_, i) => (flipped ? SIZE - 1 - i : i));

  return <div className="draft-board-wrap"><div className={`draft-board${waiting ? " waiting" : ""}`} role="grid" aria-label="10 by 10 Draft board">{order.map((r) => order.map((c) => {
    const piece = view[r][c];
    const key = `${r},${c}`;
    const dark = (r + c) % 2 === 1;
    const classes = ["draft-square", dark ? "dark" : "light"];
    if (at && samePos(at, { r, c })) classes.push("selected");
    if (targets.has(key)) classes.push("target");
    if (lastPath.has(key)) classes.push("last");
    if (lastTaken.has(key)) classes.push("taken");
    if (suggested.has(key)) classes.push("suggest");
    const pieceClasses = ["draft-piece", piece?.side ?? "", piece?.king ? "king" : "", taken.has(key) ? "ghost" : "", capturers.has(key) ? "can" : ""].filter(Boolean).join(" ");
    return <button key={key} role="gridcell" aria-label={`${piece ? `${piece.side}${piece.king ? " king" : ""}` : dark ? "dark square" : "light square"} row ${10 - r} column ${c + 1}${targets.has(key) ? ", move here" : ""}`} className={classes.join(" ")} onClick={() => { onTap?.(); picker.click({ r, c }); }}>{piece && <span className={pieceClasses}>{piece.king ? "♛" : ""}</span>}</button>;
  }))}</div></div>;
}

// How a game ended, in words. `name` gives each side's player ("You" for this player).
export function resultText(result: DraftResult, name: (side: Side) => string): string {
  if (!result.winner) return "Draw. 25 king moves each without a capture.";
  const winner = name(result.winner);
  const loserSide = result.winner === "black" ? "white" : "black";
  const loser = name(loserSide);
  const wins = winner === "You" ? "You win!" : `${winner} wins!`;
  return result.reason === "captured" ? `${wins} Every ${loserSide} piece is captured.` : `${wins} ${loser} ${loser === "You" ? "have" : "has"} no moves left.`;
}
