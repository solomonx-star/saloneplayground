"use client";

import { useEffect, useReducer, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { chooseMove, emptyBoard, isDraw, LEVELS, other, play, winner, type Board, type Level, type Mark, type Win } from "@/components/tictacto/rules";

type Mode = "cpu" | "friend";
// Against the computer the player is always X and the computer O; who goes first swaps every round.
const CPU_MARK: Mark = "O";
const CPU_DELAY_MS = 500;

type Result = Win | "draw" | null;
type State = { board: Board; toMove: Mark; starter: Mark; result: Result; scores: { X: number; O: number; draws: number }; last: number | null };
type Action = { type: "place"; cell: number } | { type: "next" } | { type: "restart" } | { type: "reset" };

const fresh = (): State => ({ board: emptyBoard(), toMove: "X", starter: "X", result: null, scores: { X: 0, O: 0, draws: 0 }, last: null });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset": return fresh();
    // Starts the round again with the same player going first.
    case "restart": return { ...state, board: emptyBoard(), toMove: state.starter, result: null, last: null };
    case "next": {
      const starter = other(state.starter);
      return { ...state, board: emptyBoard(), toMove: starter, starter, result: null, last: null };
    }
    case "place": {
      if (state.result || state.board[action.cell]) return state;
      const board = play(state.board, action.cell, state.toMove);
      const win = winner(board);
      const result: Result = win ?? (isDraw(board) ? "draw" : null);
      const scores = { ...state.scores };
      if (win) scores[win.mark]++;
      else if (result === "draw") scores.draws++;
      return { ...state, board, toMove: other(state.toMove), result, scores, last: action.cell };
    }
  }
}

// Cell centres in the 300×300 board drawing, for the line through a win.
const centre = (cell: number) => ({ x: (cell % 3) * 100 + 50, y: Math.floor(cell / 3) * 100 + 50 });

export default function TicTacToGame({ onBack }: { onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  const [mode, setMode] = useState<Mode>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  // Tic Tac To only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { board, toMove, result, scores, last, starter } = state;
  const cpuTurn = mode === "cpu" && toMove === CPU_MARK && !result;

  useEffect(() => { sound.muted = muted; }, [muted]);

  useEffect(() => {
    if (!cpuTurn) return;
    const timer = window.setTimeout(() => dispatch({ type: "place", cell: chooseMove(board, CPU_MARK, level) }), CPU_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [cpuTurn, board, level]);

  // A chalk tap for each mark, then a cheer, a low tone or a whistle when the round ends.
  useEffect(() => {
    if (last === null) return;
    if (!result) { sound.step(); return; }
    if (result === "draw") sound.whistle();
    else if (mode === "cpu" && result.mark === CPU_MARK) sound.lose();
    else sound.cheer();
  }, [last, result, mode]);

  // Number keys 1–9 play the cells, laid out like a phone keypad (1 is top left).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (n >= 1 && n <= 9 && !cpuTurn) { sound.unlock(); dispatch({ type: "place", cell: n - 1 }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cpuTurn]);

  function place(cell: number) { if (!cpuTurn) { sound.unlock(); dispatch({ type: "place", cell }); } }
  function changeMode(value: Mode) { setMode(value); dispatch({ type: "reset" }); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const name = (mark: Mark) => (mode === "cpu" ? (mark === CPU_MARK ? "The computer" : "You") : `Player ${mark}`);
  const message = result === "draw" ? "Draw — nobody got three in a row."
    : result ? (mode === "cpu" ? (result.mark === CPU_MARK ? "The computer got three in a row." : "Three in a row — you win!") : `Player ${result.mark} wins!`)
      : cpuTurn ? "The computer is thinking…"
        : mode === "cpu" ? (board.every((c) => !c) ? `${starter === "X" ? "You go" : "The computer goes"} first this round. Get three in a row.` : "Your move.")
          : `Player ${toMove}'s move.`;
  const labels = mode === "cpu" ? { X: "YOU", O: "CPU" } : { X: "X", O: "O" };
  const line = result && result !== "draw" ? [centre(result.line[0]), centre(result.line[2])] : null;

  return <main className="draft-screen ttt-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>TIC TAC TO</strong><small>THREE IN A ROW</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">{labels.X} {scores.X} · {labels.O} {scores.O} · DRAW {scores.draws}</span>
      </div>
    </header>
    <section className="draft-content">
      <div className="draft-intro"><p className="eyebrow">CHALK AND SLATE</p><h1>Three in a row.</h1><p>Take turns marking the squares. Line up three before your opponent does.</p></div>
      <div className={`ttt-board${cpuTurn ? " waiting" : ""}`} role="grid" aria-label="Tic Tac To board">
        {board.map((cell, i) => {
          const winning = result && result !== "draw" && result.line.includes(i);
          return <button key={i} role="gridcell" className={`ttt-cell${winning ? " win" : ""}`} onClick={() => place(i)} disabled={!!cell || !!result} aria-label={`Square ${i + 1}${cell ? `, ${cell}` : ", empty"}`}>
            {cell === "X" && <svg viewBox="0 0 100 100" className="ttt-mark x" aria-hidden="true"><path d="M24 24 L76 76" /><path d="M76 24 L24 76" /></svg>}
            {cell === "O" && <svg viewBox="0 0 100 100" className="ttt-mark o" aria-hidden="true"><circle cx="50" cy="50" r="27" /></svg>}
          </button>;
        })}
        {line && <svg className="ttt-line" viewBox="0 0 300 300" aria-hidden="true"><line x1={line[0].x} y1={line[0].y} x2={line[1].x} y2={line[1].y} /></svg>}
      </div>
      <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
      <div className="draft-actions">
        <div className="draft-buttons">
          <label className="player-select"><span className="select-label">PLAY</span> <select value={mode} onChange={(e) => changeMode(e.target.value as Mode)}><option value="cpu">vs CPU</option><option value="friend">2 players</option></select></label>
          {mode === "cpu" && <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
        </div>
        <span className="draft-turn">{result ? "ROUND OVER" : `${name(toMove).toUpperCase()} · ${toMove}`}</span>
        <div className="draft-buttons">
          <button onClick={() => dispatch({ type: result ? "next" : "restart" })} className={result ? "draft-stop" : ""}>{result ? "NEXT ROUND" : "RESTART ROUND"}</button>
          <button onClick={() => dispatch({ type: "reset" })}>NEW MATCH</button>
        </div>
      </div>
    </section>
  </main>;
}
