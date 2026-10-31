"use client";

import { useEffect, useRef, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import LudoBoard, { title, type Moving } from "@/components/ludo/LudoBoard";
import LudoOnline from "@/components/ludo/LudoOnline";
import RuleChips from "@/components/ludo/RuleChips";
import TurnClock from "@/components/ludo/TurnClock";
import { useLudoControls } from "@/components/ludo/useLudoControls";
import { cellOf, COLOUR_HEX } from "@salone/games/ludo/board";
import { chooseMove, current, LEVELS, NO_RULES, newGame, pathOf, play as makeMove, plays, rolled, RULES, skip, TURN_SECONDS, type Colour, type Game, type Level, type Play, type Rule, type Rules } from "@salone/games/ludo/rules";

type Opponents = "cpu" | "friends" | "online";

const STEP_MS = 130;
const CPU_ROLL_MS = 650;
const CPU_PICK_MS = 500;
// How long the dice tumble in the middle of the board, and how often their faces flicker while they do.
const ROLL_MS = 850;
const FLICKER_MS = 75;
// Against the computer you are always red. The game plays for you at this level when the turn timer runs out.
const YOU: Colour = "red";
const STAND_IN: Level = "normal";
const face = () => 1 + Math.floor(Math.random() * 6);

export default function LudoGame({ onBack }: { onBack: () => void }) {
  const [opponents, setOpponents] = useState<Opponents>("cpu");
  if (opponents === "online") return <LudoOnline onBack={onBack} onLocal={() => setOpponents("cpu")} />;
  return <LocalLudo opponents={opponents} onOpponents={setOpponents} onBack={onBack} />;
}

// Ludo on one device: against the computer, or friends passing the device round.
function LocalLudo({ opponents, onOpponents, onBack }: { opponents: Exclude<Opponents, "online">; onOpponents: (value: Opponents) => void; onBack: () => void }) {
  const [rules, setRules] = useState<Rules>(NO_RULES);
  const [players, setPlayers] = useState(4);
  const [level, setLevel] = useState<Level>("normal");
  const [game, setGame] = useState<Game>(() => newGame(4));
  // The two dice as last rolled (or flickering while they roll).
  const [pair, setPair] = useState<[number, number]>([6, 6]);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState<(Moving & { play: Play }) | null>(null);
  const [notice, setNotice] = useState("Two dice, four tokens each. Switch on any house rules below, then roll.");
  // Turn Timer: when the current action began.
  const [actionAt, setActionAt] = useState(() => Date.now());
  // Ludo only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  // The latest game, for timers that finish after a re-render.
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);
  // The roll in progress, so a new game can cancel it.
  const rollTimers = useRef<number[]>([]);
  // Whether something worth reading (a capture, a token home…) has happened this roll, so a routine message from
  // the next move does not replace it.
  const news = useRef(false);

  const turn = current(game);
  const humans: Colour[] = opponents === "cpu" ? [YOU] : game.seats;
  const human = humans.includes(turn);
  const busy = rolling || !!moving || !!game.winner;
  const options = busy ? [] : plays(game);
  const controls = useLudoControls(game, options, human, pick);
  const { die, movableTokens, choosers, lines, canChoose } = controls;
  const taxiDriving = game.taxis.find((t) => t.driver.colour === turn);
  const timed = game.rules.timer && human && !game.winner;

  useEffect(() => { sound.muted = muted; }, [muted]);

  const name = (colour: Colour) => (opponents === "friends" ? title(colour) : colour === YOU ? "You" : `${title(colour)} (CPU)`);

  // Every change to the game restarts the turn timer.
  function update(next: Game) { setGame(next); setActionAt(() => Date.now()); }

  function start(nextRules = rules, nextPlayers = players) {
    rollTimers.current.forEach((t) => { window.clearInterval(t); window.clearTimeout(t); });
    setMoving(null); setRolling(false);
    update(newGame(nextPlayers, nextRules));
    const on = (Object.keys(RULES) as Rule[]).filter((r) => nextRules[r]).map((r) => RULES[r].label);
    setNotice(on.length ? `New game with ${on.join(", ")}.` : "New game, no house rules.");
  }

  // The dice tumble in the middle of the board, faces flickering, then land.
  function roll() {
    if (busy || game.dice.length) return;
    sound.unlock();
    setRolling(true);
    const flicker = window.setInterval(() => { setPair([face(), face()]); sound.step(); }, FLICKER_MS);
    const land = window.setTimeout(() => {
      news.current = false;
      window.clearInterval(flicker);
      const a = face(); const b = face();
      const after = rolled(gameRef.current, a, b);
      setPair([a, b]);
      setRolling(false);
      update(after);
      sound.touch();
      const who = name(current(after));
      const double = after.bonus ? " A double — another roll after this." : "";
      const taxi = after.taxis.some((t) => t.driver.colour === current(after)) ? " Both dice go to the taxi." : "";
      setNotice(plays(after).length ? `${who} rolled ${a} and ${b}.${double}${taxi}` : `${who} rolled ${a} and ${b} — nothing can move.`);
    }, ROLL_MS);
    rollTimers.current = [flicker, land];
  }

  // Slides a token along its path, then makes the move.
  function pick(chosenPlay: Play) {
    if (busy || !options.some((p) => p.token === chosenPlay.token && p.die === chosenPlay.die && !!p.back === !!chosenPlay.back)) return;
    const colour = current(game);
    controls.playing(chosenPlay);
    setMoving({ colour, token: chosenPlay.token, play: chosenPlay, path: pathOf(game, chosenPlay).map((t) => cellOf(colour, t, chosenPlay.token)), step: 0 });
  }

  useEffect(() => {
    if (!moving) return;
    if (moving.step < moving.path.length - 1) {
      const timer = window.setTimeout(() => { sound.step(); setMoving({ ...moving, step: moving.step + 1 }); }, STEP_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      const before = gameRef.current;
      const colour = current(before);
      const { game: after, outcome } = makeMove(before, moving.play);
      setMoving(null);
      update(after);
      const who = name(colour);
      const again = !after.winner && current(after) === colour && !after.dice.length;
      const more = after.dice.length ? " after this" : "";
      const routine = !after.winner && !outcome.hanged && !outcome.poisoned && !outcome.dropped && !outcome.captured.length && !outcome.home;
      if (!routine) news.current = true;
      if (after.winner) {
        if (opponents === "friends" || humans.includes(after.winner)) sound.cheer(); else sound.lose();
        setNotice(`${name(after.winner)} ${after.winner === YOU && opponents === "cpu" ? "win" : "wins"}!`);
      } else if (outcome.hanged) { sound.lose(); setNotice(`${who} landed on step 55 and got hanged — back to the yard.`); }
      else if (outcome.poisoned) { sound.lose(); setNotice(`${who} landed on a poison arrow — back to the yard.`); }
      else if (outcome.dropped) { sound.point(); setNotice("The taxi dropped its rider at the home entrance and goes back to the yard."); }
      else if (outcome.taxi) { sound.touch(); setNotice(`${who} captured ${title(outcome.captured[0].colour)}! That token is now a taxi carrying ${colour === YOU && opponents === "cpu" ? "yours" : `${title(colour)}'s`} to its home entrance — and another roll${more}.`); }
      else if (outcome.captured.length) { sound.touch(); setNotice(`${who} captured ${outcome.captured.map((v) => title(v.colour)).join(" and ")}${moving.play.back ? " moving backward" : ""}! Back to the yard — and another roll${more}.`); }
      else if (outcome.home) { sound.point(); setNotice(`${who} got a token home — another roll${more}.`); }
      else if (news.current) return;
      else if (again) setNotice(`${who} roll${colour === YOU && opponents === "cpu" ? "" : "s"} again.`);
      else if (current(after) !== colour && before.dice.length > 1) setNotice(`${who} could not use the other die.`);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  });

  // Nothing can move: end the roll after a moment. Only one move possible: make it for the player.
  useEffect(() => {
    if (busy || !game.dice.length) return;
    if (!options.length) { const timer = window.setTimeout(() => update(skip(gameRef.current)), 1100); return () => window.clearTimeout(timer); }
    if (human && options.length === 1) { const timer = window.setTimeout(() => pick(options[0]), 400); return () => window.clearTimeout(timer); }
  });

  // The computer rolls, then picks its moves.
  useEffect(() => {
    if (human || busy) return;
    if (!game.dice.length) { const timer = window.setTimeout(roll, CPU_ROLL_MS); return () => window.clearTimeout(timer); }
    if (!options.length) return;
    const timer = window.setTimeout(() => { const next = chooseMove(game, level); if (next) pick(next); }, CPU_PICK_MS);
    return () => window.clearTimeout(timer);
  });

  // Turn Timer: when a player's time runs out, the game rolls or moves for them.
  function timeUp() {
    if (busy) return;
    setNotice(`Time's up — the game played for ${opponents === "cpu" ? "you" : title(turn)}.`);
    if (!game.dice.length) roll();
    else { const next = chooseMove(game, STAND_IN); if (next) pick(next); }
  }

  // Space or Enter rolls; number keys 1–4 move your tokens with the die in use; D swaps the die.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (!human || tag === "SELECT" || tag === "BUTTON") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); roll(); }
      if (event.key === "Escape") controls.putDown();
      if (event.key === "d" || event.key === "D") controls.nextDie();
      const n = Number(event.key);
      if (n >= 1 && n <= 4 && (movableTokens.has(n - 1) || choosers.has(n - 1))) controls.tapToken(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleRule(rule: Rule) { const next = { ...rules, [rule]: !rules[rule] }; setRules(next); start(next); }
  function changePlayers(value: number) { setPlayers(value); start(rules, value); }
  function changeOpponents(value: Opponents) { onOpponents(value); start(); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const ruleCount = (Object.keys(RULES) as Rule[]).filter((r) => game.rules[r]).length;
  const waitingToRoll = human && !game.dice.length && !busy;
  const status = game.winner ? "GAME OVER" : `${name(turn).toUpperCase()} · ${rolling ? "ROLLING" : !game.dice.length ? "TO ROLL" : moving ? "MOVING" : options.length ? (taxiDriving ? "DRIVING THE TAXI" : "TO MOVE") : "NO MOVE"}`;
  const prompt = game.winner ? notice
    : waitingToRoll ? `${notice} ${opponents === "friends" ? `${title(turn)} to roll` : "Your roll"} — tap the dice.`
      : human && taxiDriving && !busy ? `${notice} Your token is a taxi: tap it to drive it on ${game.dice[die]}.`
        : lines.length ? "Pick a line of play: tap the red ↶ end to capture backward, or the green end to move forward. Tap the token again to put it down."
          : human && canChoose && !busy ? `${notice} Using the ${game.dice[die]}: tap a glowing token, or tap the other die.${choosers.size ? " A red-ringed token can capture backward — tap it to see its lines of play." : ""}`
            : human && options.length > 1 && !busy ? `${notice} Tap a glowing token to move it ${game.dice[die]}.${choosers.size ? " A red-ringed token can capture backward — tap it to see its lines of play." : ""}`
              : notice;

  return <main className="draft-screen ludo-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>LUDO</strong><small>{ruleCount ? `${ruleCount} HOUSE RULE${ruleCount > 1 ? "S" : ""}` : "TWO DICE"}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        <span className="draft-count">{game.seats.map((c) => `${title(c).toUpperCase()} ${game.tokens[c].filter((t) => t.where === "home").length}/${game.tokens[c].length}`).join(" · ")}</span>
      </div>
    </header>
    <section className="draft-content ludo-content">
      <LudoBoard game={game} pair={pair} rolling={rolling} moving={moving} controls={controls} human={human} busy={busy} onRoll={roll} onPick={pick} />
      <div className="ludo-panel">
        <button className="ludo-roll" onClick={roll} disabled={!waitingToRoll} style={{ background: waitingToRoll ? COLOUR_HEX[turn].fill : undefined }}>{rolling ? "ROLLING…" : "ROLL DICE"}</button>
        <div className="ludo-turn" style={{ color: COLOUR_HEX[turn].light }}>{status}</div>
        <div className={`draft-message ${game.winner ? "finished" : ""}`} role="status">{prompt}</div>
        {timed && <TurnClock endsAt={actionAt + TURN_SECONDS * 1000} seconds={TURN_SECONDS} paused={busy || (!!game.dice.length && !options.length)} onTimeUp={timeUp} />}
      </div>
      <RuleChips rules={rules} onToggle={toggleRule} />
      <div className="draft-actions">
        <div className="draft-buttons">
          <label className="player-select"><span className="select-label">PLAYERS</span> <select value={players} onChange={(e) => changePlayers(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="player-select"><span className="select-label">PLAY</span> <select value={opponents} onChange={(e) => changeOpponents(e.target.value as Opponents)}><option value="cpu">vs CPU</option><option value="friends">Pass and play</option><option value="online">Online</option></select></label>
        </div>
        <div className="draft-buttons">
          {opponents === "cpu" && <label className="player-select"><span className="select-label">LEVEL</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
          <button onClick={() => start()} className={game.winner ? "draft-stop" : ""}>NEW GAME</button>
        </div>
      </div>
    </section>
  </main>;
}
