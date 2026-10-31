"use client";

import { useEffect, useState } from "react";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import Board, { colour } from "@/components/tintanto/Board";
import { OnlineEntry, OnlineNotices, RoomCode } from "@/online/OnlineEntry";
import { PartyJoin, PartyStart } from "@/online/PartyJoin";
import { useRoom, type OnlineMode, type OnlineRoom } from "@/online/useRoom";
import type { Match } from "@salone/games/tintanto/match";
import { DRAW_RULES, LEVELS, NEIGHBOURS, type Level, type Mark } from "@salone/games/tintanto/rules";
import type { RoomView } from "@salone/games/online/protocol";

// Tin Tan To with other people's devices (see OnlineMode). Seat 1 plays blue (X), seat 2 orange (O); empty seats can
// be given to computer players. On a phone in party play the player sees their own side of the board.
const MARKS: Mark[] = ["X", "O"];

type Props = { onBack: () => void; onLocal: () => void; mode?: OnlineMode; joinCode?: string };

export default function TinTanToOnline({ onBack, onLocal, mode = "online", joinCode }: Props) {
  const online = useRoom<Match>("tintanto", joinCode);
  // This screen only renders in the browser, after a click or on the join page, so storage can be read during the
  // first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { room, guest } = online;
  const me = guest?.guestId ?? "";

  useEffect(() => { sound.muted = muted; }, [muted]);

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  const scores = room?.match?.scores;
  const seatName = (i: number) => room?.seats[i]?.name || `Seat ${i + 1}`;
  const label = mode === "online" ? "ONLINE" : "PARTY";

  return <main className={`draft-screen ttt-screen${mode === "party" && room ? " party-screen" : ""}`}>
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>TIN TAN TO</strong><small>{label}{room ? ` · ROOM ${room.code}` : ""}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        {scores && <span className="draft-count">{seatName(0).toUpperCase()} {scores.X} · {seatName(1).toUpperCase()} {scores.O} · DRAW {scores.draws}</span>}
      </div>
    </header>
    <section className="draft-content">
      <OnlineNotices connection={online.connection} error={online.error} onDismiss={online.clearError} />
      {!room
        ? mode === "party"
          ? <PartyStart title="Tin Tan To on the big screen." blurb="This screen shows the board. Two players join on their phones by scanning the code; an empty seat can go to the computer."
            connection={online.connection} onStart={() => void online.create("Party screen", undefined, true)} onLocal={onLocal} />
          : <OnlineEntry title={joinCode ? "Join the game." : "Play a friend anywhere."} blurb={joinCode ? "Enter your name to take a seat. You will play on this phone while the big screen shows the board." : "Create a room and share its four-letter code, or join a friend's room with theirs. No sign-up — just a name."}
            joinCode={joinCode} connection={online.connection} onCreate={(name) => void online.create(name)} onJoin={(name, code) => void online.join(name, code)} onLocal={onLocal} />
        : room.status === "lobby"
          ? <Lobby room={room} me={me} online={online} />
          : <Game room={room} me={me} act={online.act} leave={online.leave} />}
    </section>
  </main>;
}

type Online = OnlineRoom<Match>;

// The room before the game: how to join (the code, or on the party screen the QR code too), the two seats, and (for
// the host) computer players and Start.
function Lobby({ room, me, online }: { room: RoomView<Match>; me: string; online: Online }) {
  const [level, setLevel] = useState<Level>("normal");
  const host = room.hostId === me;
  const full = room.seats.every((s) => s.guestId || s.cpu);
  return <div className="online-panel">
    {room.party && host ? <PartyJoin code={room.code} game="tintanto" /> : <RoomCode code={room.code} />}
    <ol className="online-seats">
      {room.seats.map((seat, i) => <li key={i} className={seat.guestId || seat.cpu ? "taken" : ""}>
        <span className={`online-mark ${MARKS[i].toLowerCase()}`} aria-hidden="true" />
        <span className="online-seat-name">
          {seat.guestId ? <>{seat.name}{seat.guestId === me ? " (you)" : ""}{seat.guestId === room.hostId ? " · host" : ""}{!seat.connected ? " · away" : ""}</> : seat.cpu ? seat.name : "Waiting for a player…"}
          <small>{colour(MARKS[i]).toUpperCase()} · {i === 0 ? "BOTTOM" : "TOP"} ROW</small>
        </span>
        {host && !seat.guestId && !seat.cpu && <button onClick={() => void online.addCpu(i, level)}>ADD COMPUTER</button>}
        {host && seat.cpu && <button onClick={() => void online.removeCpu(i)}>REMOVE</button>}
      </li>)}
    </ol>
    <div className="draft-actions">
      <div className="draft-buttons">
        {host && <label className="player-select"><span className="select-label">COMPUTER</span> <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>}
      </div>
      <div className="draft-buttons">
        <button onClick={() => void online.leave()}>{room.party && host ? "END PARTY" : "LEAVE ROOM"}</button>
        {host ? <button className="draft-stop" disabled={!full} onClick={() => void online.start()}>START GAME</button> : <span className="draft-turn">WAITING FOR THE HOST TO START</span>}
      </div>
    </div>
  </div>;
}

// The game: your seat's colour plays at the bottom of the board and you move only on your turn. The party screen
// (no seat) shows blue at the bottom and can start the next round.
function Game({ room, me, act, leave }: { room: RoomView<Match>; me: string; act: Online["act"]; leave: Online["leave"] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const match = room.match!;
  const { board, toMove, result, last, moves } = match;
  const seat = room.seats.findIndex((s) => s.guestId === me);
  const partyHost = room.party && room.hostId === me;
  const mine = MARKS[seat];
  const myTurn = !result && toMove === mine;
  // A piece picked up last turn means nothing once it is someone else's go.
  const picked = myTurn ? selected : null;

  // A tap for each move, then a cheer, a low tone or a whistle when the round ends.
  useEffect(() => {
    if (!last) return;
    if (!result) { sound.step(); return; }
    if (result === "draw") sound.whistle();
    else if (!mine || result.mark === mine) sound.cheer();
    else sound.lose();
  }, [last, result, mine, moves]);

  function tap(point: number) {
    if (!myTurn) return;
    sound.unlock();
    if (board[point] === mine) { setSelected(picked === point ? null : point); return; }
    if (picked !== null && !board[point] && NEIGHBOURS[picked].includes(point)) { setSelected(null); void act({ type: "move", move: { from: picked, to: point } }); }
  }

  // Number keys 1–9 tap the points as they appear on screen (1 is top left), so the keypad matches a turned board.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === "INPUT") return;
      const n = Number(event.key);
      if (n >= 1 && n <= 9) tap(seat === 1 ? 9 - n : n - 1);
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const seatOf = (mark: Mark) => room.seats[MARKS.indexOf(mark)];
  const name = (mark: Mark) => (mark === mine ? "You" : seatOf(mark).name);
  const waitingFor = seatOf(toMove);
  const message = result === "draw" ? (moves >= DRAW_RULES.moves ? `Draw — ${DRAW_RULES.moves} moves and no three in a row.` : "Draw — the same position came round three times.")
    : result ? (result.mark === mine ? "Three in a row — you win!" : `${name(result.mark)} made three in a row${seat >= 0 ? "." : "!"}`)
      : seat < 0 ? `${name(toMove)} to move (${colour(toMove)})${waitingFor.connected ? "." : " — they are away; waiting for them to come back."}`
        : myTurn ? (picked !== null ? "Now tap a lit point to slide there." : `Your move — tap one of your ${colour(mine)} pieces.`)
          : !waitingFor.connected ? `${waitingFor.name} is away — waiting for them to come back.`
            : `Waiting for ${name(toMove)} to move…`;
  const labels = seat < 0
    ? { top: `${seatOf("O").name.toUpperCase()} · HOME ROW`, bottom: `${seatOf("X").name.toUpperCase()} · HOME ROW` }
    : { top: `${name(MARKS[1 - seat]).toUpperCase()} · HOME ROW`, bottom: "YOUR HOME ROW" };

  return <>
    <Board match={match} selected={picked} flipped={seat === 1} waiting={!myTurn} onTap={tap} labels={labels} />
    <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
    <div className="draft-actions">
      <div className="draft-buttons"><button onClick={() => void leave()}>{partyHost ? "END PARTY" : "LEAVE GAME"}</button></div>
      <span className="draft-turn">{result ? "ROUND OVER" : `${name(toMove).toUpperCase()} · ${colour(toMove).toUpperCase()}`}</span>
      <div className="draft-buttons">{result && (seat >= 0 || partyHost) && <button className="draft-stop" onClick={() => void act({ type: "next" })}>NEXT ROUND</button>}</div>
    </div>
  </>;
}
