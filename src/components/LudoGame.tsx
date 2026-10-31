"use client";

import { useEffect, useRef, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { ARROWS, cellOf, COLOUR_HEX, COLUMN_CELLS, HOME_CELL, SIZE, TRACK_CELLS, YARD, type Cell } from "@/components/ludo/board";
import { ARROW_TIPS, chooseMove, COLOURS, COLUMN, current, LEVELS, NO_RULES, newGame, pathOf, play as makeMove, plays, rolled, RULES, skip, START, taxiOf, TURN_SECONDS, type Colour, type Game, type Level, type Play, type Rule, type Rules } from "@/components/ludo/rules";

type Opponents = "cpu" | "friends";
// A token sliding square by square: the move being made, the cells it passes through, and how far along it is.
type Moving = { colour: Colour; play: Play; path: Cell[]; step: number };

const CELL = 40;
const MIDDLE = (SIZE * CELL) / 2;
const DIE = 38;
const STEP_MS = 130;
const CPU_ROLL_MS = 650;
const CPU_PICK_MS = 500;
// How long the dice tumble in the middle of the board, and how often their faces flicker while they do.
const ROLL_MS = 850;
const FLICKER_MS = 75;
// Against the computer you are always red. The game plays for you at this level when the turn timer runs out.
const YOU: Colour = "red";
const STAND_IN: Level = "normal";
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};
const LINE = "#111";
const title = (colour: Colour) => colour[0].toUpperCase() + colour.slice(1);
const centre = ([r, c]: Cell) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL });
const face = () => 1 + Math.floor(Math.random() * 6);

export default function LudoGame({ onBack }: { onBack: () => void }) {
  const [rules, setRules] = useState<Rules>(NO_RULES);
  const [players, setPlayers] = useState(4);
  const [opponents, setOpponents] = useState<Opponents>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  const [game, setGame] = useState<Game>(() => newGame(4));
  // The two dice as last rolled (or flickering while they roll), and which of the dice still to play is picked.
  const [pair, setPair] = useState<[number, number]>([6, 6]);
  const [chosen, setChosen] = useState(0);
  // Back & Front: the token picked up to show its lines of play, when it can capture backward.
  const [selected, setSelected] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [notice, setNotice] = useState("Two dice, four tokens each. Switch on any house rules below, then roll.");
  // Turn Timer: when the current action began.
  const [actionAt, setActionAt] = useState(() => Date.now());
  // Ludo only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  // The latest game, for timers that finish after a re-render.
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);
  // The roll in progress, so a new game can cancel it.
  const rollTimers = useRef<number[]>([]);
  // Whether something worth reading (a capture, a token home…) has happened this roll, so a routine message from
  // the next move does not replace it.
  const news = useRef(false);

  const turn = current(game);
  const humans: Colour[] = opponents === "cpu" ? [YOU] : game.seats;
  const human = humans.includes(turn);
  const busy = rolling || !!moving || !!game.winner;
  const options = busy ? [] : plays(game);
  // The die in use: the one picked if it can move something, otherwise the first that can.
  const usable = [...new Set(options.map((p) => p.die))];
  const die = usable.includes(chosen) ? chosen : usable[0];
  const forDie = options.filter((p) => p.die === die);
  const movableTokens = new Set(forDie.map((p) => p.token));
  // Back & Front: tokens that can capture backward with either die. Tapping one shows all its lines of play
  // (backward captures in red, forward moves in green) instead of moving it straight away.
  const choosers = new Set(human ? options.filter((p) => p.back).map((p) => p.token) : []);
  const lines = selected !== null && choosers.has(selected) ? options.filter((p) => p.token === selected) : [];
  const canChoose = human && new Set(usable.map((d) => game.dice[d])).size > 1;
  const taxiDriving = game.taxis.find((t) => t.driver.colour === turn);
  // Each die on show, and its index among the dice still to play (-1 once it has been used).
  const left = [...game.dice];
  const shown = pair.map((value) => { const index = left.indexOf(value); if (index >= 0) left[index] = -1; return { value, index }; });
  const timed = game.rules.timer && human && !game.winner;

  useEffect(() => { sound.muted = muted; }, [muted]);

  const name = (colour: Colour) => (opponents === "friends" ? title(colour) : colour === YOU ? "You" : `${title(colour)} (CPU)`);

  // Every change to the game restarts the turn timer.
  function update(next: Game) { setGame(next); setSelected(null); setActionAt(() => Date.now()); }

  function start(nextRules = rules, nextPlayers = players) {
    rollTimers.current.forEach((t) => { window.clearInterval(t); window.clearTimeout(t); });
    setMoving(null); setRolling(false);
    update(newGame(nextPlayers, nextRules));
    const on = (Object.keys(RULES) as Rule[]).filter((r) => nextRules[r]).map((r) => RULES[r].label);
    setNotice(on.length ? `New game with ${on.join(", ")}.` : "New game, no house rules.");
  }

  // The dice tumble in the middle of the board, faces flickering, then land.
  function roll() {
    if (busy || game.dice.length) return;
    sound.unlock();
    setRolling(true);
    const flicker = window.setInterval(() => { setPair([face(), face()]); sound.step(); }, FLICKER_MS);
    const land = window.setTimeout(() => {
      news.current = false;
      window.clearInterval(flicker);
      const a = face(); const b = face();
      const after = rolled(gameRef.current, a, b);
      setPair([a, b]);
      setChosen(0);
      setRolling(false);
      update(after);
      sound.touch();
      const who = name(current(after));
      const double = after.bonus ? " A double — another roll after this." : "";
      const taxi = after.taxis.some((t) => t.driver.colour === current(after)) ? " Both dice go to the taxi." : "";
      setNotice(plays(after).length ? `${who} rolled ${a} and ${b}.${double}${taxi}` : `${who} rolled ${a} and ${b} — nothing can move.`);
    }, ROLL_MS);
    rollTimers.current = [flicker, land];
  }

  // Slides a token along its path, then makes the move.
  function pick(chosenPlay: Play) {
    if (busy || !options.some((p) => p.token === chosenPlay.token && p.die === chosenPlay.die && !!p.back === !!chosenPlay.back)) return;
    const colour = current(game);
    setSelected(null);
    setChosen(chosenPlay.die);
    setMoving({ colour, play: chosenPlay, path: pathOf(game, chosenPlay).map((t) => cellOf(colour, t, chosenPlay.token)), step: 0 });
  }

  // Tapping a token moves it with the die in use. A token that could capture backward is picked up instead, to
  // show its lines of play; tapping it again puts it down.
  function tapToken(token: number) {
    if (choosers.has(token)) { setSelected(selected === token ? null : token); return; }
    setSelected(null);
    const mine = forDie.filter((p) => p.token === token);
    if (mine.length) pick(mine[0]);
  }

  // Tapping a die picks it (when the two can move different tokens); with none rolled, it rolls them.
  function tapDie(index: number) {
    if (!human) return;
    if (!game.dice.length) { roll(); return; }
    if (index >= 0 && usable.includes(index)) setChosen(index);
  }

  useEffect(() => {
    if (!moving) return;
    if (moving.step < moving.path.length - 1) {
      const timer = window.setTimeout(() => { sound.step(); setMoving({ ...moving, step: moving.step + 1 }); }, STEP_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      const before = gameRef.current;
      const colour = current(before);
      const { game: after, outcome } = makeMove(before, moving.play);
      setMoving(null);
      setChosen(0);
      update(after);
      const who = name(colour);
      const again = !after.winner && current(after) === colour && !after.dice.length;
      const more = after.dice.length ? " after this" : "";
      const routine = !after.winner && !outcome.hanged && !outcome.poisoned && !outcome.dropped && !outcome.captured.length && !outcome.home;
      if (!routine) news.current = true;
      if (after.winner) {
        if (opponents === "friends" || humans.includes(after.winner)) sound.cheer(); else sound.lose();
        setNotice(`${name(after.winner)} ${after.winner === YOU && opponents === "cpu" ? "win" : "wins"}!`);
      } else if (outcome.hanged) { sound.lose(); setNotice(`${who} landed on step 55 and got hanged — back to the yard.`); }
      else if (outcome.poisoned) { sound.lose(); setNotice(`${who} landed on a poison arrow — back to the yard.`); }
      else if (outcome.dropped) { sound.point(); setNotice("The taxi dropped its rider at the home entrance and goes back to the yard."); }
      else if (outcome.taxi) { sound.touch(); setNotice(`${who} captured ${title(outcome.captured[0].colour)}! That token is now a taxi carrying ${colour === YOU && opponents === "cpu" ? "yours" : `${title(colour)}'s`} to its home entrance — and another roll${more}.`); }
      else if (outcome.captured.length) { sound.touch(); setNotice(`${who} captured ${outcome.captured.map((v) => title(v.colour)).join(" and ")}${moving.play.back ? " moving backward" : ""}! Back to the yard — and another roll${more}.`); }
      else if (outcome.home) { sound.point(); setNotice(`${who} got a token home — another roll${more}.`); }
      else if (news.current) return;
      else if (again) setNotice(`${who} roll${colour === YOU && opponents === "cpu" ? "" : "s"} again.`);
      else if (current(after) !== colour && before.dice.length > 1) setNotice(`${who} could not use the other die.`);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  });

  // Nothing can move: end the roll after a moment. Only one move possible: make it for the player.
  useEffect(() => {
    if (busy || !game.dice.length) return;
    if (!options.length) { const timer = window.setTimeout(() => update(skip(gameRef.current)), 1100); return () => window.clearTimeout(timer); }
    if (human && options.length === 1) { const timer = window.setTimeout(() => pick(options[0]), 400); return () => window.clearTimeout(timer); }
  });

  // The computer rolls, then picks its moves.
  useEffect(() => {
    if (human || busy) return;
    if (!game.dice.length) { const timer = window.setTimeout(roll, CPU_ROLL_MS); return () => window.clearTimeout(timer); }
    if (!options.length) return;
    const timer = window.setTimeout(() => { const next = chooseMove(game, level); if (next) pick(next); }, CPU_PICK_MS);
    return () => window.clearTimeout(timer);
  });

  // Turn Timer: when a player's time runs out, the game rolls or moves for them.
  function timeUp() {
    if (busy) return;
    setNotice(`Time's up — the game played for ${opponents === "cpu" ? "you" : title(turn)}.`);
    if (!game.dice.length) roll();
    else { const next = chooseMove(game, STAND_IN); if (next) pick(next); }
  }

  // Space or Enter rolls; number keys 1–4 move your tokens with the die in use; D swaps the die.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (!human || tag === "SELECT" || tag === "BUTTON") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); roll(); }
      if (event.key === "Escape") setSelected(null);
      if ((event.key === "d" || event.key === "D") && canChoose) setChosen(usable[(usable.indexOf(die) + 1) % usable.length]);
      const n = Number(event.key);
      if (n >= 1 && n <= 4 && (movableTokens.has(n - 1) || choosers.has(n - 1))) tapToken(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleRule(rule: Rule) { const next = { ...rules, [rule]: !rules[rule] }; setRules(next); start(next); }
  function changePlayers(value: number) { setPlayers(value); start(rules, value); }
  function changeOpponents(value: Opponents) { setOpponents(value); start(); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  // Every token's spot on the board. A token riding in a taxi sits on top of it and moves with it. Tokens sharing
  // a square are spread out a little so all can be seen; tokens home sit smaller along the edge of their triangle.
  const cellNow = (colour: Colour, index: number): Cell => {
    const taxi = taxiOf(game, { colour, index });
    if (taxi && taxi.rider.colour === colour && taxi.rider.index === index) return cellNow(taxi.driver.colour, taxi.driver.index);
    if (moving && moving.colour === colour && moving.play.token === index) return moving.path[moving.step];
    return cellOf(colour, game.tokens[colour][index], index);
  };
  const spots = game.seats.flatMap((colour) => game.tokens[colour].map((token, index) => {
    const taxi = taxiOf(game, { colour, index });
    const riding = !!taxi && taxi.rider.colour === colour && taxi.rider.index === index;
    const cell = cellNow(colour, index);
    const isMoving = moving && moving.colour === colour && moving.play.token === index;
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

  const ruleCount = (Object.keys(RULES) as Rule[]).filter((r) => game.rules[r]).length;
  const waitingToRoll = human && !game.dice.length && !busy;
  const status = game.winner ? "GAME OVER" : `${name(turn).toUpperCase()} · ${rolling ? "ROLLING" : !game.dice.length ? "TO ROLL" : moving ? "MOVING" : options.length ? (taxiDriving ? "DRIVING THE TAXI" : "TO MOVE") : "NO MOVE"}`;
  const prompt = game.winner ? notice
    : waitingToRoll ? `${notice} ${opponents === "friends" ? `${title(turn)} to roll` : "Your roll"} — tap the dice.`
      : human && taxiDriving && !busy ? `${notice} Your token is a taxi: tap it to drive it on ${game.dice[die]}.`
        : lines.length ? "Pick a line of play: tap the red ↶ end to capture backward, or the green end to move forward. Tap the token again to put it down."
          : human && canChoose && !busy ? `${notice} Using the ${game.dice[die]}: tap a glowing token, or tap the other die.${choosers.size ? " A red-ringed token can capture backward — tap it to see its lines of play." : ""}`
            : human && options.length > 1 && !busy ? `${notice} Tap a glowing token to move it ${game.dice[die]}.${choosers.size ? " A red-ringed token can capture backward — tap it to see its lines of play." : ""}`
              : notice;

  return <main className="draft-screen ludo-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>LUDO</strong><small>{ruleCount ? `${ruleCount} HOUSE RULE${ruleCount > 1 ? "S" : ""}` : "TWO DICE"}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">{game.seats.map((c) => `${title(c).toUpperCase()} ${game.tokens[c].filter((t) => t.where === "home").length}/${game.tokens[c].length}`).join(" · ")}</span>
      </div>
    </header>
    <section className="draft-content ludo-content">
      <div className="ludo-board-wrap">
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
              <text x={(col + 3) * CELL} y={(r + 5.45) * CELL} className="ludo-player">Player {n + 1}</text>
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
              onClick={movable ? () => tapToken(index) : undefined} role={movable ? "button" : undefined} tabIndex={movable ? 0 : undefined}
              aria-label={canBack ? `Show the lines of play for ${colour} token ${index + 1}, which can capture backward` : movable ? `Move ${colour} token ${index + 1} by ${game.dice[die]}${driving ? " (taxi)" : ""}` : riding ? `${colour} token riding in a taxi` : undefined} onKeyDown={movable ? (e) => { if (e.key === "Enter") tapToken(index); } : undefined}>
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
              <g className="ludo-line-end" transform={`translate(${end.x} ${end.y})`} onClick={() => pick(p)} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => { if (e.key === "Enter") pick(p); }}>
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
      </div>
      <div className="ludo-panel">
        <button className="ludo-roll" onClick={roll} disabled={!waitingToRoll} style={{ background: waitingToRoll ? COLOUR_HEX[turn].fill : undefined }}>{rolling ? "ROLLING…" : "ROLL DICE"}</button>
        <div className="ludo-turn" style={{ color: COLOUR_HEX[turn].light }}>{status}</div>
        <div className={`draft-message ${game.winner ? "finished" : ""}`} role="status">{prompt}</div>
        {timed && <TurnClock since={actionAt} paused={busy || (!!game.dice.length && !options.length)} onTimeUp={timeUp} />}
      </div>
      <div className="ludo-rules" role="group" aria-label="House rules">
        {(Object.keys(RULES) as Rule[]).map((rule, i) => <button key={rule} className={rules[rule] ? "on" : ""} aria-pressed={rules[rule]} onClick={() => toggleRule(rule)} title={RULES[rule].blurb}><b>{i + 1}</b>{RULES[rule].label}</button>)}
      </div>
      <p className="ludo-rules-help">{(Object.keys(RULES) as Rule[]).filter((r) => rules[r]).map((r) => RULES[r].blurb).join(" ") || "No house rules on: a double 6, a capture or a token reaching home earns another roll. Tap a rule to switch it on (this starts a new game)."}</p>
      <div className="draft-actions">
        <div className="draft-buttons">
          <label className="player-select"><span className="select-label">PLAYERS</span> <select value={players} onChange={(e) => changePlayers(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="player-select"><span className="select-label">PLAY</span> <select value={opponents} onChange={(e) => changeOpponents(e.target.value as Opponents)}><option value="cpu">vs CPU</option><option value="friends">Pass and play</option></select></label>
        </div>
        <div className="draft-buttons">
          {opponents === "cpu" && <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
          <button onClick={() => start()} className={game.winner ? "draft-stop" : ""}>NEW GAME</button>
        </div>
      </div>
    </section>
  </main>;
}

// Turn Timer: counts down from the start of the current action and calls `onTimeUp` once if it runs out. It keeps
// its own clock so its ticking does not re-render the board (which would restart the board's own timers).
function TurnClock({ since, paused, onTimeUp }: { since: number; paused: boolean; onTimeUp: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(onTimeUp);
  const firedFor = useRef(0);
  useEffect(() => { latest.current = onTimeUp; });
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, []);
  const left = Math.min(TURN_SECONDS, Math.max(0, Math.ceil(TURN_SECONDS - (now - since) / 1000)));
  useEffect(() => {
    if (paused || left > 0 || firedFor.current === since) return;
    firedFor.current = since;
    latest.current();
  }, [paused, left, since]);
  const shown = paused ? TURN_SECONDS : left;
  return <div className={`ludo-timer${shown <= 10 ? " low" : ""}`} role="timer" aria-label={`${shown} seconds left`}>
    <span>{shown}s</span><i><b style={{ width: `${(shown / TURN_SECONDS) * 100}%` }} /></i>
  </div>;
}
