"use client";

import { useEffect, useRef, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { createMarblesScene, type MarblesState, type Mode, type Notice } from "@/components/marbles/scene";
import { FIELD, LEVELS, TARGETS, type Level } from "@/components/marbles/settings";

export default function MarblesGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Thirteen marbles in the ring. Knock them out to keep them.", kind: "ready" });
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  const [state, setState] = useState<MarblesState>({ scores: [0, 0], current: 0, over: false, mode: "cpu" });
  // Marbles only renders after a click, so storage can be read during the first render.
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
        width: FIELD,
        height: FIELD,
        backgroundColor: "#b98a5a",
        scene: createMarblesScene(Phaser, sound),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
      });
    });
    const status = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    const playState = (event: Event) => setPlaying((event as CustomEvent<{ playing: boolean }>).detail.playing);
    const score = (event: Event) => setState((event as CustomEvent<MarblesState>).detail);
    window.addEventListener("marbles-status", status);
    window.addEventListener("marbles-state", playState);
    window.addEventListener("marbles-score", score);
    return () => {
      disposed = true;
      window.removeEventListener("marbles-status", status);
      window.removeEventListener("marbles-state", playState);
      window.removeEventListener("marbles-score", score);
      game?.destroy(true);
    };
  }, []);

  function start() { sound.unlock(); window.dispatchEvent(new CustomEvent("marbles-start", { detail: { mode, level } })); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const names = state.mode === "cpu" ? ["YOU", "CPU"] : ["P1", "P2"];
  return (
    <main className="game-screen marbles-screen">
      <header className="game-topbar">
        <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
        <div className="game-title"><span className="brand-mark">S</span><strong>MARBLES</strong><small>RING GAME</small></div>
        <div className="game-settings">
          <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
          <label className="player-select"><span className="select-label">PLAY</span> <select value={mode} disabled={playing} onChange={(e) => setMode(e.target.value as Mode)}><option value="cpu">vs CPU</option><option value="friend">2 players</option></select></label>
          {mode === "cpu" && <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} disabled={playing} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
        </div>
      </header>
      <div className="game-stage"><div className="game-frame marbles-frame">
        <div className="game-host" ref={hostRef} />
        <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
        <div className="scoreboard" aria-label={`Score: ${names[0]} ${state.scores[0]}, ${names[1]} ${state.scores[1]}`}>
          <span className={playing && state.current === 0 ? "turn" : ""}>{names[0]}<b>{state.scores[0]}</b></span>
          <span className={playing && state.current === 1 ? "turn" : ""}>{names[1]}<b>{state.scores[1]}</b></span>
          <small>{TARGETS - state.scores[0] - state.scores[1]} LEFT IN THE RING</small>
        </div>
        {!playing && <button className="start-overlay" onClick={start}><span>▶</span>{state.over ? "PLAY AGAIN" : "START GAME"}</button>}
      </div></div>
      <div className="game-bottom">
        <span className="game-help">Pull back from your shooter and let go to flick · drag it around the ring line to choose where to shoot from</span>
        <span className="game-help">Knock a marble out and you shoot again · most marbles wins</span>
      </div>
    </main>
  );
}
