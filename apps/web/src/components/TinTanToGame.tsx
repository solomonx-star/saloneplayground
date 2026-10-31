"use client";

import { useEffect, useReducer, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { chooseMove, DRAW_RULES, HOME, LEVELS, NEIGHBOURS, other, play, positionKey, resultAfter, startBoard, type Board, type Level, type Mark, type Move, type Result } from "@salone/games/tintanto/rules";

type Mode = "cpu" | "friend";
// Against the computer you are X (blue, bottom row) and the computer is O (orange, top row). Who moves first
// swaps every round.
const CPU_MARK: Mark = "O";
const CPU_DELAY_MS = 600;

// Pieces keep an id so each one slides from point to point instead of jumping.
type Piece = { id: number; mark: Mark; at: number };
type State = {
  board: Board; pieces: Piece[]; toMove: Mark; starter: Mark; result: Result; scores: { X: number; O: number; draws: number };
  last: Move | null; selected: number | null; seen: Record<string, number>; moves: number;
};
type Action = { type: "select"; point: number | null } | { type: "move"; move: Move } | { type: "next" } | { type: "restart" } | { type: "reset" };

const newRound = (starter: Mark) => {
  const board = startBoard();
  const pieces = board.flatMap((mark, at): Piece[] => (mark ? [{ id: at, mark, at }] : []));
  return { board, pieces, toMove: starter, starter, result: null, last: null, selected: null, seen: { [positionKey(board, starter)]: 1 }, moves: 0 };
};
const fresh = (): State => ({ ...newRound("X"), scores: { X: 0, O: 0, draws: 0 } });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset": return fresh();
    // Starts the round again with the same side moving first.
    case "restart": return { ...state, ...newRound(state.starter) };
    case "next": return { ...state, ...newRound(other(state.starter)) };
    case "select": return state.result ? state : { ...state, selected: action.point };
    case "move": {
      const { from, to } = action.move;
      if (state.result || state.board[from] !== state.toMove || state.board[to] || !NEIGHBOURS[from].includes(to)) return state;
      const board = play(state.board, action.move);
      const toMove = other(state.toMove);
      const key = positionKey(board, toMove);
      const seen = { ...state.seen, [key]: (state.seen[key] ?? 0) + 1 };
      const moves = state.moves + 1;
      const result = resultAfter(board, toMove, seen[key], moves);
      const scores = { ...state.scores };
      if (result === "draw") scores.draws++;
      else if (result) scores[result.mark]++;
      const pieces = state.pieces.map((p) => (p.at === from ? { ...p, at: to } : p));
      return { ...state, board, pieces, toMove, result, scores, last: action.move, selected: null, seen, moves };
    }
  }
}

// Point positions in the 300×420 board drawing: a tall rectangle, as it is drawn on paper.
const COLUMNS = [40, 150, 260];
const ROWS = [50, 210, 370];
const spot = (point: number) => ({ x: COLUMNS[point % 3], y: ROWS[Math.floor(point / 3)] });
const isHome = (point: number) => HOME.X.includes(point) || HOME.O.includes(point);

export default function TinTanToGame({ onBack }: { onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  const [mode, setMode] = useState<Mode>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  // Tin Tan To only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { board, pieces, toMove, result, scores, last, starter, selected, moves } = state;
  const cpuTurn = mode === "cpu" && toMove === CPU_MARK && !result;

  useEffect(() => { sound.muted = muted; }, [muted]);

  useEffect(() => {
    if (!cpuTurn) return;
    const timer = window.setTimeout(() => {
      const move = chooseMove(board, CPU_MARK, level);
      if (move) dispatch({ type: "move", move });
    }, CPU_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [cpuTurn, board, level]);

  // A tap for each move, then a cheer, a low tone or a whistle when the round ends.
  useEffect(() => {
    if (!last) return;
    if (!result) { sound.step(); return; }
    if (result === "draw") sound.whistle();
    else if (mode === "cpu" && result.mark === CPU_MARK) sound.lose();
    else sound.cheer();
  }, [last, result, mode]);

  // Tapping your own piece picks it up (tap again to put it down); tapping a lit point moves it there.
  function tap(point: number) {
    if (cpuTurn || result) return;
    sound.unlock();
    if (board[point] === toMove) { dispatch({ type: "select", point: selected === point ? null : point }); return; }
    if (selected !== null && !board[point] && NEIGHBOURS[selected].includes(point)) dispatch({ type: "move", move: { from: selected, to: point } });
  }

  // Number keys 1–9 tap the points, laid out like a phone keypad (1 is top left).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (n >= 1 && n <= 9) tap(n - 1);
      if (event.key === "Escape") dispatch({ type: "select", point: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function changeMode(value: Mode) { setMode(value); dispatch({ type: "reset" }); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const targets = selected === null ? [] : NEIGHBOURS[selected].filter((p) => !board[p]);
  const name = (mark: Mark) => (mode === "cpu" ? (mark === CPU_MARK ? "The computer" : "You") : `Player ${mark}`);
  const colour = (mark: Mark) => (mark === "X" ? "blue" : "orange");
  const message = result === "draw" ? (moves >= DRAW_RULES.moves ? `Draw — ${DRAW_RULES.moves} moves and no three in a row.` : "Draw — the same position came round three times.")
    : result ? (mode === "cpu" ? (result.mark === CPU_MARK ? "The computer made three in a row." : "Three in a row — you win!") : `Player ${result.mark} (${colour(result.mark)}) wins!`)
      : cpuTurn ? "The computer is thinking…"
        : selected !== null ? (targets.length ? "Now tap a lit point to slide there." : "That piece is boxed in — pick another.")
          : mode === "cpu" ? (moves === 0 ? `${starter === "X" ? "You move" : "The computer moves"} first this round. Tap one of your blue pieces.` : "Your move — tap one of your blue pieces.")
            : `Player ${toMove}'s move (${colour(toMove)}).`;
  const labels = mode === "cpu" ? { X: "YOU", O: "CPU" } : { X: "X", O: "O" };
  const line = result && result !== "draw" && result.line.length ? [spot(result.line[0]), spot(result.line[2])] : null;

  return <main className="draft-screen ttt-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>TIN TAN TO</strong><small>SLIDE TO THREE IN A ROW</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">{labels.X} {scores.X} · {labels.O} {scores.O} · DRAW {scores.draws}</span>
      </div>
    </header>
    <section className="draft-content">
      <div className="draft-intro"><p className="eyebrow">PEN AND PAPER</p><h1>Three pieces each.</h1><p>Take turns sliding one piece along a line to the next empty point. Make three in a row on any line — except your own home row.</p></div>
      <div className={`ttt-board${cpuTurn ? " waiting" : ""}`} role="group" aria-label="Tin Tan To board">
        <svg className="ttt-art" viewBox="0 0 300 420" aria-hidden="true">
          <text className="ttt-side" x="150" y="24">{mode === "cpu" ? "CPU · HOME ROW" : "PLAYER O · HOME ROW"}</text>
          <text className="ttt-side" x="150" y="408">{mode === "cpu" ? "YOUR HOME ROW" : "PLAYER X · HOME ROW"}</text>
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
          return <button key={p} className="ttt-point" style={{ left: `${(s.x / 300) * 100}%`, top: `${(s.y / 420) * 100}%` }} onClick={() => tap(p)} disabled={!!result || cpuTurn} aria-label={`Point ${p + 1}, ${what}`} />;
        })}
      </div>
      <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
      <div className="draft-actions">
        <div className="draft-buttons">
          <label className="player-select"><span className="select-label">PLAY</span> <select value={mode} onChange={(e) => changeMode(e.target.value as Mode)}><option value="cpu">vs CPU</option><option value="friend">2 players</option></select></label>
          {mode === "cpu" && <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
        </div>
        <span className="draft-turn">{result ? "ROUND OVER" : `${name(toMove).toUpperCase()} · ${colour(toMove).toUpperCase()}`}</span>
        <div className="draft-buttons">
          <button onClick={() => dispatch({ type: result ? "next" : "restart" })} className={result ? "draft-stop" : ""}>{result ? "NEXT ROUND" : "RESTART ROUND"}</button>
          <button onClick={() => dispatch({ type: "reset" })}>NEW MATCH</button>
        </div>
      </div>
    </section>
  </main>;
}
