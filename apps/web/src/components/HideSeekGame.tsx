"use client";

import { useEffect, useRef, useState } from "react";
import Joystick from "@/components/Joystick";
import { MUTED_KEY, readFlag, readNumber, writeFlag, writeNumber } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { createSeekScene, type Notice, type SeekInput, type SeekScore } from "@/components/seek/scene";
import { FIELD_H, FIELD_W, LEVELS, SEEK, type Level } from "@/components/seek/settings";

const bestKey = (level: Level) => `salone-seek-best-${level}`;

export default function HideSeekGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<SeekInput>({ x: 0, y: 0, sprint: false });
  const [notice, setNotice] = useState<Notice>({ text: "You are the seeker. Count at HOME while everyone hides.", kind: "ready" });
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState<Level>("normal");
  const [score, setScore] = useState<SeekScore>({ caught: 0, safe: 0, total: SEEK.hiders, seconds: LEVELS.normal.seconds, over: false });
  // Hide and Seek only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const [best, setBest] = useState(() => readNumber(bestKey("normal")));

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
        backgroundColor: "#627f52",
        scene: createSeekScene(Phaser, inputRef, sound),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
      });
    });
    const status = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    const state = (event: Event) => setPlaying((event as CustomEvent<{ playing: boolean }>).detail.playing);
    const scoreUpdate = (event: Event) => setScore((event as CustomEvent<SeekScore>).detail);
    window.addEventListener("seek-status", status);
    window.addEventListener("seek-state", state);
    window.addEventListener("seek-score", scoreUpdate);
    return () => {
      disposed = true;
      window.removeEventListener("seek-status", status);
      window.removeEventListener("seek-state", state);
      window.removeEventListener("seek-score", scoreUpdate);
      game?.destroy(true);
    };
  }, []);

  // Keeps the best number of hiders caught per level for this viewer.
  useEffect(() => {
    if (!score.over || score.caught <= readNumber(bestKey(level))) return;
    writeNumber(bestKey(level), score.caught);
  }, [score.over, score.caught, level]);

  function start() { sound.unlock(); window.dispatchEvent(new CustomEvent("seek-start", { detail: level })); }
  function changeLevel(value: Level) { setLevel(value); setBest(readNumber(bestKey(value))); }
  function move(x: number, y: number) { inputRef.current = { ...inputRef.current, x, y }; }
  function setSprint(on: boolean) { inputRef.current = { ...inputRef.current, sprint: on }; }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const shownBest = Math.max(best, score.over ? score.caught : 0);
  const minutes = `${Math.floor(score.seconds / 60)}:${String(score.seconds % 60).padStart(2, "0")}`;
  return (
    <main className="game-screen seek-screen">
      <header className="game-topbar">
        <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
        <div className="game-title"><span className="brand-mark">S</span><strong>PLAY KECH</strong><small>HIDE AND SEEK</small></div>
        <div className="game-settings">
          <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
          <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} disabled={playing} onChange={(e) => changeLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
        </div>
      </header>
      <div className="game-stage"><div className="game-frame">
        <div className="game-host" ref={hostRef} />
        <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
        <div className="scoreboard" aria-label={`Caught ${score.caught}, safe ${score.safe}, ${score.seconds} seconds left`}><span>CAUGHT<b>{score.caught}</b></span><span>SAFE<b>{score.safe}</b></span><small>{playing ? `TIME ${minutes}` : `BEST ${shownBest}/${score.total} · ${LEVELS[level].label.toUpperCase()}`}</small></div>
        {!playing && <button className="start-overlay" onClick={start}><span>▶</span>{score.over ? "PLAY AGAIN" : "START GAME"}</button>}
      </div></div>
      <div className="game-bottom touch-bottom">
        <div className="touch-pad"><Joystick onMove={move} /></div>
        <span className="game-help touch-keys">WASD / arrows: search · Shift: sprint · Get close to spot a hider, then touch them before they reach HOME</span>
        <span className="game-help touch-rules">Rustling spots give hiders away · catch them before they reach HOME</span>
        <div className="touch-actions">
          <button
            className="action-button sprint"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setSprint(true); }}
            onPointerUp={() => setSprint(false)}
            onPointerCancel={() => setSprint(false)}
          >SPRINT</button>
        </div>
      </div>
    </main>
  );
}
