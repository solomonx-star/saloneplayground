"use client";

import { useEffect, useState } from "react";
import { chooseTurn, LEVELS, type Level } from "@salone/games/draft/ai";
import type { DraftMatch } from "@salone/games/draft/match";
import { countPieces, type Side, type Turn } from "@salone/games/draft/rules";
import type { RoomView } from "@salone/games/online/protocol";
import DraftBoard, { resultText } from "@/components/draft/DraftBoard";
import { CHAIN_HINT, useDraftPicker } from "@/components/draft/useDraftPicker";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { OnlineEntry, OnlineNotices, RoomCode } from "@/online/OnlineEntry";
import { PartyJoin, PartyStart } from "@/online/PartyJoin";
import { useRoom, type OnlineMode, type OnlineRoom } from "@/online/useRoom";
import { useLeaveRoom } from "@/components/LeaveGuard";

// Draft with other people's devices (see OnlineMode). Seat 1 plays Black (moves first), seat 2 White; an empty seat
// can go to a computer player. Each player sees the board from their own side; the party screen shows it from
// Black's side.
const SIDES: Side[] = ["black", "white"];
const title = (side: Side) => (side === "black" ? "Black" : "White");

type Props = { onBack: () => void; onLocal: () => void; mode?: OnlineMode; joinCode?: string };
type Room = RoomView<DraftMatch>;
type Online = OnlineRoom<DraftMatch>;

export default function DraftOnline({ onBack, onLocal, mode = "online", joinCode }: Props) {
  const online = useRoom<DraftMatch>("draft", joinCode);
  // This screen only renders in the browser, after a click or on the join page, so storage can be read during the
  // first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { room, guest } = online;
  const me = guest?.guestId ?? "";

  useEffect(() => { sound.muted = muted; }, [muted]);

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { onBack(); }

  const counts = room?.match ? countPieces(room.match.board) : null;
  return <main className={`draft-screen${mode === "party" && room ? " party-screen" : ""}`}>
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>DRAFT</strong><small>{mode === "online" ? "ONLINE" : "PARTY"}{room ? ` · ROOM ${room.code}` : ""}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
        {room && counts && <span className="draft-count">{(room.seats[0]?.name || "BLACK").toUpperCase()} {counts.black} · {(room.seats[1]?.name || "WHITE").toUpperCase()} {counts.white}</span>}
      </div>
    </header>
    <section className="draft-content">
      <OnlineNotices connection={online.connection} error={online.error} onDismiss={online.clearError} />
      {!room
        ? mode === "party"
          ? <PartyStart title="Draft on the big screen." blurb="This screen shows the board. Two players join on their phones by scanning the code; an empty seat can go to the computer."
            connection={online.connection} onStart={() => void online.create("Party screen", undefined, true)} onLocal={onLocal} />
          : <OnlineEntry title={joinCode ? "Join the game." : "Play Draft with a friend anywhere."} blurb={joinCode ? "Enter your name to take a seat. You will play on this phone while the big screen shows the board." : "Create a room and share its four-letter code, or join a friend's room with theirs. No sign-up — just a name."}
            joinCode={joinCode} connection={online.connection} onCreate={(name) => void online.create(name)} onJoin={(name, code) => void online.join(name, code)} onLocal={onLocal} />
        : room.status === "lobby" || !room.match
          ? <Lobby room={room} me={me} online={online} />
          : <Game room={room} me={me} online={online} />}
    </section>
  </main>;
}

// The room before the game: how to join, the two seats, and (for the host) computer players and Start.
function Lobby({ room, me, online }: { room: Room; me: string; online: Online }) {
  const leaveRoom = useLeaveRoom(online.leave);
  const [level, setLevel] = useState<Level>("normal");
  const host = room.hostId === me;
  const full = room.seats.every((s) => s.guestId || s.cpu);
  return <div className="online-panel">
    {room.party && host ? <PartyJoin code={room.code} game="draft" /> : <RoomCode code={room.code} />}
    <ol className="online-seats">
      {room.seats.map((seat, i) => <li key={i} className={seat.guestId || seat.cpu ? "taken" : ""}>
        <span className={`online-mark draft-mark ${SIDES[i]}`} aria-hidden="true" />
        <span className="online-seat-name">
          {seat.guestId ? <>{seat.name}{seat.guestId === me ? " (you)" : ""}{seat.guestId === room.hostId ? " · host" : ""}{!seat.connected ? " · away" : ""}</> : seat.cpu ? seat.name : "Waiting for a player…"}
          <small>{SIDES[i].toUpperCase()}{i === 0 ? " · MOVES FIRST" : ""}</small>
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
        <button onClick={() => leaveRoom({ endsParty: room.party && host })}>{room.party && host ? "END PARTY" : "LEAVE ROOM"}</button>
        {host ? <button className="draft-stop" disabled={!full} onClick={() => void online.start()}>START GAME</button> : <span className="draft-turn">WAITING FOR THE HOST TO START</span>}
      </div>
    </div>
  </div>;
}

// The game: your colour plays from the bottom of the board, and you move only on your turn. A turn is built by tapping
// (a capture chain one jump at a time) and sent to the server, which checks it against the rules.
function Game({ room, me, online }: { room: Room; me: string; online: Online }) {
  const leaveRoom = useLeaveRoom(online.leave);
  const match = room.match!;
  const { board, side, last, result } = match;
  const seat = room.seats.findIndex((s) => s.guestId === me);
  const partyHost = room.party && room.hostId === me;
  const mine = SIDES[seat];
  const myTurn = !!mine && !result && side === mine;
  const picker = useDraftPicker(board, mine ?? "black", myTurn, (turn) => void online.act({ type: "turn", steps: turn.steps.map(({ from, to }) => ({ from, to })) }));
  const { progress, canCapture } = picker;
  // A hint belongs to the board it was asked on.
  const [hint, setHint] = useState<{ turn: Turn; on: DraftMatch["board"] } | null>(null);
  const suggestion = hint?.on === board && myTurn ? hint.turn : null;

  // Sounds follow the board: a click for a move, a thud for a capture, a chime for a new king, and the result.
  useEffect(() => {
    if (!last) return;
    if (result) { if (!mine || result.winner === mine) sound.cheer(); else if (result.winner) sound.lose(); else sound.whistle(); return; }
    if (last.captured.length) sound.touch(); else sound.step();
    if (last.crowned) sound.point();
  }, [last, result, mine]);

  const seatOf = (s: Side) => room.seats[SIDES.indexOf(s)];
  const name = (s: Side) => (s === mine ? "You" : seatOf(s)?.name || title(s));
  const waitingFor = seatOf(side);
  const message = result ? resultText(result, name)
    : picker.hint ?? (seat < 0 ? `${name(side)} to move (${side})${waitingFor.connected ? "." : " — they are away; waiting for them to come back."}`
      : !myTurn ? (waitingFor.connected ? `Waiting for ${name(side)} to move…` : `${waitingFor.name} is away — waiting for them to come back.`)
        : progress.length ? CHAIN_HINT
          : suggestion ? suggestion.captured.length ? `Suggestion: jump with the marked piece to take ${suggestion.captured.length}.` : "Suggestion: move the marked piece to the marked square."
            : canCapture ? "You can capture with a glowing piece, or leave it and set a trap."
              : !last ? `You play ${side}, and Black moves first — the Blackman Trouble Rule.` : "Your move.");

  return <>
    <DraftBoard match={match} picker={picker} suggestion={progress.length ? null : suggestion} waiting={!myTurn} flipped={mine === "white"} onTap={() => { sound.unlock(); setHint(null); }} />
    <div className={`draft-message ${result ? "finished" : ""}`} role="status">{message}</div>
    <div className="draft-actions">
      <div className="draft-buttons"><button onClick={() => leaveRoom({ endsParty: partyHost, inMatch: true })}>{partyHost ? "END PARTY" : "LEAVE GAME"}</button></div>
      <span className="draft-turn">{result ? "GAME OVER" : `${name(side).toUpperCase()} · ${side.toUpperCase()}`}{myTurn && canCapture && !progress.length ? " · CAPTURE AVAILABLE" : ""}</span>
      <div className="draft-buttons">
        {myTurn && (progress.length > 0
          ? <button className="draft-stop" onClick={picker.stop}>STOP HERE</button>
          : <button onClick={() => { const turn = chooseTurn(board, mine, "normal"); if (turn) setHint({ turn, on: board }); }}>HINT</button>)}
        {result && (seat >= 0 || partyHost) && <button className="draft-stop" onClick={() => void online.act({ type: "rematch" })}>PLAY AGAIN</button>}
      </div>
    </div>
  </>;
}
