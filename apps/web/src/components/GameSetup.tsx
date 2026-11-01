"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useConfirmLeave } from "@/components/LeaveGuard";

export type Choice<T> = { value: T; label: string; hint?: string };

// The screen before a game: the player picks how to play, then starts. The game screen itself only shows the game.
export default function GameSetup({ title, intro, children, onStart, startLabel = "START GAME" }: {
  title: string;
  intro: string;
  children: ReactNode;
  onStart: () => void;
  startLabel?: string;
}) {
  return <main className="setup-screen">
    <header className="draft-header">
      <Link className="back-button" href="/" onClick={leaveFullscreen}>← <span>GAMES</span></Link>
      <div><strong>{title.toUpperCase()}</strong><small>GAME SETUP</small></div>
      <span className="setup-header-spacer" />
    </header>
    <section className="setup-content">
      <div className="draft-intro"><p className="eyebrow">SET UP YOUR GAME</p><h1>{title}</h1><p>{intro}</p></div>
      <div className="setup-options">{children}</div>
      <button className="setup-start" onClick={onStart}><span>▶</span>{startLabel}</button>
    </section>
  </main>;
}

function leaveFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

// One setting, picked from a row of large buttons.
export function SetupOption<T extends string | number>({ label, value, choices, onChange }: { label: string; value: T; choices: Choice<T>[]; onChange: (value: T) => void }) {
  const hint = choices.find((choice) => choice.value === value)?.hint;
  return <fieldset className="setup-option">
    <legend>{label}</legend>
    <div className="setup-choices" role="radiogroup" aria-label={label}>
      {choices.map((choice) => <button key={String(choice.value)} type="button" role="radio" aria-checked={choice.value === value} className={choice.value === value ? "on" : ""} onClick={() => onChange(choice.value)}>{choice.label}</button>)}
    </div>
    {hint && <p className="setup-hint">{hint}</p>}
  </fieldset>;
}

// Several on/off switches, such as house rules.
export function SetupToggles<K extends string>({ label, items, on, onToggle, help }: { label: string; items: { key: K; label: string; hint: string }[]; on: Record<K, boolean>; onToggle: (key: K) => void; help: string }) {
  const active = items.filter((item) => on[item.key]);
  return <fieldset className="setup-option">
    <legend>{label}</legend>
    <div className="setup-choices setup-toggles">
      {items.map((item, i) => <button key={item.key} type="button" aria-pressed={on[item.key]} className={on[item.key] ? "on" : ""} onClick={() => onToggle(item.key)} title={item.hint}><b>{i + 1}</b>{item.label}</button>)}
    </div>
    <p className="setup-hint">{active.map((item) => item.hint).join(" ") || help}</p>
  </fieldset>;
}

// The ⚙ button on a game screen: goes back to the setup screen, after asking, since it ends the game in progress.
export function SettingsButton({ onSettings }: { onSettings: () => void }) {
  const confirmLeave = useConfirmLeave();
  return <button className="icon-button" aria-label="Change game settings" title="Change game settings" onClick={() => confirmLeave({
    title: "Change the settings?",
    body: "You will go back to the setup screen and the game in progress will end.",
    confirm: "CHANGE",
    onConfirm: onSettings,
  })}>⚙</button>;
}
