import type { Match } from "@salone/games/tintanto/match";
import { HOME, NEIGHBOURS, type Mark } from "@salone/games/tintanto/rules";

// The Tin Tan To board as it is drawn on paper: nine points joined by the rectangle, the middle row and column and
// the two long diagonals, in a tall 300×420 drawing. Shared by the one-device game and online play.

const COLUMNS = [40, 150, 260];
const ROWS = [50, 210, 370];
const isHome = (point: number) => HOME.X.includes(point) || HOME.O.includes(point);
export const colour = (mark: Mark) => (mark === "X" ? "blue" : "orange");

type BoardProps = {
  match: Match;
  // The piece picked up, if any; the points it can slide to are lit.
  selected: number | null;
  // Turned round so orange's home row is at the bottom (for the orange player online).
  flipped?: boolean;
  // While waiting for the other side (the computer or the other player) the points cannot be tapped.
  waiting: boolean;
  labels: { top: string; bottom: string };
  onTap: (point: number) => void;
};

export default function Board({ match, selected, flipped = false, waiting, labels, onTap }: BoardProps) {
  const { board, pieces, last, result } = match;
  const spot = (point: number) => { const p = flipped ? 8 - point : point; return { x: COLUMNS[p % 3], y: ROWS[Math.floor(p / 3)] }; };
  const targets = selected === null ? [] : NEIGHBOURS[selected].filter((p) => !board[p]);
  const line = result && result !== "draw" && result.line.length ? [spot(result.line[0]), spot(result.line[2])] : null;

  return <div className={`ttt-board${waiting ? " waiting" : ""}`} role="group" aria-label="Tin Tan To board">
    <svg className="ttt-art" viewBox="0 0 300 420" aria-hidden="true">
      <text className="ttt-side" x="150" y="24">{labels.top}</text>
      <text className="ttt-side" x="150" y="408">{labels.bottom}</text>
      <g className="ttt-chalk">
        <rect x="40" y="50" width="220" height="320" />
        <line x1="40" y1="210" x2="260" y2="210" />
        <line x1="150" y1="50" x2="150" y2="370" />
        <line x1="40" y1="50" x2="260" y2="370" />
        <line x1="260" y1="50" x2="40" y2="370" />
      </g>
      {board.map((_, p) => { const s = spot(p); return isHome(p) ? <circle key={p} className="ttt-home" cx={s.x} cy={s.y} r="14" /> : <circle key={p} className="ttt-dot" cx={s.x} cy={s.y} r="4" />; })}
      {last && !result && <line className="ttt-last" x1={spot(last.from).x} y1={spot(last.from).y} x2={spot(last.to).x} y2={spot(last.to).y} />}
      {targets.map((p) => <circle key={p} className="ttt-target" cx={spot(p).x} cy={spot(p).y} r="10" />)}
      {pieces.map((piece) => {
        const s = spot(piece.at);
        return <g key={piece.id} className={`ttt-piece ${piece.mark.toLowerCase()}${piece.at === selected ? " selected" : ""}`} style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
          <circle className="cap" r="18" /><circle className="rim" r="11" />
        </g>;
      })}
      {line && <line className="ttt-line" x1={line[0].x} y1={line[0].y} x2={line[1].x} y2={line[1].y} />}
    </svg>
    {board.map((cell, p) => {
      const s = spot(p);
      const what = cell ? `${colour(cell)} piece${p === selected ? ", picked up" : ""}` : targets.includes(p) ? "empty, move here" : "empty";
      return <button key={p} className="ttt-point" style={{ left: `${(s.x / 300) * 100}%`, top: `${(s.y / 420) * 100}%` }} onClick={() => onTap(p)} disabled={!!result || waiting} aria-label={`Point ${p + 1}, ${what}`} />;
    })}
  </div>;
}
