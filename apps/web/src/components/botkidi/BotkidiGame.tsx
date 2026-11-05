"use client";

import { useEffect, useRef, useState } from "react";
import GameSetup, { SettingsButton, SetupOption, SetupToggles, type Choice } from "@/components/GameSetup";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { usePresence } from "@/online/presence";
import { createBotkidiScene, type BotkidiState, type Mode, type Notice, type Start } from "./scene";
import { FIELD, LEVELS, MAX_PLAYERS, PLAYER_COLORS, type Level } from "./settings";

// Botkidi: the bottle-lid game Sierra Leonean children played in the street. Throw your lid into the chalk square
// against the wall to become the Hitter; everyone else hits their lid back into the square with a stick while the
// Hitter knocks it away after every miss. Starts on the setup screen; the game screen shows the yard.

const MODES: Choice<Mode>[] = [
  { value: "cpu", label: "vs CPU", hint: "You are red. The computer plays everyone else." },
  { value: "friends", label: "Pass and play", hint: "Everyone plays on this device, passing it round." },
];
const ROUNDS: Choice<number>[] = [1, 3, 5].map((n) => ({ value: n, label: String(n), hint: n === 1 ? "One round: first place wins." : `${n} rounds: points for each place, most points wins.` }));
const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

type Settings = Omit<Start, "flatSide"> & { rules: { flatSide: boolean } };

export default function BotkidiGame({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>({ mode: "cpu", level: "normal", players: 3, rounds: 3, rules: { flatSide: false } });
  const [ready, setReady] = useState(false);
  usePresence("botkidi", settings.mode, ready);
  if (ready) return <Yard start={{ ...settings, flatSide: settings.rules.flatSide }} onSettings={() => setReady(false)} onBack={onBack} />;
  return <GameSetup title="Botkidi" intro="Throw your bottle lid into the chalk square to become the Hitter. Everyone else hits their lid back in with a stick — and the Hitter knocks it away after every miss." onStart={() => setReady(true)}>
    <SetupOption label="PLAY" value={settings.mode} choices={MODES} onChange={(mode) => setSettings({ ...settings, mode })} />
    <SetupOption label="PLAYERS" value={settings.players} choices={Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => ({ value: i + 2, label: String(i + 2) }))} onChange={(players) => setSettings({ ...settings, players })} />
    <SetupOption label="ROUNDS" value={settings.rounds} choices={ROUNDS} onChange={(rounds) => setSettings({ ...settings, rounds })} />
    {settings.mode === "cpu" && <SetupOption label="LEVEL" value={settings.level} choices={(Object.keys(LEVELS) as Level[]).map((key) => ({ value: key, label: LEVELS[key].label }))} onChange={(level) => setSettings({ ...settings, level })} />}
    <SetupToggles label="HOUSE RULE" items={[{ key: "flatSide" as const, label: "Flat Side", hint: "Flat Side: a lid comes to rest either on its edge or lying flat. A lid lying flat (you see its cork liner) is much harder to hit, so it only goes about half as far." }]}
      on={settings.rules} onToggle={() => setSettings({ ...settings, rules: { flatSide: !settings.rules.flatSide } })} help="Every lid slides the same way. Switch on Flat Side for lids that land lying flat and are hard to hit." />
  </GameSetup>;
}

function Yard({ start, onSettings, onBack }: { start: Start; onSettings: () => void; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Throw your lid from the line. Land in the square to be the Hitter.", kind: "ready" });
  const [state, setState] = useState<BotkidiState | null>(null);
  // This screen only renders after a click, so storage can be read during the first render.
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
        backgroundColor: "#b06a43",
        scene: createBotkidiScene(Phaser, sound),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
      });
    });
    const status = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    const update = (event: Event) => setState((event as CustomEvent<BotkidiState>).detail);
    window.addEventListener("botkidi-status", status);
    window.addEventListener("botkidi-state", update);
    return () => {
      disposed = true;
      window.removeEventListener("botkidi-status", status);
      window.removeEventListener("botkidi-state", update);
      game?.destroy(true);
    };
  }, []);

  function begin() { sound.unlock(); window.dispatchEvent(new CustomEvent("botkidi-start", { detail: start })); }
  function next() { sound.unlock(); window.dispatchEvent(new CustomEvent("botkidi-next")); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }

  const status = state?.status ?? "idle";
  const overlay = status === "idle" ? { label: "START GAME", run: begin }
    : status === "between" ? { label: "NEXT ROUND", run: next }
      : status === "over" ? { label: "PLAY AGAIN", run: begin } : null;
  return <main className="game-screen botkidi-screen">
    <header className="game-topbar">
      <button className="back-button" onClick={onBack}>← <span>GAMES</span></button>
      <div className="game-title"><span className="brand-mark">S</span><strong>BOTKIDI</strong><small>{state ? `ROUND ${Math.max(1, state.round)} OF ${state.rounds}` : "BOTTLE LIDS"}</small></div>
      <div className="game-settings">
        <SettingsButton onSettings={onSettings} />
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
      </div>
    </header>
    <div className="game-stage"><div className="game-frame botkidi-frame">
      <div className="game-host" ref={hostRef} />
      {overlay && <button className="start-overlay" onClick={overlay.run}><span>▶</span>{overlay.label}</button>}
    </div></div>
    <div className="game-bottom botkidi-bottom">
      <div className={`notice botkidi-notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
      {state && <ol className="botkidi-players" aria-label="Players">
        {state.names.map((name, p) => {
          const home = state.hitter === p ? "HITTER" : state.finished.includes(p) ? `IN · ${state.finished.indexOf(p) + 2}${["", "", "nd", "rd"][state.finished.indexOf(p) + 2] ?? "th"}` : null;
          return <li key={p} className={state.current === p ? "turn" : ""}>
            <i style={{ background: hex(PLAYER_COLORS[p]) }} aria-hidden="true" />
            <span>{name}{home && <small>{home}</small>}</span>
            <b aria-label={`${state.scores[p]} points`}>{state.scores[p]}</b>
          </li>;
        })}
      </ol>}
    </div>
  </main>;
}
