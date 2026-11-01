"use client";

import { useEffect, useRef, useState } from "react";
import Joystick from "@/components/Joystick";
import HowToPlay from "./HowToPlay";
import TouchOnline from "./TouchOnline";
import { FIELD_H, FIELD_W } from "@salone/games/touch/field";
import { createTouchScene, type MatchState, type Notice, type TouchInput } from "./scene";
import { LEVELS, TOUCH, type Level } from "@salone/games/touch/settings";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound } from "@/components/sound";

const HOW_TO_SEEN_KEY = "salone-touch-how-to-seen";

type Mode = "cpu" | "online" | "party";

export default function TouchGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("cpu");
  if (mode !== "cpu") return <TouchOnline mode={mode} onBack={onBack} onLocal={() => setMode("cpu")} />;
  return <LocalTouch onMode={setMode} onBack={onBack} />;
}

// Touch on one device: you and computer teammates against a computer team.
function LocalTouch({ onMode, onBack }: { onMode: (mode: Mode) => void; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Your team is attacking. Reach the far line and return!", kind: "ready" });
  const [players, setPlayers] = useState(4);
  const [level, setLevel] = useState<Level>("normal");
  const [match, setMatch] = useState<MatchState>({ you: 0, them: 0, turn: 1, totalTurns: TOUCH.turnsPerTeam * 2, over: false });
  const [isPlaying, setIsPlaying] = useState(false);
  // TouchGame only renders in the browser (it opens from a click), so storage can be read during the first render.
  const [showHelp, setShowHelp] = useState(() => !readFlag(HOW_TO_SEEN_KEY));
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const inputRef = useRef<TouchInput>({ x: 0, y: 0, sprint: false });

  useEffect(() => { gameSound.muted = muted; }, [muted]);

  useEffect(() => {
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;

    void import("phaser").then((module) => {
      if (disposed || !hostRef.current) return;
      const Phaser = module.default;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: FIELD_W,
        height: FIELD_H,
        backgroundColor: "#174b38",
        scene: createTouchScene(Phaser, inputRef, gameSound),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
      });
    });

    const status = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    const state = (event: Event) => setIsPlaying((event as CustomEvent<{ playing: boolean }>).detail.playing);
    const matchUpdate = (event: Event) => setMatch((event as CustomEvent<MatchState>).detail);
    window.addEventListener("touch-status", status);
    window.addEventListener("touch-state", state);
    window.addEventListener("touch-match", matchUpdate);
    return () => {
      disposed = true;
      window.removeEventListener("touch-status", status);
      window.removeEventListener("touch-state", state);
      window.removeEventListener("touch-match", matchUpdate);
      game?.destroy(true);
    };
  }, []);

  function startGame() { gameSound.unlock(); window.dispatchEvent(new Event("touch-start")); }
  function backToGames() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onBack();
  }
  function changeLevel(value: Level) { setLevel(value); window.dispatchEvent(new CustomEvent("touch-level", { detail: value })); }
  function newMatch() { window.dispatchEvent(new Event("touch-new-match")); }
  function setPlayerCount(value: number) { setPlayers(value); window.dispatchEvent(new CustomEvent("touch-count", { detail: value })); }
  function move(x: number, y: number) {
    inputRef.current = { ...inputRef.current, x, y };
    window.dispatchEvent(new CustomEvent("touch-move", { detail: { x, y } }));
  }
  function setSprint(on: boolean) { inputRef.current = { ...inputRef.current, sprint: on }; }
  function switchPlayer() { window.dispatchEvent(new Event("touch-switch")); }
  function closeHelp() { setShowHelp(false); writeFlag(HOW_TO_SEEN_KEY, true); }
  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    writeFlag(MUTED_KEY, next);
    if (!next) gameSound.unlock();
  }

  const result = match.you > match.them ? "You win!" : match.you < match.them ? "The CPU wins" : "It's a draw";
  return (
    <main className="game-screen">
      <header className="game-topbar">
        <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
        <div className="game-title"><span className="brand-mark">S</span><strong>TOUCH</strong><small>TURN {match.turn}/{match.totalTurns}</small></div>
        <div className="game-settings">
          <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
          <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
          <label className="player-select"><span className="select-label">PLAY</span> <select value="cpu" onChange={(e) => onMode(e.target.value as Mode)}><option value="cpu">vs CPU</option><option value="online">Online</option><option value="party">Party (TV + phones)</option></select></label>
          <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => changeLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
          <label className="player-select"><span className="select-label">TEAM</span> <select value={players} onChange={(e) => setPlayerCount(Number(e.target.value))}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
      </header>
      <div className="game-stage"><div className="game-frame touch-frame">
        <div className="game-host" ref={hostRef} />
        <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
        <div className="scoreboard" aria-label={`Score: you ${match.you}, CPU ${match.them}`}><span>YOU<b>{match.you}</b></span><span>CPU<b>{match.them}</b></span><small>TURN {match.turn}/{match.totalTurns}</small></div>
        {showHelp
          ? <HowToPlay onClose={closeHelp} />
          : match.over
            ? <div className="match-result" role="dialog" aria-label="Match result"><small>FULL TIME</small><strong>{result}</strong><span>{match.you} – {match.them}</span><button onClick={newMatch}>▶ PLAY AGAIN</button></div>
            : !isPlaying && <button className="start-overlay" onClick={startGame}><span>▶</span>{notice.kind === "success" ? "NEXT RUN" : notice.kind === "danger" ? "NEXT TURN" : "START GAME"}</button>}
      </div></div>
      <div className="game-bottom touch-bottom">
        <div className="touch-pad"><Joystick onMove={move} /></div>
        <span className="game-help touch-keys">WASD / arrows: move · Shift: sprint · Space: switch player · or tap a player</span>
        <span className="game-help touch-rules">Line crossed +{TOUCH.linePoints} · home +{TOUCH.homePoints} · a touch swaps sides</span>
        <div className="touch-actions">
          <button
            className="action-button sprint"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setSprint(true); }}
            onPointerUp={() => setSprint(false)}
            onPointerCancel={() => setSprint(false)}
          >SPRINT</button>
          <button className="action-button" onClick={switchPlayer}>SWITCH</button>
        </div>
      </div>
    </main>
  );
}
