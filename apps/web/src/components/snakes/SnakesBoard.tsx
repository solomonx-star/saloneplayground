"use client";

import { COLOUR_HEX } from "@salone/games/ludo/board";
import { cellOf, LADDERS, SIZE, SNAKES, SQUARES, type Jump } from "@salone/games/snakes/board";
import { colourOf } from "@salone/games/snakes/rules";

// The Snakes and Ladders board, drawn as one SVG: 100 squares, bamboo ladders, patterned snakes, and a start strip
// below the board for tokens not on it yet. Tokens glide from square to square; down a snake or up a ladder they
// slide more slowly, so everyone can follow what happened.

const CELL = 100;
const BOARD = CELL * SIZE;
const STRIP = 96;
const STEP_MS = 150;
const SLIDE_MS = 650;

// Each snake's colours: body and markings.
const SNAKE_LOOK: Record<string, { body: string; marks: string }> = {
  "Night adder": { body: "#7d6b4c", marks: "#d9c79a" },
  "Green mamba": { body: "#38a24a", marks: "#a6e37a" },
  "Rhinoceros viper": { body: "#3e74b0", marks: "#e6c84e" },
  "Spitting cobra": { body: "#3a3a36", marks: "#9a9a8c" },
  "Royal python": { body: "#9b6128", marks: "#f0cf8a" },
  "Gaboon viper": { body: "#8d5a96", marks: "#e8c3a0" },
  "Bush viper": { body: "#a7a52a", marks: "#f1ea8a" },
  "Great rock python": { body: "#6a4a26", marks: "#c99a5a" },
};

const centre = (square: number) => {
  if (square <= 0) return { x: 0, y: BOARD + STRIP / 2 };
  const { row, col } = cellOf(square);
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
};

// Where a player's token sits: in the middle of its square when alone, otherwise in a corner so they do not cover
// each other. Off the board they wait in the start strip, side by side.
function spot(player: number, square: number, sharing: boolean) {
  if (square <= 0) return { x: 150 + player * 80, y: BOARD + STRIP / 2 };
  const c = centre(square);
  if (!sharing) return c;
  return { x: c.x + (player % 2 ? 20 : -20), y: c.y + (player < 2 ? -18 : 18) };
}

export type Moving = { player: number; square: number; slide: boolean };

type Props = {
  positions: number[];
  // A token on its way (stepping square by square, or sliding along a snake or ladder).
  moving: Moving | null;
  turn: number;
  names: string[];
};

export default function SnakesBoard({ positions, moving, turn, names }: Props) {
  const shown = positions.map((p, i) => (moving?.player === i ? moving.square : p));
  const summary = shown.map((p, i) => `${names[i]}: ${p <= 0 ? "not on the board yet" : `square ${p}`}`).join(", ");
  // Draw the player to move last, so their token is on top.
  const order = shown.map((_, i) => i).sort((a, b) => (a === turn ? 1 : b === turn ? -1 : a - b));
  return <div className="snakes-board-wrap">
    <svg className="snakes-board" viewBox={`0 0 ${BOARD} ${BOARD + STRIP}`} role="img" aria-label={`Snakes and Ladders board. ${summary}.`}>
      <Squares />
      {LADDERS.map((l) => <Ladder key={l.from} jump={l} />)}
      {SNAKES.map((s) => <Snake key={s.from} jump={s} />)}
      <rect x="0" y={BOARD} width={BOARD} height={STRIP} fill="#0e2c20" />
      <text x="24" y={BOARD + STRIP / 2 + 9} className="snakes-strip-label">START</text>
      {order.map((i) => {
        const square = shown[i];
        const sharing = shown.some((p, j) => j !== i && p === square);
        const { x, y } = spot(i, square, sharing);
        const colour = COLOUR_HEX[colourOf(i)];
        const ms = moving?.player === i ? (moving.slide ? SLIDE_MS : STEP_MS) : 300;
        return <g key={i} className="snakes-token" style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${ms}ms ${moving?.slide ? "ease-in-out" : "ease-out"}` }}>
          <title>{names[i]}</title>
          {i === turn && <circle r="34" fill="none" stroke="#ffffff" strokeWidth="5" strokeDasharray="10 7" className="snakes-turn-ring" />}
          <circle r="25" fill={colour.dark} cy="4" />
          <circle r="25" fill={colour.fill} stroke="#fff" strokeWidth="5" />
          <circle r="9" cx="-8" cy="-8" fill={colour.shine} opacity="0.8" />
        </g>;
      })}
    </svg>
  </div>;
}

function Squares() {
  return <g>
    {Array.from({ length: SQUARES }, (_, i) => {
      const square = i + 1;
      const { row, col } = cellOf(square);
      const x = col * CELL;
      const y = row * CELL;
      const light = (row + col) % 2 === 0;
      const fill = square === SQUARES ? "#f2cf52" : light ? "#f1e9cc" : "#d4e5b6";
      return <g key={square}>
        <rect x={x} y={y} width={CELL} height={CELL} fill={fill} />
        <text x={x + 9} y={y + 27} className="snakes-number">{square}</text>
        {square === SQUARES && <text x={x + CELL / 2} y={y + 68} textAnchor="middle" className="snakes-home">HOME</text>}
      </g>;
    })}
    <rect x="1.5" y="1.5" width={BOARD - 3} height={BOARD - 3} fill="none" stroke="#174b38" strokeWidth="3" />
  </g>;
}

// Two bamboo rails with rungs, from the foot square to the top square.
function Ladder({ jump }: { jump: Jump }) {
  const a = centre(jump.from);
  const b = centre(jump.to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  // Rails half a cell apart, ends tucked in a little.
  const nx = -uy * 17;
  const ny = ux * 17;
  const start = { x: a.x + ux * 18, y: a.y + uy * 18 };
  const end = { x: b.x - ux * 18, y: b.y - uy * 18 };
  const rungs = Math.max(2, Math.floor((length - 36) / 42));
  return <g className="snakes-ladder">
    <title>{jump.name}: {jump.from} up to {jump.to}</title>
    {Array.from({ length: rungs }, (_, i) => {
      const t = (i + 0.5) / rungs;
      const px = start.x + (end.x - start.x) * t;
      const py = start.y + (end.y - start.y) * t;
      return <line key={i} x1={px + nx} y1={py + ny} x2={px - nx} y2={py - ny} stroke="#a77d2d" strokeWidth="8" strokeLinecap="round" />;
    })}
    {[1, -1].map((side) => <g key={side}>
      <line x1={start.x + nx * side} y1={start.y + ny * side} x2={end.x + nx * side} y2={end.y + ny * side} stroke="#6f5114" strokeWidth="12" strokeLinecap="round" />
      <line x1={start.x + nx * side} y1={start.y + ny * side} x2={end.x + nx * side} y2={end.y + ny * side} stroke="#d6ad55" strokeWidth="7" strokeLinecap="round" strokeDasharray="38 4" />
    </g>)}
  </g>;
}

// A snake winding from its head (on the higher square) down to its tail.
function Snake({ jump }: { jump: Jump }) {
  const head = centre(jump.from);
  const tail = centre(jump.to);
  const dx = tail.x - head.x;
  const dy = tail.y - head.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const bend = Math.min(80, length * 0.22);
  const c1 = { x: head.x + dx / 3 - uy * bend, y: head.y + dy / 3 + ux * bend };
  const c2 = { x: head.x + (2 * dx) / 3 + uy * bend, y: head.y + (2 * dy) / 3 - ux * bend };
  const path = `M ${head.x} ${head.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${tail.x} ${tail.y}`;
  const look = SNAKE_LOOK[jump.name] ?? { body: "#4b7d3c", marks: "#b8de8e" };
  const big = jump.from - jump.to > 40;
  const width = big ? 30 : 24;
  // The head points back along the body.
  const angle = (Math.atan2(c1.y - head.y, c1.x - head.x) * 180) / Math.PI + 180;
  return <g className="snakes-snake">
    <title>{jump.name}: {jump.from} down to {jump.to}</title>
    <path d={path} fill="none" stroke="#00000033" strokeWidth={width + 6} strokeLinecap="round" transform="translate(3 5)" />
    <path d={path} fill="none" stroke={look.body} strokeWidth={width} strokeLinecap="round" />
    <path d={path} fill="none" stroke={look.marks} strokeWidth={width * 0.42} strokeLinecap="round" strokeDasharray="14 16" />
    <circle cx={tail.x} cy={tail.y} r={width * 0.32} fill={look.body} />
    <g transform={`translate(${head.x} ${head.y}) rotate(${angle})`}>
      <path d={`M ${width * 0.9} 0 L ${width * 1.5} -5 M ${width * 0.9} 0 L ${width * 1.5} 5`} stroke="#d8342b" strokeWidth="3.5" strokeLinecap="round" />
      <ellipse rx={width * 0.95} ry={width * 0.72} fill={look.body} stroke="#00000040" strokeWidth="2" />
      <circle cx={width * 0.32} cy={-width * 0.32} r="4.5" fill="#fff" /><circle cx={width * 0.38} cy={-width * 0.32} r="2.2" fill="#111" />
      <circle cx={width * 0.32} cy={width * 0.32} r="4.5" fill="#fff" /><circle cx={width * 0.38} cy={width * 0.32} r="2.2" fill="#111" />
    </g>
  </g>;
}
