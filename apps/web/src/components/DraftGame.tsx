"use client";

import { useEffect, useReducer, useState } from "react";
import { chooseTurn, LEVELS, type Level } from "@salone/games/draft/ai";
import { newDraftMatch, playTurn, type DraftMatch } from "@salone/games/draft/match";
import { countPieces, type Side, type Turn } from "@salone/games/draft/rules";
import DraftBoard, { resultText } from "@/components/draft/DraftBoard";
import DraftOnline from "@/components/draft/DraftOnline";
import { usePresence } from "@/online/presence";
import GameSetup, { SettingsButton, SetupOption, type Choice } from "@/components/GameSetup";
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

const MODES: Choice<Mode>[] = [
  { value: "cpu", label: "vs CPU", hint: "You play black against the computer." },
  { value: "online", label: "Online", hint: "Play a friend on their own device." },
  { value: "party", label: "Party (TV + phones)", hint: "This screen shows the board; players use their phones." },
];

// Draft starts on the setup screen; once the player starts, the game screen shows only the board.
export default function DraftGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  const [playing, setPlaying] = useState(false);
  usePresence("draft", mode, playing);
  if (!playing) return <GameSetup title="Draft" intro="Bottle-top draughts on a 10×10 board. Capture pieces by jumping them; reach the far row to crown a flying king." onStart={() => setPlaying(true)} startLabel={mode === "cpu" ? "START GAME" : "CONTINUE"}>
    <SetupOption label="PLAY" value={mode} choices={MODES} onChange={setMode} />
    {mode === "cpu" && <SetupOption label="LEVEL" value={level} choices={(Object.keys(LEVELS) as Level[]).map((key) => ({ value: key, label: LEVELS[key].label }))} onChange={setLevel} />}
  </GameSetup>;
  if (mode !== "cpu") return <DraftOnline mode={mode} onBack={onBack} onLocal={() => setPlaying(false)} />;
  return <LocalDraft level={level} onSettings={() => setPlaying(false)} onBack={onBack} />;
}

// Draft on one device, against the computer.
function LocalDraft({ level, onSettings, onBack }: { level: Level; onSettings: () => void; onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
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
  function backToGames() { onBack(); }

  return <main className="draft-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>DRAFT</strong><small>SIERRA LEONE · AFRICAN CHECKERS</small></div>
      <div className="draft-header-right">
        <SettingsButton onSettings={onSettings} />
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">YOU {counts.black} · CPU {counts.white}</span>
      </div>
    </header>
    <section className="draft-content">
      <DraftBoard match={match} picker={picker} suggestion={progress.length ? null : suggestion} waiting={side === CPU && !result}
        onTap={() => { sound.unlock(); dispatch({ type: "clear" }); }} />
      <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
      <div className="draft-actions">
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
