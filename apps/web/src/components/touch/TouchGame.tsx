"use client";

import { useEffect, useRef, useState } from "react";
import GameSetup, { SettingsButton, SetupOption, type Choice } from "@/components/GameSetup";
import Joystick from "@/components/Joystick";
import { usePresence } from "@/online/presence";
import HowToPlay from "./HowToPlay";
import TouchOnline from "./TouchOnline";
import { FIELD_H, FIELD_W } from "@salone/games/touch/field";
import { createTouchScene, type MatchState, type Notice, type TouchInput } from "./scene";
import { LEVELS, TOUCH, type Level } from "@salone/games/touch/settings";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound } from "@/components/sound";

const HOW_TO_SEEN_KEY = "salone-touch-how-to-seen";

type Mode = "cpu" | "online" | "party";

const MODES: Choice<Mode>[] = [
  { value: "cpu", label: "vs CPU", hint: "You and computer teammates against a computer team." },
  { value: "online", label: "Online", hint: "Play on teams with friends on their own devices." },
  { value: "party", label: "Party (TV + phones)", hint: "This screen shows the field; players use their phones." },
];

// Touch starts on the setup screen; once the player starts, the game screen shows only the field.
export default function TouchGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("cpu");
  const [level, setLevel] = useState<Level>("normal");
  const [players, setPlayers] = useState(4);
  const [ready, setReady] = useState(false);
  usePresence("touch", mode, ready);
  if (!ready) return <GameSetup title="Touch" intro="Run the lines, turn at the far side, and make it home without being touched." onStart={() => setReady(true)} startLabel={mode === "cpu" ? "START GAME" : "CONTINUE"}>
    <SetupOption label="PLAY" value={mode} choices={MODES} onChange={setMode} />
    {mode === "cpu" && <SetupOption label="LEVEL" value={level} choices={(Object.keys(LEVELS) as Level[]).map((key) => ({ value: key, label: LEVELS[key].label }))} onChange={setLevel} />}
    {mode === "cpu" && <SetupOption label="TEAM SIZE" value={players} choices={[3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} onChange={setPlayers} />}
  </GameSetup>;
  if (mode !== "cpu") return <TouchOnline mode={mode} onBack={onBack} onLocal={() => setReady(false)} />;
  return <LocalTouch level={level} players={players} onSettings={() => setReady(false)} onBack={onBack} />;
}

// Touch on one device: you and computer teammates against a computer team.
function LocalTouch({ level, players, onSettings, onBack }: { level: Level; players: number; onSettings: () => void; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Your team is attacking. Reach the far line and return!", kind: "ready" });
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
        scene: createTouchScene(Phaser, inputRef, gameSound, { count: players, level }),
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
  }, [level, players]);

  function startGame() { gameSound.unlock(); window.dispatchEvent(new Event("touch-start")); }
  function backToGames() { onBack(); }
  function newMatch() { window.dispatchEvent(new Event("touch-new-match")); }
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
          <SettingsButton onSettings={onSettings} />
          <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
          <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
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
      <div className="game-bottom touch-bottom touch-centered">
        <div className="touch-controls">
        <div className="touch-pad"><Joystick onMove={move} /></div>
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
        <span className="game-help touch-keys">WASD / arrows: move · Shift: sprint · Space: switch player · or tap a player</span>
        <span className="game-help touch-rules">Line crossed +{TOUCH.linePoints} · home +{TOUCH.homePoints} · a touch swaps sides</span>
      </div>
    </main>
  );
}
