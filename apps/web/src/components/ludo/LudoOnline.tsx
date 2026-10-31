"use client";

import { useEffect, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import LudoBoard, { title } from "@/components/ludo/LudoBoard";
import RuleChips from "@/components/ludo/RuleChips";
import TurnClock from "@/components/ludo/TurnClock";
import { useLudoControls } from "@/components/ludo/useLudoControls";
import { usePlayback } from "@/components/ludo/usePlayback";
import { OnlineEntry, OnlineNotices, RoomCode } from "@/online/OnlineEntry";
import { useRoom, type OnlineRoom } from "@/online/useRoom";
import { COLOUR_HEX } from "@salone/games/ludo/board";
import { canRoll, type LudoEvent, type LudoMatch } from "@salone/games/ludo/match";
import { current, LEVELS, NO_RULES, plays, seatsFor, TURN_SECONDS, type Colour, type Level, type Play, type Rule } from "@salone/games/ludo/rules";
import type { LudoOptions } from "@salone/games/online/games";
import type { RoomView } from "@salone/games/online/protocol";

// Ludo online: each player on their own device. The host picks the number of players and the house rules, friends
// join with the room code, and empty seats can go to computer players. The game server rolls the dice and runs the
// house rules and the turn timer; this screen shows its moves the way Ludo on one device does.

type Room = RoomView<LudoMatch, LudoOptions>;
type Online = OnlineRoom<LudoMatch, LudoOptions>;

export default function LudoOnline({ onBack, onLocal }: { onBack: () => void; onLocal: () => void }) {
  const online = useRoom<LudoMatch, LudoOptions>("ludo");
  // The settings for a room this player creates.
  const [setup, setSetup] = useState<LudoOptions>({ players: 4, rules: NO_RULES });
  // This screen only renders after a click, so storage can be read during the first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { room, guest } = online;
  const me = guest?.guestId ?? "";

  useEffect(() => { sound.muted = muted; }, [muted]);

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const game = room?.match?.game;
  return <main className="draft-screen ludo-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>LUDO</strong><small>ONLINE{room ? ` · ROOM ${room.code}` : ""}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        {game && <span className="draft-count">{game.seats.map((c) => `${title(c).toUpperCase()} ${game.tokens[c].filter((t) => t.where === "home").length}/${game.tokens[c].length}`).join(" · ")}</span>}
      </div>
    </header>
    <section className="draft-content ludo-content">
      <OnlineNotices connection={online.connection} error={online.error} onDismiss={online.clearError} />
      {!room
        ? <OnlineEntry title="Ludo with friends anywhere." blurb="Choose the players and house rules, create a room and share its code — or join a friend's room with theirs. No sign-up, just a name."
          connection={online.connection} onCreate={(name) => void online.create(name, setup)} onJoin={(name, code) => void online.join(name, code)} onLocal={onLocal}>
          <Players value={setup.players} onChange={(players) => setSetup({ ...setup, players })} />
          <RuleChips rules={setup.rules} onToggle={(rule) => setSetup({ ...setup, rules: { ...setup.rules, [rule]: !setup.rules[rule] } })} />
        </OnlineEntry>
        : room.status === "lobby" || !room.match
          ? <Lobby room={room} me={me} online={online} />
          : <Table key={room.code} room={room} me={me} online={online} />}
    </section>
  </main>;
}

function Players({ value, onChange }: { value: number; onChange?: (players: number) => void }) {
  return <label className="player-select ludo-players"><span className="select-label">PLAYERS</span> <select value={value} disabled={!onChange} onChange={(e) => onChange?.(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>;
}

// The room before the game: its code to share, the seats with their colours, and (for the host) the players, house
// rules, computer players and Start.
function Lobby({ room, me, online }: { room: Room; me: string; online: Online }) {
  const [level, setLevel] = useState<Level>("normal");
  const host = room.hostId === me;
  const colours = seatsFor(room.options.players);
  const full = room.seats.every((s) => s.guestId || s.cpu);
  const toggle = (rule: Rule) => void online.setOptions({ rules: { ...room.options.rules, [rule]: !room.options.rules[rule] } });
  return <div className="online-panel">
    <RoomCode code={room.code} />
    <ol className="online-seats">
      {room.seats.map((seat, i) => <li key={i} className={seat.guestId || seat.cpu ? "taken" : ""}>
        <span className="online-mark" style={{ background: COLOUR_HEX[colours[i]].fill, borderColor: "#fff" }} aria-hidden="true" />
        <span className="online-seat-name">
          {seat.guestId ? <>{seat.name}{seat.guestId === me ? " (you)" : ""}{seat.guestId === room.hostId ? " · host" : ""}{!seat.connected ? " · away" : ""}</> : seat.cpu ? seat.name : "Waiting for a player…"}
          <small>PLAYER {i + 1} · {colours[i].toUpperCase()}</small>
        </span>
        {host && !seat.guestId && !seat.cpu && <button onClick={() => void online.addCpu(i, level)}>ADD COMPUTER</button>}
        {host && seat.cpu && <button onClick={() => void online.removeCpu(i)}>REMOVE</button>}
      </li>)}
    </ol>
    <Players value={room.options.players} onChange={host ? (players) => void online.setOptions({ players }) : undefined} />
    <RuleChips rules={room.options.rules} onToggle={host ? toggle : undefined} />
    <div className="draft-actions">
      <div className="draft-buttons">
        {host && <label className="player-select"><span className="select-label">COMPUTER</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
      </div>
      <div className="draft-buttons">
        <button onClick={() => void online.leave()}>LEAVE ROOM</button>
        {host ? <button className="draft-stop" disabled={!full} onClick={() => void online.start()}>START GAME</button> : <span className="draft-turn">WAITING FOR THE HOST TO START</span>}
      </div>
    </div>
  </div>;
}

// The game: the board as the server last left it, played back move by move. You can roll and move only on your
// own turn, once the screen has caught up.
function Table({ room, me, online }: { room: Room; me: string; online: Online }) {
  const seat = room.seats.findIndex((s) => s.guestId === me);
  const nameOf = (colour: Colour, match: LudoMatch) => {
    const index = match.game.seats.indexOf(colour);
    return index === seat ? "You" : room.seats[index]?.name || title(colour);
  };
  const [notice, setNotice] = useState("");
  const { match, pair, rolling, moving, behind } = usePlayback(room.match!, (event, after) => {
    const text = describe(event, (c) => nameOf(c, after));
    if (text) setNotice(text);
    if (event.kind === "moved") {
      const { outcome } = event;
      if (outcome.hanged || outcome.poisoned) sound.lose();
      else if (outcome.captured.length) sound.touch();
      else if (outcome.home || outcome.dropped) sound.point();
      else sound.step();
    }
    if (event.kind === "rolled") sound.touch();
    if (event.kind === "won") { if (after.game.seats.indexOf(event.colour) === seat) sound.cheer(); else sound.lose(); }
  });
  const { game } = match;
  const turn = current(game);
  const myTurn = seat >= 0 && !game.winner && game.turn === seat;
  const ready = myTurn && !behind;
  const options = ready && game.dice.length ? plays(game) : [];
  const controls = useLudoControls(game, options, ready, pick);
  const { die, movableTokens, choosers, lines, canChoose } = controls;
  const name = (colour: Colour) => nameOf(colour, match);
  const labels = Object.fromEntries(game.seats.map((c) => [c, name(c)])) as Partial<Record<Colour, string>>;
  const canRollNow = ready && canRoll(match);

  function roll() { if (canRollNow) { sound.unlock(); void online.act({ type: "roll" }); } }
  function pick(play: Play) {
    if (!options.some((p) => p.token === play.token && p.die === play.die && !!p.back === !!play.back)) return;
    controls.playing(play);
    void online.act({ type: "move", play });
  }

  // Only one move possible: make it for the player, as on one device.
  useEffect(() => {
    if (options.length !== 1) return;
    const timer = window.setTimeout(() => pick(options[0]), 400);
    return () => window.clearTimeout(timer);
  });

  // Space or Enter rolls; number keys 1–4 move your tokens with the die in use; D swaps the die.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (!ready || tag === "SELECT" || tag === "BUTTON" || tag === "INPUT") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); roll(); }
      if (event.key === "Escape") controls.putDown();
      if (event.key === "d" || event.key === "D") controls.nextDie();
      const n = Number(event.key);
      if (n >= 1 && n <= 4 && (movableTokens.has(n - 1) || choosers.has(n - 1))) controls.tapToken(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const away = !game.winner && !room.seats[game.turn]?.connected;
  const status = game.winner ? "GAME OVER" : `${name(turn).toUpperCase()} · ${rolling ? "ROLLING" : moving ? "MOVING" : canRoll(match) ? "TO ROLL" : "TO MOVE"}${away ? " · AWAY" : ""}`;
  const prompt = game.winner ? notice
    : seat < 0 ? `${notice} You are watching this game.`
      : !myTurn ? `${notice} Waiting for ${name(turn)}…`
        : behind ? notice
          : canRollNow ? `${notice} Your roll — tap the dice.`
            : lines.length ? "Pick a line of play: tap the red ↶ end to capture backward, or the green end to move forward. Tap the token again to put it down."
              : canChoose ? `${notice} Using the ${game.dice[die]}: tap a glowing token, or tap the other die.${choosers.size ? " A red-ringed token can capture backward — tap it to see its lines of play." : ""}`
                : options.length > 1 ? `${notice} Tap a glowing token to move it ${game.dice[die]}.${choosers.size ? " A red-ringed token can capture backward — tap it to see its lines of play." : ""}`
                  : notice;
  const timer = room.timer && !behind ? room.timer : null;

  return <>
    <LudoBoard game={game} pair={pair} rolling={rolling} moving={moving} controls={controls} human={ready} busy={behind || !!game.winner} onRoll={roll} onPick={pick} labels={labels} />
    <div className="ludo-panel">
      <button className="ludo-roll" onClick={roll} disabled={!canRollNow} style={{ background: canRollNow ? COLOUR_HEX[turn].fill : undefined }}>{rolling ? "ROLLING…" : "ROLL DICE"}</button>
      <div className="ludo-turn" style={{ color: COLOUR_HEX[turn].light }}>{status}</div>
      <div className={`draft-message ${game.winner ? "finished" : ""}`} role="status">{prompt.trim() || " "}</div>
      {timer && <TurnClock key={`${room.version}`} endsAt={online.receivedAt + timer.endsIn} seconds={TURN_SECONDS}
        label={timer.reason === "away" ? `${name(game.seats[timer.seat])} is away — playing for them in` : timer.seat === seat ? "Your time:" : `${name(game.seats[timer.seat])}'s time:`} />}
    </div>
    <RuleChips rules={game.rules} />
    <div className="draft-actions">
      <div className="draft-buttons"><button onClick={() => void online.leave()}>LEAVE GAME</button></div>
      <div className="draft-buttons">{game.winner && seat >= 0 && <button className="draft-stop" onClick={() => void online.act({ type: "rematch" })}>PLAY AGAIN</button>}</div>
    </div>
  </>;
}

// What a player reads about something that just happened in the game.
function describe(event: LudoEvent, name: (colour: Colour) => string): string {
  const who = name(event.colour);
  // Captured players by name ("you" for this player).
  const whom = (colour: Colour) => (name(colour) === "You" ? "you" : name(colour));
  const verb = (base: string) => (who === "You" ? base : `${base}s`);
  switch (event.kind) {
    case "rolled": {
      const [a, b] = event.dice;
      return `${who} rolled ${a} and ${b}.${event.nothing ? " Nothing can move." : event.double ? " A double — another roll after this." : ""}`;
    }
    case "stood-in": return event.reason === "timeout" ? `Time's up — the game played for ${who === "You" ? "you" : who}.` : `${who} ${who === "You" ? "were" : "is"} away — the game played for ${who === "You" ? "you" : "them"}.`;
    case "won": return `${who} ${verb("win")}!`;
    case "moved": {
      const { outcome } = event;
      const more = event.again ? "" : " after this";
      if (outcome.hanged) return `${who} landed on step 55 and got hanged — back to the yard.`;
      if (outcome.poisoned) return `${who} landed on a poison arrow — back to the yard.`;
      if (outcome.dropped) return "The taxi dropped its rider at the home entrance and goes back to the yard.";
      if (outcome.taxi) return `${who} captured ${whom(outcome.captured[0].colour)}! That token is now a taxi carrying ${who === "You" ? "yours" : `${who}'s`} to its home entrance — and another roll${more}.`;
      if (outcome.captured.length) return `${who} captured ${outcome.captured.map((v) => whom(v.colour)).join(" and ")}${event.play.back ? " moving backward" : ""}! Back to the yard — and another roll${more}.`;
      if (outcome.home) return `${who} got a token home — another roll${more}.`;
      if (event.again) return `${who} ${verb("roll")} again.`;
      if (event.lostDie) return `${who} could not use the other die.`;
      return "";
    }
  }
}
