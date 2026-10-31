"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { chooseTurn, LEVELS, type Level } from "@salone/games/draft/ai";
import { applyTurn, countPieces, initialBoard, isQuietTurn, legalTurns, moveOnly, other, posKey, samePos, type Board, type Pos, type Side, type Step, type Turn } from "@salone/games/draft/rules";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";

// The player is Black and moves first; the computer is White.
const HUMAN: Side = "black";
const CPU: Side = "white";
// 25 king moves each without a capture ends the game as a draw.
const DRAW_AFTER_QUIET_TURNS = 50;
const CPU_DELAY_MS = 450;

type Result = { winner: Side | null; text: string };
type Snapshot = { board: Board; quiet: number };
type State = {
  board: Board;
  side: Side;
  // Steps of the player's turn taken so far; a capture chain is played one jump at a time.
  progress: Step[];
  selected: Pos | null;
  // The previous turn, highlighted on the board; crowned is true when it made a new king.
  last: (Turn & { side: Side; crowned: boolean }) | null;
  quiet: number;
  result: Result | null;
  hint: string | null;
  // A move suggested by the HINT button, shown on the board until the player clicks.
  suggestion: Turn | null;
  // Board at the start of each of the player's turns, for undo.
  history: Snapshot[];
};
type Action = { type: "click"; pos: Pos } | { type: "stop" } | { type: "suggest"; turn: Turn } | { type: "cpu"; turn: Turn } | { type: "undo" } | { type: "reset" };

const CHAIN_HINT = "Jump again, or press STOP HERE to end your turn.";

const fresh = (): State => ({ board: initialBoard(), side: HUMAN, progress: [], selected: null, last: null, quiet: 0, result: null, hint: null, suggestion: null, history: [] });

const matches = (turn: Turn, progress: Step[]) => progress.every((step, i) => samePos(turn.steps[i].from, step.from) && samePos(turn.steps[i].to, step.to));

// Applies a finished turn and decides whether the game is over.
function finishTurn(state: State, turn: Turn): State {
  const mover = state.side;
  const board = applyTurn(state.board, turn);
  const quiet = isQuietTurn(state.board, turn) ? state.quiet + 1 : 0;
  const next = other(mover);
  const start = turn.steps[0].from;
  const end = turn.steps[turn.steps.length - 1].to;
  const crowned = !state.board[start.r][start.c]?.king && !!board[end.r][end.c]?.king;
  const base = { ...state, board, side: next, progress: [], selected: null, last: { ...turn, side: mover, crowned }, quiet, hint: null, suggestion: null };
  if (!legalTurns(board, next).length) {
    const wiped = countPieces(board)[next] === 0;
    const text = mover === HUMAN
      ? wiped ? "You win! Every white piece is captured." : "You win! White has no moves left."
      : wiped ? "The computer wins. All your pieces are captured." : "The computer wins. You have no moves left.";
    return { ...base, result: { winner: mover, text } };
  }
  if (quiet >= DRAW_AFTER_QUIET_TURNS) return { ...base, result: { winner: null, text: "Draw. 25 king moves each without a capture." } };
  return base;
}

const withHistory = (state: State): State => ({ ...state, history: [...state.history, { board: state.board, quiet: state.quiet }] });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset": return fresh();
    case "undo": {
      // Part-way through a capture chain, undo only cancels the jumps made so far.
      if (state.progress.length) return { ...state, progress: [], selected: null, hint: null };
      const snapshot = state.history[state.history.length - 1];
      if (!snapshot) return state;
      return { ...fresh(), board: snapshot.board, quiet: snapshot.quiet, history: state.history.slice(0, -1) };
    }
    case "suggest":
      return state.side === HUMAN && !state.result && !state.progress.length ? { ...state, suggestion: action.turn, selected: null, hint: null } : state;
    case "stop": {
      // Captures are optional, so a chain may end after any jump.
      const turn = legalTurns(state.board, HUMAN).find((t) => t.steps.length === state.progress.length && matches(t, state.progress));
      return turn && state.side === HUMAN ? finishTurn(withHistory(state), turn) : state;
    }
    case "cpu":
      return state.side === CPU && !state.result ? finishTurn(state, action.turn) : state;
    case "click": {
      if (state.side !== HUMAN || state.result) return state;
      const { pos } = action;
      state = { ...state, suggestion: null };
      const candidates = legalTurns(state.board, HUMAN).filter((turn) => matches(turn, state.progress));
      const at = state.progress.length ? state.progress[state.progress.length - 1].to : state.selected;
      const step = at && candidates.map((turn) => turn.steps[state.progress.length]).find((s) => samePos(s.from, at) && samePos(s.to, pos));
      if (step) {
        const progress = [...state.progress, step];
        const rest = candidates.filter((turn) => matches(turn, progress));
        // The turn ends by itself when no further jump is possible; otherwise the player may continue or stop.
        if (rest.length === 1) return finishTurn(withHistory(state), rest[0]);
        return { ...state, progress, selected: step.to, hint: CHAIN_HINT };
      }
      if (state.progress.length) return { ...state, hint: CHAIN_HINT };
      const piece = state.board[pos.r][pos.c];
      if (piece?.side !== HUMAN) return { ...state, selected: null, hint: null };
      if (candidates.some((turn) => samePos(turn.steps[0].from, pos))) return { ...state, selected: pos, hint: null };
      return { ...state, selected: null, hint: "That piece has no legal move." };
    }
  }
}

export default function DraftGame({ onBack }: { onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  const [level, setLevel] = useState<Level>("normal");
  // Draft only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { board, side, progress, selected, last, result } = state;

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

  const humanTurns = useMemo(() => (side === HUMAN && !result ? legalTurns(board, HUMAN) : []), [board, side, result]);
  const canCapture = humanTurns.length > 0 && humanTurns[0].captured.length > 0;
  // Pieces that could capture glow as a suggestion; the player is free to ignore them.
  const capturers = new Set(progress.length ? [] : humanTurns.filter((turn) => turn.captured.length).map((turn) => posKey(turn.steps[0].from)));
  const { suggestion } = state;
  const suggested = new Set(suggestion ? [posKey(suggestion.steps[0].from), ...suggestion.steps.map((step) => posKey(step.to))] : []);
  const candidates = humanTurns.filter((turn) => matches(turn, progress));
  const at = progress.length ? progress[progress.length - 1].to : selected;
  const targets = new Set(at ? candidates.map((turn) => turn.steps[progress.length]).filter((s) => samePos(s.from, at)).map((s) => posKey(s.to)) : []);
  // While a chain is in progress, show the piece where it has jumped to and fade the pieces it has taken.
  const view = progress.reduce((b, step) => moveOnly(b, step), board);
  const taken = new Set(progress.map((step) => posKey(step.captured!)));
  const lastPath = new Set(last ? [posKey(last.steps[0].from), ...last.steps.map((s) => posKey(s.to))] : []);
  const lastTaken = new Set(last ? last.captured.map(posKey) : []);
  const counts = countPieces(board);

  const message = result?.text ?? state.hint ?? (side === CPU ? "Computer is thinking…"
    : progress.length ? CHAIN_HINT
    : suggestion ? suggestion.captured.length ? `Suggestion: jump with the marked piece to take ${suggestion.captured.length}.` : "Suggestion: move the marked piece to the marked square."
    : canCapture ? "You can capture with a glowing piece, or leave it and set a trap."
    : !last ? "Black moves first — the Blackman Trouble Rule." : "Your move.");

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function click(r: number, c: number) { sound.unlock(); dispatch({ type: "click", pos: { r, c } }); }
  // Uses the Normal computer to suggest a move for the player.
  function suggest() { const turn = chooseTurn(board, HUMAN, "normal"); if (turn) dispatch({ type: "suggest", turn }); }
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
      <div className="draft-board-wrap"><div className={`draft-board${side === CPU && !result ? " waiting" : ""}`} role="grid" aria-label="10 by 10 Draft board">{view.map((row, r) => row.map((piece, c) => {
        const key = `${r},${c}`;
        const dark = (r + c) % 2 === 1;
        const classes = ["draft-square", dark ? "dark" : "light"];
        if (at && samePos(at, { r, c })) classes.push("selected");
        if (targets.has(key)) classes.push("target");
        if (lastPath.has(key)) classes.push("last");
        if (lastTaken.has(key)) classes.push("taken");
        if (suggested.has(key)) classes.push("suggest");
        const pieceClasses = ["draft-piece", piece?.side ?? "", piece?.king ? "king" : "", taken.has(key) ? "ghost" : "", capturers.has(key) ? "can" : ""].filter(Boolean).join(" ");
        return <button key={key} role="gridcell" aria-label={`${piece ? `${piece.side}${piece.king ? " king" : ""}` : dark ? "dark square" : "light square"} row ${10 - r} column ${c + 1}${targets.has(key) ? ", move here" : ""}`} className={classes.join(" ")} onClick={() => click(r, c)}>{piece && <span className={pieceClasses}>{piece.king ? "♛" : ""}</span>}</button>;
      }))}</div></div>
      <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
      <div className="draft-actions">
        <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
        <span className="draft-turn">{result ? "GAME OVER" : side === HUMAN ? "YOUR MOVE" : "COMPUTER'S MOVE"}{canCapture && !progress.length ? " · CAPTURE AVAILABLE" : ""}</span>
        <div className="draft-buttons">
          {progress.length > 0
            ? <button className="draft-stop" onClick={() => dispatch({ type: "stop" })}>STOP HERE</button>
            : <button onClick={suggest} disabled={side !== HUMAN || !!result}>HINT</button>}
          <button onClick={() => dispatch({ type: "undo" })} disabled={!progress.length && (!state.history.length || side === CPU && !result)}>UNDO</button>
          <button onClick={() => dispatch({ type: "reset" })}>{result ? "PLAY AGAIN" : "NEW GAME"}</button>
        </div>
      </div>
    </section>
  </main>;
}
