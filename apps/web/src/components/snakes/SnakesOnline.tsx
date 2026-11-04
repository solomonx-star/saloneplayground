"use client";

import { useEffect, useState } from "react";
import { useLeaveRoom } from "@/components/LeaveGuard";
import { DieFace, title } from "@/components/ludo/LudoBoard";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import SnakesBoard from "@/components/snakes/SnakesBoard";
import SnakesRuleChips from "@/components/snakes/SnakesRuleChips";
import { describe } from "@/components/snakes/describe";
import { usePlayback } from "@/components/snakes/usePlayback";
import { OnlineEntry, OnlineNotices, RoomCode } from "@/online/OnlineEntry";
import { PartyJoin, PartyStart } from "@/online/PartyJoin";
import { RoomChat } from "@/online/RoomChat";
import { useRoom, type OnlineMode, type OnlineRoom } from "@/online/useRoom";
import { COLOUR_HEX } from "@salone/games/ludo/board";
import type { SnakesOptions } from "@salone/games/online/games";
import type { RoomView } from "@salone/games/online/protocol";
import { canRoll, type SnakesMatch } from "@salone/games/snakes/match";
import { colourOf, NO_RULES, type Rule } from "@salone/games/snakes/rules";

// Snakes and Ladders with other people's devices (see OnlineMode). The host picks the number of players and the
// house rules, friends join with the room code, and empty seats can go to computer players. The game server rolls
// the die (and rolls for a player who is away); every screen plays the rolls back the same way. In party play the
// shared screen shows the board and each phone is its player's controller: a big Roll button, with the board a tap
// away.

type Room = RoomView<SnakesMatch, SnakesOptions>;
type Online = OnlineRoom<SnakesMatch, SnakesOptions>;

export default function SnakesOnline({ onBack, onLocal, mode = "online", joinCode }: { onBack: () => void; onLocal: () => void; mode?: OnlineMode; joinCode?: string }) {
  const online = useRoom<SnakesMatch, SnakesOptions>("snakes", joinCode);
  // The settings for a room this player creates.
  const [setup, setSetup] = useState<SnakesOptions>({ players: 4, rules: NO_RULES });
  // This screen only renders in the browser, after a click or on the join page, so storage can be read during the
  // first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { room, guest } = online;
  const me = guest?.guestId ?? "";

  useEffect(() => { sound.muted = muted; }, [muted]);
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }

  const toggleSetup = (rule: Rule) => setSetup({ ...setup, rules: { ...setup.rules, [rule]: !setup.rules[rule] } });
  const game = room?.match?.game;
  return <main className={`draft-screen snakes-screen${mode === "party" && room ? " party-screen" : ""}${mode === "phone" ? " phone-screen" : ""}`}>
    <header className="draft-header">
      <button className="back-button" onClick={onBack}>← <span>GAMES</span></button>
      <div><strong>SNAKES AND LADDERS</strong><small>{mode === "online" ? "ONLINE" : "PARTY"}{room ? ` · ROOM ${room.code}` : ""}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        {game && <span className="draft-count">{game.positions.map((p, i) => `${title(colourOf(i)).toUpperCase()} ${p}`).join(" · ")}</span>}
      </div>
    </header>
    <section className="draft-content snakes-content">
      <OnlineNotices connection={online.connection} error={online.error} onDismiss={online.clearError} />
      {!room
        ? mode === "party"
          ? <PartyStart title="Snakes and Ladders on the big screen." blurb="This screen shows the board for everyone. Players join on their phones by scanning the code and roll from there; empty seats can go to the computer."
            connection={online.connection} onStart={() => void online.create("Party screen", setup, true)} onLocal={onLocal}>
            <Players value={setup.players} onChange={(players) => setSetup({ ...setup, players })} />
            <SnakesRuleChips rules={setup.rules} onToggle={toggleSetup} />
          </PartyStart>
          : joinCode
            ? <OnlineEntry title="Join the game." blurb="Enter your name to take a seat. You will roll on this phone while the big screen shows the board."
              joinCode={joinCode} connection={online.connection} onCreate={() => undefined} onJoin={(name, code) => void online.join(name, code)} onLocal={onLocal} />
            : <OnlineEntry title="Snakes and Ladders with friends anywhere." blurb="Choose the players and house rules, create a room and share its code — or join a friend's room with theirs. No sign-up, just a name."
              connection={online.connection} onCreate={(name) => void online.create(name, setup)} onJoin={(name, code) => void online.join(name, code)} onLocal={onLocal}>
              <Players value={setup.players} onChange={(players) => setSetup({ ...setup, players })} />
              <SnakesRuleChips rules={setup.rules} onToggle={toggleSetup} />
            </OnlineEntry>
        : room.status === "lobby" || !room.match
          ? <Lobby room={room} me={me} online={online} />
          : <Table key={room.code} room={room} me={me} online={online} />}
    </section>
    {room && <RoomChat room={room} me={me} online={online} />}
  </main>;
}

function Players({ value, onChange }: { value: number; onChange?: (players: number) => void }) {
  return <label className="player-select ludo-players"><span className="select-label">PLAYERS</span> <select value={value} disabled={!onChange} onChange={(e) => onChange?.(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>;
}

// The room before the game: how to join, the seats with their colours, and (for the host) the players, house
// rules, computer players and Start.
function Lobby({ room, me, online }: { room: Room; me: string; online: Online }) {
  const leaveRoom = useLeaveRoom(online.leave);
  const host = room.hostId === me;
  const full = room.seats.every((s) => s.guestId || s.cpu);
  const toggle = (rule: Rule) => void online.setOptions({ rules: { ...room.options.rules, [rule]: !room.options.rules[rule] } });
  return <div className="online-panel">
    {room.party && host ? <PartyJoin code={room.code} game="snakes" /> : <RoomCode code={room.code} />}
    <ol className="online-seats">
      {room.seats.map((seat, i) => <li key={i} className={seat.guestId || seat.cpu ? "taken" : ""}>
        <span className="online-mark" style={{ background: COLOUR_HEX[colourOf(i)].fill, borderColor: "#fff" }} aria-hidden="true" />
        <span className="online-seat-name">
          {seat.guestId ? <>{seat.name}{seat.guestId === me ? " (you)" : ""}{seat.guestId === room.hostId ? " · host" : ""}{!seat.connected ? " · away" : ""}</> : seat.cpu ? seat.name : "Waiting for a player…"}
          <small>PLAYER {i + 1} · {colourOf(i).toUpperCase()}</small>
        </span>
        {host && !seat.guestId && !seat.cpu && <button onClick={() => void online.addCpu(i, "normal")}>ADD COMPUTER</button>}
        {host && seat.cpu && <button onClick={() => void online.removeCpu(i)}>REMOVE</button>}
      </li>)}
    </ol>
    <Players value={room.options.players} onChange={host ? (players) => void online.setOptions({ players }) : undefined} />
    <SnakesRuleChips rules={room.options.rules} onToggle={host ? toggle : undefined} />
    <div className="draft-actions">
      <div className="draft-buttons" />
      <div className="draft-buttons">
        <button onClick={() => leaveRoom({ endsParty: room.party && host })}>{room.party && host ? "END PARTY" : "LEAVE ROOM"}</button>
        {host ? <button className="draft-stop" disabled={!full} onClick={() => void online.start()}>START GAME</button> : <span className="draft-turn">WAITING FOR THE HOST TO START</span>}
      </div>
    </div>
  </div>;
}

// The game, played back roll by roll from the server. You can roll only on your own turn, once the screen has caught
// up. The party screen (no seat) only shows the game; a phone in party play shows its player's Roll button.
function Table({ room, me, online }: { room: Room; me: string; online: Online }) {
  const leaveRoom = useLeaveRoom(online.leave);
  const seat = room.seats.findIndex((s) => s.guestId === me);
  const partyHost = room.party && room.hostId === me;
  const phone = room.party && seat >= 0;
  const [showBoard, setShowBoard] = useState(false);
  const [notice, setNotice] = useState("");
  const name = (player: number) => (player === seat ? "You" : room.seats[player]?.name || title(colourOf(player)));

  const { match, die, rolling, moving, behind } = usePlayback(room.match!, (event) => {
    setNotice(describe(event, name));
    if (event.kind !== "rolled") return;
    if (event.move.won) { if (event.move.player === seat || (partyHost && !phone)) sound.cheer(); else sound.lose(); }
    else if (event.move.bitten || event.move.threeSixes) sound.lose();
  }, {
    onStep: () => sound.step(),
    onRolled: () => sound.touch(),
    onSlide: (kind) => { if (kind === "ladder") sound.point(); else sound.whoosh(); },
  });
  const { game } = match;
  const turn = game.turn;
  const over = game.winner !== null;
  const myTurn = seat >= 0 && !over && turn === seat;
  const canRollNow = myTurn && !behind && canRoll(match);

  function roll() { if (canRollNow) { sound.unlock(); void online.act({ type: "roll" }); } }

  // Space or Enter rolls.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (!canRollNow || tag === "SELECT" || tag === "BUTTON" || tag === "INPUT") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); roll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const away = !over && !room.seats[turn]?.connected;
  const colour = COLOUR_HEX[colourOf(turn)];
  const status = over ? "GAME OVER" : `${name(turn).toUpperCase()} · ${rolling ? "ROLLING" : moving ? "MOVING" : "TO ROLL"}${away ? " · AWAY" : ""}`;
  const prompt = over ? notice
    : seat < 0 ? (partyHost ? notice : `${notice} You are watching this game.`)
      : !myTurn ? `${notice} Waiting for ${name(turn)}…`
        : canRollNow ? `${notice} Your roll — tap the die.`
          : notice;
  const rematch = over && (seat >= 0 || partyHost) && <button className="draft-stop" onClick={() => void online.act({ type: "rematch" })}>PLAY AGAIN</button>;
  const names = game.positions.map((_, i) => name(i));
  const board = <SnakesBoard positions={game.positions} moving={moving} turn={turn} names={names} />;

  if (phone) {
    const mine = COLOUR_HEX[colourOf(seat)];
    const yellow = colourOf(seat) === "yellow";
    const square = game.positions[seat];
    return <div className="ludo-phone">
      <div className="ludo-phone-me" style={{ background: mine.fill, color: yellow ? "#3a3200" : "#fff" }}>
        <strong>{room.seats[seat].name}</strong><small>PLAYER {seat + 1} · {colourOf(seat).toUpperCase()} · {square === 0 ? "NOT ON THE BOARD YET" : `SQUARE ${square}`}</small>
      </div>
      <div className="ludo-turn">{status}</div>
      <div className="ludo-phone-dice"><DieFace value={die} colour={colourOf(turn)} rolling={rolling} /></div>
      {canRollNow && <button className="ludo-roll ludo-phone-roll" onClick={roll} style={{ background: mine.fill, color: yellow ? "#3a3200" : "#fff" }}>ROLL THE DIE</button>}
      <div className={`draft-message ${over ? "finished" : ""}`} role="status">{(over ? notice : !myTurn ? `${notice} Waiting for ${name(turn)}…` : canRollNow ? `${notice} Your turn — roll the die.` : notice).trim() || " "}</div>
      <div className="draft-buttons ludo-phone-actions">
        <button onClick={() => setShowBoard(!showBoard)}>{showBoard ? "HIDE THE BOARD" : "SHOW THE BOARD"}</button>
        <button onClick={() => leaveRoom({ inMatch: true })}>LEAVE GAME</button>
        {rematch}
      </div>
      {showBoard && board}
    </div>;
  }

  return <>
    {board}
    <div className="snakes-panel">
      {partyHost
        ? <div className="snakes-roll" aria-hidden="true"><DieFace value={die} colour={colourOf(turn)} rolling={rolling} /></div>
        : <button className="snakes-roll" onClick={roll} disabled={!canRollNow} aria-label="Roll the die" style={{ borderColor: canRollNow ? colour.fill : undefined }}>
          <DieFace value={die} colour={colourOf(turn)} rolling={rolling} /><span>{rolling ? "ROLLING…" : "ROLL"}</span>
        </button>}
      <div className="ludo-turn" style={{ color: colour.light }}>{status}</div>
      <div className={`draft-message ${over ? "finished" : ""}`} role="status">{prompt.trim() || " "}</div>
    </div>
    <div className="draft-actions">
      <div className="draft-buttons"><button onClick={() => leaveRoom({ endsParty: partyHost, inMatch: true })}>{partyHost ? "END PARTY" : "LEAVE GAME"}</button></div>
      <div className="draft-buttons">{rematch}</div>
    </div>
  </>;
}
