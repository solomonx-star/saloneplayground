"use client";

import { useEffect, useReducer, useState } from "react";
import { chooseTurn, LEVELS, type Level } from "@salone/games/draft/ai";
import { newDraftMatch, playTurn, type DraftMatch } from "@salone/games/draft/match";
import { countPieces, type Side, type Turn } from "@salone/games/draft/rules";
import DraftBoard, { resultText } from "@/components/draft/DraftBoard";
import DraftOnline from "@/components/draft/DraftOnline";
import { CHAIN_HINT, useDraftPicker } from "@/components/draft/useDraftPicker";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";

type Mode = "cpu" | "online" | "party";
// The player is Black and moves first; the computer is White.
const HUMAN: Side = "black";
const CPU: Side = "white";
const CPU_DELAY_MS = 450;

type State = {
  match: DraftMatch;
  // The game at the start of each of the player's turns, for undo.
  history: DraftMatch[];
  // A move suggested by the HINT button, shown on the board until the player taps.
  suggestion: Turn | null;
};
type Action = { type: "play"; turn: Turn } | { type: "cpu"; turn: Turn } | { type: "suggest"; turn: Turn } | { type: "clear" } | { type: "undo" } | { type: "reset" };

const fresh = (): State => ({ match: newDraftMatch(), history: [], suggestion: null });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset": return fresh();
    case "undo": {
      const previous = state.history[state.history.length - 1];
      return previous ? { match: previous, history: state.history.slice(0, -1), suggestion: null } : state;
    }
    case "suggest":
      return state.match.side === HUMAN && !state.match.result ? { ...state, suggestion: action.turn } : state;
    case "clear":
      return state.suggestion ? { ...state, suggestion: null } : state;
    case "play":
      return state.match.side === HUMAN && !state.match.result ? { match: playTurn(state.match, action.turn), history: [...state.history, state.match], suggestion: null } : state;
    case "cpu":
      return state.match.side === CPU && !state.match.result ? { ...state, match: playTurn(state.match, action.turn) } : state;
  }
}

export default function DraftGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("cpu");
  if (mode !== "cpu") return <DraftOnline mode={mode} onBack={onBack} onLocal={() => setMode("cpu")} />;
  return <LocalDraft onMode={setMode} onBack={onBack} />;
}

// Draft on one device, against the computer.
function LocalDraft({ onMode, onBack }: { onMode: (mode: Mode) => void; onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  const [level, setLevel] = useState<Level>("normal");
  // Draft only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { match, suggestion } = state;
  const { board, side, last, result } = match;
  const picker = useDraftPicker(board, HUMAN, side === HUMAN && !result, (turn) => dispatch({ type: "play", turn }));
  const { progress, canCapture } = picker;

  useEffect(() => { sound.muted = muted; }, [muted]);

  // The computer replies after a short pause so its move is easy to follow.
  useEffect(() => {
    if (side !== CPU || result) return;
    const timer = window.setTimeout(() => {
      const turn = chooseTurn(board, CPU, level);
      if (turn) dispatch({ type: "cpu", turn });
    }, CPU_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [side, board, result, level]);

  // Sounds follow the board: a click for a move, a thud for a capture, a chime for a new king, and the result.
  useEffect(() => {
    if (!last) return;
    if (result) { if (result.winner === HUMAN) sound.cheer(); else if (result.winner === CPU) sound.lose(); else sound.whistle(); return; }
    if (last.captured.length) sound.touch(); else sound.step();
    if (last.crowned) sound.point();
  }, [last, result]);

  const counts = countPieces(board);
  const message = result ? resultText(result, (s) => (s === HUMAN ? "You" : "The computer"))
    : picker.hint ?? (side === CPU ? "Computer is thinking…"
      : progress.length ? CHAIN_HINT
        : suggestion ? suggestion.captured.length ? `Suggestion: jump with the marked piece to take ${suggestion.captured.length}.` : "Suggestion: move the marked piece to the marked square."
          : canCapture ? "You can capture with a glowing piece, or leave it and set a trap."
            : !last ? "Black moves first — the Blackman Trouble Rule." : "Your move.");

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  // Uses the Normal computer to suggest a move for the player.
  function suggest() { const turn = chooseTurn(board, HUMAN, "normal"); if (turn) dispatch({ type: "suggest", turn }); }
  // Part-way through a capture chain, undo only cancels the jumps made so far.
  function undo() { if (progress.length) picker.cancel(); else dispatch({ type: "undo" }); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  return <main className="draft-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>DRAFT</strong><small>SIERRA LEONE · AFRICAN CHECKERS</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">YOU {counts.black} · CPU {counts.white}</span>
      </div>
    </header>
    <section className="draft-content">
      <div className="draft-intro"><p className="eyebrow">BOTTLE-TOP DRAUGHTS</p><h1>Plan your next move.</h1><p>Capture pieces by jumping them. Reach the far row to crown a flying king.</p></div>
      <DraftBoard match={match} picker={picker} suggestion={progress.length ? null : suggestion} waiting={side === CPU && !result}
        onTap={() => { sound.unlock(); dispatch({ type: "clear" }); }} />
      <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
      <div className="draft-actions">
        <div className="draft-buttons">
          <label className="player-select"><span className="select-label">PLAY</span> <select value="cpu" onChange={(e) => onMode(e.target.value as Mode)}><option value="cpu">vs CPU</option><option value="online">Online</option><option value="party">Party (TV + phones)</option></select></label>
          <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
        </div>
        <span className="draft-turn">{result ? "GAME OVER" : side === HUMAN ? "YOUR MOVE" : "COMPUTER'S MOVE"}{canCapture && !progress.length ? " · CAPTURE AVAILABLE" : ""}</span>
        <div className="draft-buttons">
          {progress.length > 0
            ? <button className="draft-stop" onClick={picker.stop}>STOP HERE</button>
            : <button onClick={suggest} disabled={side !== HUMAN || !!result}>HINT</button>}
          <button onClick={undo} disabled={!progress.length && (!state.history.length || side === CPU && !result)}>UNDO</button>
          <button onClick={() => dispatch({ type: "reset" })}>{result ? "PLAY AGAIN" : "NEW GAME"}</button>
        </div>
      </div>
    </section>
  </main>;
}
