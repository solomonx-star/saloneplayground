"use client";

import { ARROWS, cellOf, COLOUR_HEX, COLUMN_CELLS, HOME_CELL, SIZE, TRACK_CELLS, YARD, type Cell } from "@salone/games/ludo/board";
import { ARROW_TIPS, COLOURS, COLUMN, current, pathOf, START, taxiOf, type Colour, type Game, type Play } from "@salone/games/ludo/rules";
import type { LudoControls } from "@/components/ludo/useLudoControls";

// The Ludo board as it is printed: yards with the players' names, the black grid and arrows, the pale centre with
// the two dice, and the tokens. Shared by Ludo on one device and online.

// A token sliding square by square: which token, the cells it passes through, and how far along it is.
export type Moving = { colour: Colour; token: number; path: Cell[]; step: number };

export const CELL = 40;
const MIDDLE = (SIZE * CELL) / 2;
const DIE = 38;
const LINE = "#111";
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};
export const title = (colour: Colour) => colour[0].toUpperCase() + colour.slice(1);

// One die on its own (for a phone in party play), with the border in the colour of the player to move.
export function DieFace({ value, colour, rolling = false }: { value: number; colour: Colour; rolling?: boolean }) {
  return <svg className={`ludo-die-face${rolling ? " tumbling" : ""}`} viewBox="0 0 40 40" role="img" aria-label={`Die showing ${value}`}>
    <rect x="2" y="2" width="36" height="36" rx="7" fill="#fffaf0" stroke={COLOUR_HEX[colour].fill} strokeWidth="3" />
    {PIPS[value].map(([r, c]) => <circle key={`${r}${c}`} cx={20 + (c - 2) * 8.5} cy={20 + (r - 2) * 8.5} r="3.6" fill="#23302a" />)}
  </svg>;
}
const centre = ([r, c]: Cell) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL });

type BoardProps = {
  game: Game;
  // The dice as shown (flickering while they roll), and whether they are tumbling.
  pair: [number, number];
  rolling: boolean;
  moving: Moving | null;
  controls: LudoControls;
  // Whether the player to move is playing on this device, and whether anything is animating or the game is over.
  human: boolean;
  busy: boolean;
  onRoll: () => void;
  onPick: (play: Play) => void;
  // Names to show in the yards in place of "Player 1" to "Player 4".
  labels?: Partial<Record<Colour, string>>;
};

export default function LudoBoard({ game, pair, rolling, moving, controls, human, busy, onRoll, onPick, labels }: BoardProps) {
  const turn = current(game);
  const { die, usable, movableTokens, choosers, lines, canChoose, selected } = controls;
  const waitingToRoll = human && !game.dice.length && !busy;
  // Each die on show, and its index among the dice still to play (-1 once it has been used).
  const left = [...game.dice];
  const shown = pair.map((value) => { const index = left.indexOf(value); if (index >= 0) left[index] = -1; return { value, index }; });

  // Every token's spot on the board. A token riding in a taxi sits on top of it and moves with it. Tokens sharing
  // a square are spread out a little so all can be seen; tokens home sit smaller along the edge of their triangle.
  const cellNow = (colour: Colour, index: number): Cell => {
    const taxi = taxiOf(game, { colour, index });
    if (taxi && taxi.rider.colour === colour && taxi.rider.index === index) return cellNow(taxi.driver.colour, taxi.driver.index);
    if (moving && moving.colour === colour && moving.token === index) return moving.path[moving.step];
    return cellOf(colour, game.tokens[colour][index], index);
  };
  const spots = game.seats.flatMap((colour) => game.tokens[colour].map((token, index) => {
    const taxi = taxiOf(game, { colour, index });
    const riding = !!taxi && taxi.rider.colour === colour && taxi.rider.index === index;
    const cell = cellNow(colour, index);
    const isMoving = moving && moving.colour === colour && moving.token === index;
    return { colour, index, cell, key: cell.join(), home: !isMoving && token.where === "home", yard: !isMoving && token.where === "yard", riding, driving: !!taxi && !riding };
  }));
  const placed = spots.map((s) => {
    const { x, y } = centre(s.cell);
    if (s.riding) return { ...s, x: x - 3, y: y - 9, scale: 0.72 };
    const sharing = spots.filter((o) => o.key === s.key && !o.riding);
    const n = sharing.indexOf(s);
    const shift = sharing.length > 1 ? (n - (sharing.length - 1) / 2) * (s.home ? 11 : 9) : 0;
    // Tokens waiting in the yard are drawn larger, as on a printed board.
    if (s.yard) return { ...s, x, y, scale: 1.4 };
    if (!s.home) return { ...s, x: x + shift, y: y - Math.abs(shift) * 0.3, scale: 1 };
    // Red and yellow line up their home tokens top to bottom, green and blue side to side.
    const across = s.colour === "red" || s.colour === "yellow";
    return { ...s, x: across ? x : x + shift, y: across ? y + shift : y, scale: 0.6 };
  }).sort((a, b) => Number(a.riding) - Number(b.riding));

  // Tapping a die picks it (when the two can move different tokens); with none rolled, it rolls them.
  const tapDie = (index: number) => { if (waitingToRoll) onRoll(); else if (index >= 0) controls.chooseDie(index); };

  return <div className="ludo-board-wrap">
    <svg className="ludo-board" viewBox={`0 0 ${SIZE * CELL} ${SIZE * CELL}`} role="group" aria-label="Ludo board">
      <defs>
        <marker id="ludo-arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill={LINE} /></marker>
        {COLOURS.map((c) => <radialGradient key={c} id={`ludo-shine-${c}`} cx="0.35" cy="0.3" r="0.75"><stop offset="0" stopColor={COLOUR_HEX[c].shine} /><stop offset="0.55" stopColor={COLOUR_HEX[c].fill} /><stop offset="1" stopColor={COLOUR_HEX[c].dark} /></radialGradient>)}
      </defs>
      <rect width={SIZE * CELL} height={SIZE * CELL} fill="#fff" />
      {/* Yards: a solid block of colour with the player's name, and a faint spot for each token. */}
      {COLOURS.map((c, n) => {
        const [r, col] = YARD[c]; const hex = COLOUR_HEX[c]; const playing = game.seats.includes(c);
        return <g key={c} opacity={playing ? 1 : 0.4}>
          <rect x={col * CELL} y={r * CELL} width={6 * CELL} height={6 * CELL} fill={hex.fill} stroke={LINE} strokeWidth="2" />
          {[0, 1, 2, 3].map((i) => { const { x, y } = centre(cellOf(c, { where: "yard", pos: 0 }, i)); return <circle key={i} cx={x} cy={y} r="21" fill="#00000018" />; })}
          <text x={(col + 3) * CELL} y={(r + 5.45) * CELL} className="ludo-player">{labels?.[c] ?? `Player ${n + 1}`}</text>
        </g>;
      })}
      {/* Home columns, then the track: white squares with a black grid, each start square in its colour. */}
      {COLOURS.map((c) => {
        const hang = COLUMN_CELLS[c][COLUMN - 1];
        return <g key={c}>
          {COLUMN_CELLS[c].map(([cr, cc]) => <rect key={`${cr}-${cc}`} x={cc * CELL} y={cr * CELL} width={CELL} height={CELL} fill={COLOUR_HEX[c].fill} stroke={LINE} strokeWidth="1.5" />)}
          {/* Hanged Rule: step 55, the last square before home, is marked. */}
          {game.rules.hanged && <text x={(hang[1] + 0.5) * CELL} y={(hang[0] + 0.5) * CELL + 5} className="ludo-mark" fill={c === "yellow" ? "#5a4a00" : "#fff"}>55</text>}
        </g>;
      })}
      {TRACK_CELLS.map(([r, c], i) => {
        const startOf = COLOURS.find((col) => START[col] === i);
        const poison = game.rules.poison && ARROW_TIPS.has(i);
        return <rect key={i} x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={startOf ? COLOUR_HEX[startOf].fill : poison ? "#fde2df" : "#fff"} stroke={LINE} strokeWidth="1.5" />;
      })}
      {/* The centre: four pale triangles, each pointing in from its colour's home column. */}
      <polygon points={`${6 * CELL},${6 * CELL} ${6 * CELL},${9 * CELL} ${MIDDLE},${MIDDLE}`} fill={COLOUR_HEX.red.light} stroke={LINE} strokeWidth="1.5" />
      <polygon points={`${6 * CELL},${6 * CELL} ${9 * CELL},${6 * CELL} ${MIDDLE},${MIDDLE}`} fill={COLOUR_HEX.green.light} stroke={LINE} strokeWidth="1.5" />
      <polygon points={`${9 * CELL},${6 * CELL} ${9 * CELL},${9 * CELL} ${MIDDLE},${MIDDLE}`} fill={COLOUR_HEX.blue.light} stroke={LINE} strokeWidth="1.5" />
      <polygon points={`${6 * CELL},${9 * CELL} ${9 * CELL},${9 * CELL} ${MIDDLE},${MIDDLE}`} fill={COLOUR_HEX.yellow.light} stroke={LINE} strokeWidth="1.5" />
      {/* The arrows: into each home column, along each start lane and round each inner corner. */}
      <g className={`ludo-arrows${game.rules.poison ? " poison" : ""}`}>
        {ARROWS.map(({ colour, from, to }, i) => <line key={`${colour}${i}`} x1={from.x * CELL} y1={from.y * CELL} x2={to.x * CELL} y2={to.y * CELL} stroke={LINE} strokeWidth="3" strokeLinecap="round" markerEnd="url(#ludo-arrowhead)" />)}
      </g>
      <rect width={SIZE * CELL} height={SIZE * CELL} fill="none" stroke={LINE} strokeWidth="3" />
      {game.winner && (() => { const { x, y } = centre(HOME_CELL[game.winner]); return <text x={x} y={y + 5} className="ludo-done">✓</text>; })()}
      {placed.map(({ colour, index, x, y, scale, riding, driving }) => {
        const hex = COLOUR_HEX[colour];
        const mine = human && !busy && colour === turn;
        const movable = mine && (movableTokens.has(index) || choosers.has(index));
        const canBack = mine && choosers.has(index);
        return <g key={`${colour}${index}`} className={`ludo-token${movable ? " movable" : ""}${driving ? " taxi" : ""}`} style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}
          onClick={movable ? () => controls.tapToken(index) : undefined} role={movable ? "button" : undefined} tabIndex={movable ? 0 : undefined}
          aria-label={canBack ? `Show the lines of play for ${colour} token ${index + 1}, which can capture backward` : movable ? `Move ${colour} token ${index + 1} by ${game.dice[die]}${driving ? " (taxi)" : ""}` : riding ? `${colour} token riding in a taxi` : undefined} onKeyDown={movable ? (e) => { if (e.key === "Enter") controls.tapToken(index); } : undefined}>
          {movable && <circle className="ludo-glow" r="19" />}
          {canBack && <circle className={`ludo-can-back${selected === index ? " picked" : ""}`} r="23" />}
          {driving && <circle className="ludo-taxi-ring" r="19" />}
          {!riding && <ellipse cx="2" cy="5" rx="14" ry="7" fill="#00000030" />}
          <circle r="15" fill="#fff" stroke="#222" strokeWidth="1.5" />
          <circle r="11.5" fill={`url(#ludo-shine-${colour})`} stroke={hex.dark} strokeWidth="1" />
        </g>;
      })}
      {/* Back & Front: the picked-up token's lines of play, each ending in a marker to tap with the die it uses. */}
      {lines.map((p) => {
        const from = centre(cellOf(turn, game.tokens[turn][p.token], p.token));
        const points = [from, ...pathOf(game, p).map((t) => centre(cellOf(turn, t, p.token)))];
        const end = points[points.length - 1];
        const value = game.dice[p.die];
        const label = p.back ? `Capture backward ${value}` : `Move forward ${value}`;
        return <g key={`${p.die}${p.back ? "back" : "on"}`} className={`ludo-line${p.back ? " back" : ""}`}>
          <polyline points={points.map((q) => `${q.x},${q.y}`).join(" ")} />
          <g className="ludo-line-end" transform={`translate(${end.x} ${end.y})`} onClick={() => onPick(p)} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => { if (e.key === "Enter") onPick(p); }}>
            <circle r="16" /><text y="5">{p.back ? `↶${value}` : value}</text>
          </g>
        </g>;
      })}
      {/* The two dice, in the middle of the board. They tumble there when rolled. */}
      <g className={`ludo-dice${waitingToRoll ? " ready" : ""}`}>
        {shown.map(({ value, index }, i) => {
          const used = !rolling && game.dice.length > 0 && index < 0;
          const picked = !rolling && canChoose && index === die;
          const clickable = waitingToRoll || (canChoose && index >= 0 && usable.includes(index));
          const x = MIDDLE + (i === 0 ? -22 : 22);
          return <g key={i} transform={`translate(${x} ${MIDDLE})`}>
            <g className={`ludo-die${rolling ? ` tumbling t${i}` : ""}${used ? " used" : ""}${picked ? " picked" : ""}${clickable ? " clickable" : ""}`}
              onClick={clickable ? () => tapDie(index) : undefined} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
              aria-label={waitingToRoll ? "Roll the dice" : clickable ? `Use the ${value}` : undefined} onKeyDown={clickable ? (e) => { if (e.key === "Enter") tapDie(index); } : undefined}>
              <rect x={-DIE / 2 + 2} y={-DIE / 2 + 4} width={DIE} height={DIE} rx="7" fill="#00000040" />
              <rect className="face" x={-DIE / 2} y={-DIE / 2} width={DIE} height={DIE} rx="7" stroke={COLOUR_HEX[turn].fill} />
              {PIPS[value].map(([r, c]) => <circle key={`${r}${c}`} cx={(c - 2) * (DIE / 4.4)} cy={(r - 2) * (DIE / 4.4)} r="3.5" fill="#23302a" />)}
            </g>
          </g>;
        })}
      </g>
    </svg>
  </div>;
}
