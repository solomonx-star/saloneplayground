"use client";

import { useEffect, useReducer, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import Board, { colour } from "@/components/tintanto/Board";
import TinTanToOnline from "@/components/tintanto/TinTanToOnline";
import { usePresence } from "@/online/presence";
import GameSetup, { SettingsButton, SetupOption, type Choice } from "@/components/GameSetup";
import { applyMove, newMatch, nextRound, restartRound, type Match } from "@salone/games/tintanto/match";
import { chooseMove, DRAW_RULES, LEVELS, NEIGHBOURS, type Level, type Mark, type Move } from "@salone/games/tintanto/rules";

type Mode = "cpu" | "friend" | "online" | "party";
// Against the computer you are X (blue, bottom row) and the computer is O (orange, top row). Who moves first
// swaps every round.
const CPU_MARK: Mark = "O";
const CPU_DELAY_MS = 600;

type State = { match: Match; selected: number | null };
type Action = { type: "select"; point: number | null } | { type: "move"; move: Move } | { type: "next" } | { type: "restart" } | { type: "reset" };

const fresh = (): State => ({ match: newMatch(), selected: null });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset": return fresh();
    case "restart": return { match: restartRound(state.match), selected: null };
    case "next": return { match: nextRound(state.match), selected: null };
    case "select": return state.match.result ? state : { ...state, selected: action.point };
    case "move": return { match: applyMove(state.match, action.move), selected: null };
  }
}

const MODES: Choice<Mode>[] = [
  { value: "cpu", label: "vs CPU", hint: "You play blue against the computer." },
  { value: "friend", label: "2 players", hint: "Two players take turns on this device." },
  { value: "online", label: "Online", hint: "Play a friend on their own device." },
  { value: "party", label: "Party (TV + phones)", hint: "This screen shows the board; players use their phones." },
];

// Tin Tan To starts on the setup screen; once the player starts, the game screen shows only the board.
export default function TinTanToGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  const [playing, setPlaying] = useState(false);
  const local = mode === "cpu" || mode === "friend";
  usePresence("tin-tan-to", mode, playing);
  if (!playing) return <GameSetup title="Tin Tan To" intro="Three pieces each. Take turns sliding one piece along a line to the next empty point. Make three in a row on any line — except your own home row." onStart={() => setPlaying(true)} startLabel={local ? "START GAME" : "CONTINUE"}>
    <SetupOption label="PLAY" value={mode} choices={MODES} onChange={setMode} />
    {mode === "cpu" && <SetupOption label="LEVEL" value={level} choices={(Object.keys(LEVELS) as Level[]).map((key) => ({ value: key, label: LEVELS[key].label }))} onChange={setLevel} />}
  </GameSetup>;
  if (mode === "online" || mode === "party") return <TinTanToOnline mode={mode} onBack={onBack} onLocal={() => setPlaying(false)} />;
  return <LocalGame mode={mode} level={level} onSettings={() => setPlaying(false)} onBack={onBack} />;
}

// Tin Tan To on one device: against the computer, or two players taking turns.
function LocalGame({ mode, level, onSettings, onBack }: { mode: Exclude<Mode, "online" | "party">; level: Level; onSettings: () => void; onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  // Tin Tan To only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { match, selected } = state;
  const { board, toMove, result, scores, last, starter, moves } = match;
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

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { onBack(); }

  const targets = selected === null ? [] : NEIGHBOURS[selected].filter((p) => !board[p]);
  const name = (mark: Mark) => (mode === "cpu" ? (mark === CPU_MARK ? "The computer" : "You") : `Player ${mark}`);
  const message = result === "draw" ? (moves >= DRAW_RULES.moves ? `Draw — ${DRAW_RULES.moves} moves and no three in a row.` : "Draw — the same position came round three times.")
    : result ? (mode === "cpu" ? (result.mark === CPU_MARK ? "The computer made three in a row." : "Three in a row — you win!") : `Player ${result.mark} (${colour(result.mark)}) wins!`)
      : cpuTurn ? "The computer is thinking…"
        : selected !== null ? (targets.length ? "Now tap a lit point to slide there." : "That piece is boxed in — pick another.")
          : mode === "cpu" ? (moves === 0 ? `${starter === "X" ? "You move" : "The computer moves"} first this round. Tap one of your blue pieces.` : "Your move — tap one of your blue pieces.")
            : `Player ${toMove}'s move (${colour(toMove)}).`;
  const labels = mode === "cpu" ? { X: "YOU", O: "CPU" } : { X: "X", O: "O" };

  return <main className="draft-screen ttt-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>TIN TAN TO</strong><small>SLIDE TO THREE IN A ROW</small></div>
      <div className="draft-header-right">
        <SettingsButton onSettings={onSettings} />
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">{labels.X} {scores.X} · {labels.O} {scores.O} · DRAW {scores.draws}</span>
      </div>
    </header>
    <section className="draft-content">
      <Board match={match} selected={selected} waiting={cpuTurn} onTap={tap}
        labels={mode === "cpu" ? { top: "CPU · HOME ROW", bottom: "YOUR HOME ROW" } : { top: "PLAYER O · HOME ROW", bottom: "PLAYER X · HOME ROW" }} />
      <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
      <div className="draft-actions">
        <span className="draft-turn">{result ? "ROUND OVER" : `${name(toMove).toUpperCase()} · ${colour(toMove).toUpperCase()}`}</span>
        <div className="draft-buttons">
          <button onClick={() => dispatch({ type: result ? "next" : "restart" })} className={result ? "draft-stop" : ""}>{result ? "NEXT ROUND" : "RESTART ROUND"}</button>
          <button onClick={() => dispatch({ type: "reset" })}>NEW MATCH</button>
        </div>
      </div>
    </section>
  </main>;
}
