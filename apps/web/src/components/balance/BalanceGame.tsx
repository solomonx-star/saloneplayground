"use client";

import { useEffect, useRef, useState } from "react";
import Joystick from "@/components/Joystick";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { createBalanceScene, type BalanceInput, type BalanceState, type Notice } from "./scene";
import { lapOf } from "./logic";
import { ALLMAN, BALANCE, FIELD_H, FIELD_W, LEVELS, MODES, type Level, type Mode } from "./settings";

export default function BalanceGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<BalanceInput>({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("classic");
  const [level, setLevel] = useState<Level>("normal");
  const [notice, setNotice] = useState<Notice>({ text: MODES.classic.blurb, kind: "ready" });
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState<BalanceState>({ you: 0, them: 0, inning: 1, over: false, humanDodges: true, player: 1, round: 1, mode: "classic", gathered: 0, items: LEVELS.normal.items, standing: { you: 0, them: 0 } });
  // Balance Ball only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));

  useEffect(() => { sound.muted = muted; }, [muted]);

  useEffect(() => {
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;
    void import("phaser").then((module) => {
      if (disposed || !hostRef.current) return;
      const Phaser = module.default;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: FIELD_W,
        height: FIELD_H,
        backgroundColor: "#174b38",
        scene: createBalanceScene(Phaser, inputRef, sound),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
    });
    const status = (e: Event) => setNotice((e as CustomEvent<Notice>).detail);
    const play = (e: Event) => setPlaying((e as CustomEvent<boolean>).detail);
    const update = (e: Event) => setState((e as CustomEvent<BalanceState>).detail);
    window.addEventListener("balance-status", status);
    window.addEventListener("balance-playing", play);
    window.addEventListener("balance-state", update);
    return () => {
      disposed = true;
      window.removeEventListener("balance-status", status);
      window.removeEventListener("balance-playing", play);
      window.removeEventListener("balance-state", update);
      game?.destroy(true);
    };
  }, []);

  function begin() { sound.unlock(); window.dispatchEvent(new CustomEvent("balance-start", { detail: { mode, level } })); }
  function changeMode(value: Mode) { setMode(value); setNotice({ text: MODES[value].blurb, kind: "ready" }); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function move(x: number, y: number) { inputRef.current = { x, y }; }
  function exit() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const round24 = state.mode === "round24";
  const gather = state.mode === "gather";
  const allman = state.mode === "allman";
  const progress = round24 && state.humanDodges ? ` · ROUND ${state.round}/${BALANCE.rounds} · LAP ${lapOf(state.round)}/6` : gather ? ` · ${state.gathered}/${state.items} CAPS IN` : "";
  const role = allman ? `ALL MAN YONE · ROUND ${state.inning} · STANDING ${state.standing.you} v ${state.standing.them}` : `${state.humanDodges ? "DODGING" : "THROWING"} · PLAYER ${state.player}/${BALANCE.players}${progress}`;
  const label = state.over ? "PLAY AGAIN" : state.inning === 2 && !allman ? "NEXT INNING" : "START GAME";
  const counting = allman ? `ROUNDS WON · FIRST TO ${ALLMAN.winsNeeded}` : `${round24 ? "ROUNDS RUN" : gather ? "CAPS GATHERED" : "THROWS DODGED"} · INNING ${state.inning}/2`;
  // A strip of steps on the scoreboard: the 24 rounds, or the caps to gather.
  const track = state.over ? null : round24 ? { length: BALANCE.rounds, done: state.round - 1 } : gather ? { length: state.items, done: state.gathered } : null;
  const rules = allman ? "Everyone in the field · last team standing wins" : !state.humanDodges ? "Stick moves the thrower with the ball · tap the field to throw" : round24 ? "Run the circles in order · safe only in the circle you last reached" : gather ? "Pick up caps one at a time · bring them to the middle circle" : "Dodge every throw you can";
  return (
    <main className="game-screen">
      <header className="game-topbar">
        <button className="back-button" onClick={exit}>← <span>GAMES</span></button>
        <div className="game-title"><span className="brand-mark">S</span><strong>BALANCE BALL</strong><small>{MODES[mode].label.toUpperCase()}</small></div>
        <div className="game-settings">
          <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
          <label className="player-select"><span className="select-label">MODE</span> <select value={mode} disabled={playing} onChange={(e) => changeMode(e.target.value as Mode)}>{(Object.keys(MODES) as Mode[]).map((key) => <option key={key} value={key}>{MODES[key].label}</option>)}</select></label>
          <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} disabled={playing} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
          <span className="game-role">{role}</span>
        </div>
      </header>
      <div className="game-stage"><div className="game-frame">
        <div className="game-host" ref={hostRef} />
        <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
        <div className="scoreboard" aria-label={`Score: you ${state.you}, CPU ${state.them}`}><span>YOU<b>{state.you}</b></span><span>CPU<b>{state.them}</b></span><small>{counting} · {LEVELS[level].label.toUpperCase()}</small>{track && <i className="round-track" aria-hidden="true">{Array.from({ length: track.length }, (_, i) => <i key={i} className={i < track.done ? "done" : i === track.done ? "now" : undefined} />)}</i>}</div>
        {!playing && <button className="start-overlay" onClick={begin}><span>▶</span>{label}</button>}
      </div></div>
      <div className="game-bottom touch-bottom">
        <div className="touch-pad"><Joystick onMove={move} /></div>
        <span className="game-help touch-keys">{state.humanDodges ? `WASD / arrows: ${allman ? "move the gold-ringed player" : gather ? "run, pick up and carry caps" : "dodge"}` : "WASD / arrows: move your thrower · click to throw · Space: throw at the dodger"} · the ball must reach the other end before it is thrown again</span>
        <span className="game-help touch-rules">{rules}</span>
      </div>
    </main>
  );
}
