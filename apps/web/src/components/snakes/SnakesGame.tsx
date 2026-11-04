"use client";

import { useEffect, useState } from "react";
import GameSetup, { SettingsButton, SetupOption, SetupToggles, type Choice } from "@/components/GameSetup";
import { DieFace, title } from "@/components/ludo/LudoBoard";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import SnakesBoard from "@/components/snakes/SnakesBoard";
import SnakesOnline from "@/components/snakes/SnakesOnline";
import { NO_RULES_HELP } from "@/components/snakes/SnakesRuleChips";
import { describe } from "@/components/snakes/describe";
import { usePlayback } from "@/components/snakes/usePlayback";
import { usePresence } from "@/online/presence";
import { COLOUR_HEX } from "@salone/games/ludo/board";
import { canRoll, newSnakesMatch, rematch, rollDie, type SnakesMatch } from "@salone/games/snakes/match";
import { colourOf, NO_RULES, RULES, type Rule, type Rules } from "@salone/games/snakes/rules";

// Snakes and Ladders (Snake and Leather) on one device, against the computer or passing the device round, plus the
// way into online and party play. The match is played back the same way as online (see usePlayback).

type Opponents = "cpu" | "friends" | "online" | "party";
type Settings = { opponents: Opponents; players: number; rules: Rules };

const CPU_MS = 700;
const face = () => 1 + Math.floor(Math.random() * 6);

const OPPONENTS: Choice<Opponents>[] = [
  { value: "cpu", label: "vs CPU", hint: "You are red. The computer plays the other colours." },
  { value: "friends", label: "Pass and play", hint: "Everyone plays on this device, passing it round." },
  { value: "online", label: "Online", hint: "Play friends on their own devices. You pick the players and house rules in the room." },
  { value: "party", label: "Party (TV + phones)", hint: "This screen shows the board; players roll on their phones. You pick the players and house rules next." },
];

export default function SnakesGame({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>({ opponents: "cpu", players: 2, rules: NO_RULES });
  const [playing, setPlaying] = useState(false);
  const { opponents } = settings;
  usePresence("snakes-and-ladders", opponents, playing);
  if (!playing) return <SnakesSetup settings={settings} onChange={setSettings} onStart={() => setPlaying(true)} />;
  if (opponents === "online" || opponents === "party") return <SnakesOnline mode={opponents} onBack={onBack} onLocal={() => setPlaying(false)} />;
  return <LocalSnakes settings={settings} onSettings={() => setPlaying(false)} onBack={onBack} />;
}

function SnakesSetup({ settings, onChange, onStart }: { settings: Settings; onChange: (settings: Settings) => void; onStart: () => void }) {
  const local = settings.opponents === "cpu" || settings.opponents === "friends";
  return <GameSetup title="Snakes and Ladders" intro="Snake and Leather: roll the die, climb the bamboo ladders, dodge the snakes, and be first to square 100." onStart={onStart} startLabel={local ? "START GAME" : "CONTINUE"}>
    <SetupOption label="PLAY" value={settings.opponents} choices={OPPONENTS} onChange={(opponents) => onChange({ ...settings, opponents })} />
    {local && <SetupOption label="PLAYERS" value={settings.players} choices={[2, 3, 4].map((n) => ({ value: n, label: String(n) }))} onChange={(players) => onChange({ ...settings, players })} />}
    {local && <SetupToggles label="HOUSE RULES" items={(Object.keys(RULES) as Rule[]).map((key) => ({ key, label: RULES[key].label, hint: RULES[key].blurb }))} on={settings.rules} onToggle={(rule) => onChange({ ...settings, rules: { ...settings.rules, [rule]: !settings.rules[rule] } })} help={`${NO_RULES_HELP} Tap a rule to switch it on.`} />}
  </GameSetup>;
}

function LocalSnakes({ settings, onSettings, onBack }: { settings: Settings; onSettings: () => void; onBack: () => void }) {
  const { opponents, players, rules } = settings;
  const [match, setMatch] = useState<SnakesMatch>(() => newSnakesMatch(players, rules));
  // This screen only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const [notice, setNotice] = useState("Roll the die to start. First to square 100 wins.");
  const name = (player: number) => (opponents === "friends" ? title(colourOf(player)) : player === 0 ? "You" : `${title(colourOf(player))} (CPU)`);
  const human = (player: number) => opponents === "friends" || player === 0;

  const { match: shown, die, rolling, moving, behind } = usePlayback(match, (event) => {
    setNotice(describe(event, name));
    if (event.kind !== "rolled") return;
    if (event.move.won) { if (human(event.move.player)) sound.cheer(); else sound.lose(); }
    else if (event.move.bitten || event.move.threeSixes) sound.lose();
  }, {
    onStep: () => sound.step(),
    onRolled: () => sound.touch(),
    onSlide: (kind) => { if (kind === "ladder") sound.point(); else sound.whoosh(); },
  });

  const { game } = shown;
  const turn = game.turn;
  const over = game.winner !== null;
  const myTurn = human(turn) && !over;
  const canRollNow = myTurn && !behind && canRoll(match);

  useEffect(() => { sound.muted = muted; }, [muted]);

  function roll() {
    if (!canRollNow) return;
    sound.unlock();
    setMatch((m) => rollDie(m, face()));
  }

  // The computer rolls on its turn, once the screen has caught up.
  useEffect(() => {
    if (human(turn) || over || behind) return;
    const timer = window.setTimeout(() => setMatch((m) => rollDie(m, face())), CPU_MS);
    return () => window.clearTimeout(timer);
  });

  // Space or Enter rolls.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "SELECT" || tag === "BUTTON" || tag === "INPUT") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); roll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function playAgain() { setMatch((m) => rematch(m)); setNotice("New game. Roll the die to start."); }

  const names = game.positions.map((_, i) => name(i));
  const colour = COLOUR_HEX[colourOf(turn)];
  const status = over ? "GAME OVER" : `${name(turn).toUpperCase()} · ${rolling ? "ROLLING" : moving ? "MOVING" : "TO ROLL"}`;
  const prompt = over ? notice : canRollNow ? `${notice} ${opponents === "friends" ? `${title(colourOf(turn))} to roll` : "Your roll"} — tap the die.` : notice;
  const ruleCount = (Object.keys(RULES) as Rule[]).filter((r) => game.rules[r]).length;

  return <main className="draft-screen snakes-screen">
    <header className="draft-header">
      <button className="back-button" onClick={onBack}>← <span>GAMES</span></button>
      <div><strong>SNAKES AND LADDERS</strong><small>{ruleCount ? `${ruleCount} HOUSE RULE${ruleCount > 1 ? "S" : ""}` : "ONE DIE"}</small></div>
      <div className="draft-header-right">
        <SettingsButton onSettings={onSettings} />
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">{game.positions.map((p, i) => `${title(colourOf(i)).toUpperCase()} ${p}`).join(" · ")}</span>
      </div>
    </header>
    <section className="draft-content snakes-content">
      <SnakesBoard positions={game.positions} moving={moving} turn={turn} names={names} />
      <div className="snakes-panel">
        <button className="snakes-roll" onClick={roll} disabled={!canRollNow} aria-label="Roll the die" style={{ borderColor: canRollNow ? colour.fill : undefined }}>
          <DieFace value={die} colour={colourOf(turn)} rolling={rolling} /><span>{rolling ? "ROLLING…" : "ROLL"}</span>
        </button>
        <div className="ludo-turn" style={{ color: colour.light }}>{status}</div>
        <div className={`draft-message ${over ? "finished" : ""}`} role="status">{prompt}</div>
      </div>
      {over && <div className="draft-buttons"><button className="draft-stop" onClick={playAgain}>PLAY AGAIN</button></div>}
    </section>
  </main>;
}
