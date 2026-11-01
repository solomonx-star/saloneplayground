"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomView } from "@salone/games/online/protocol";
import { FIELD_H, FIELD_W } from "@salone/games/touch/field";
import type { TouchInput } from "@salone/games/touch/match";
import { MAX_PEOPLE, TEAM_SIZES, TEAMS, teamOfSeat, type TouchFrame, type TouchOptions, type TouchSummary, type WireEvent } from "@salone/games/touch/online";
import { LEVELS, TOUCH, type Level } from "@salone/games/touch/settings";
import Joystick from "@/components/Joystick";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";
import { OnlineEntry, OnlineNotices, RoomCode } from "@/online/OnlineEntry";
import { PartyJoin, PartyStart } from "@/online/PartyJoin";
import { useRoom, type OnlineMode, type OnlineRoom } from "@/online/useRoom";
import { createOnlineTouchScene, type OnlineFeed } from "./onlineScene";

// Touch with other people's devices (see OnlineMode). Two teams, Blue and Orange; seats alternate between them and
// players can move to the other team in the lobby. Each person controls one player: a runner when their team
// attacks, a defender when it defends (and can switch to a free defender). The computer plays everyone else.

type Props = { onBack: () => void; onLocal: () => void; mode?: OnlineMode; joinCode?: string };
type Room = RoomView<TouchSummary, TouchOptions>;
type Online = OnlineRoom<TouchSummary, TouchOptions>;
type Notice = { text: string; kind: "ready" | "danger" | "success" };
// What the screen around the field shows, from the latest frame.
type Hud = { phase: TouchFrame["phase"]; attacking: 0 | 1; score: [number, number]; turn: number; totalTurns: number; clock: number | null; player: string | null; team: 0 | 1 | null };

const DEFENDER_NAMES: Record<string, string> = { line1: "Line 1 defender", line2: "Line 2 defender", line3: "Line 3 defender", line4: "Line 4 defender", main: "Main Line defender" };
const roleName = (id: string) => DEFENDER_NAMES[id] ?? `Player ${id.replace("attacker", "")}`;

export default function TouchOnline({ onBack, onLocal, mode = "online", joinCode }: Props) {
  const online = useRoom<TouchSummary, TouchOptions>("touch", joinCode);
  // This screen only renders in the browser, after a click or on the join page, so storage can be read during the
  // first render.
  const [muted, setMuted] = useState(() => readFlag(MUTED_KEY));
  const { room, guest } = online;
  const me = guest?.guestId ?? "";

  useEffect(() => { sound.muted = muted; }, [muted]);

  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function backToGames() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onBack(); }

  if (room && room.status === "playing") return <Match room={room} me={me} mode={mode} online={online} muted={muted} onMute={toggleMuted} onBack={backToGames} />;
  return <main className="draft-screen">
    <header className="draft-header">
      <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
      <div><strong>TOUCH</strong><small>{mode === "online" ? "ONLINE" : "PARTY"}{room ? ` · ROOM ${room.code}` : ""}</small></div>
      <div className="draft-header-right">
        <button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
      </div>
    </header>
    <section className="draft-content">
      <OnlineNotices connection={online.connection} error={online.error} onDismiss={online.clearError} />
      {!room
        ? mode === "party"
          ? <PartyStart title="Touch on the big screen." blurb="This screen shows the field. Players join on their phones by scanning the code, pick Blue or Orange, and use their phone as the controller. The computer plays everyone else."
            connection={online.connection} onStart={() => void online.create("Party screen", undefined, true)} onLocal={onLocal} />
          : <OnlineEntry title={joinCode ? "Join the game." : "Play Touch with friends anywhere."} blurb={joinCode ? "Enter your name to join a team. Your phone is your controller while the big screen shows the field." : "Create a room and share its four-letter code, or join a friend's room with theirs. Each person controls one player; the computer plays the rest of both teams."}
            joinCode={joinCode} connection={online.connection} onCreate={(name) => void online.create(name)} onJoin={(name, code) => void online.join(name, code)} onLocal={onLocal} />
        : <Lobby room={room} me={me} online={online} />}
    </section>
  </main>;
}

// The room before the match: how to join, the two teams, and (for the host) the team size, the computer level and Start.
function Lobby({ room, me, online }: { room: Room; me: string; online: Online }) {
  const host = room.hostId === me;
  const mySeat = room.seats.findIndex((s) => s.guestId === me);
  const { count, level } = room.options;
  const anyone = room.seats.some((s) => s.guestId);
  return <div className="online-panel">
    {room.party && host ? <PartyJoin code={room.code} game="touch" /> : <RoomCode code={room.code} />}
    <div className="touch-teams">
      {TEAMS.map((team, t) => {
        const seats = room.seats.map((seat, i) => ({ seat, i })).filter(({ i }) => teamOfSeat(i) === t);
        const people = seats.filter(({ seat }) => seat.guestId).length;
        const free = seats.find(({ seat }) => !seat.guestId);
        return <section key={team} className={`touch-team team-${t}`}>
          <h3><span className={`online-mark touch-mark team-${t}`} aria-hidden="true" />{team.toUpperCase()}<small>{t === 0 ? "ATTACKS FIRST" : "DEFENDS FIRST"}</small></h3>
          <ol className="online-seats">
            {seats.filter(({ seat }) => seat.guestId).map(({ seat, i }) => <li key={i} className="taken">
              <span className="online-seat-name">{seat.name}{seat.guestId === me ? " (you)" : ""}{seat.guestId === room.hostId ? " · host" : ""}{!seat.connected ? " · away" : ""}</span>
            </li>)}
            <li><span className="online-seat-name"><small>{count - people > 0 ? `+ ${count - people} COMPUTER PLAYER${count - people === 1 ? "" : "S"}` : "NO COMPUTER PLAYERS"}</small></span></li>
          </ol>
          {mySeat >= 0 && teamOfSeat(mySeat) !== t && free && <button className="online-big" onClick={() => void online.takeSeat(free.i)}>JOIN {team.toUpperCase()}</button>}
        </section>;
      })}
    </div>
    <p className="touch-lobby-help">{count} a side. Up to {Math.min(count, MAX_PEOPLE)} people per team; each controls one player (a runner, or a defender who can switch). Runs last at most 90 seconds online.</p>
    <div className="draft-actions">
      <div className="draft-buttons">
        <label className="player-select"><span className="select-label">TEAM SIZE</span> <select value={count} disabled={!host} onChange={(e) => void online.setOptions({ count: Number(e.target.value) })}>{TEAM_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="player-select"><span className="select-label">COMPUTER</span> <select value={level} disabled={!host} onChange={(e) => void online.setOptions({ level: e.target.value as Level })}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
      </div>
      <div className="draft-buttons">
        <button onClick={() => void online.leave()}>{room.party && host ? "END PARTY" : "LEAVE ROOM"}</button>
        {host ? <button className="draft-stop" disabled={!anyone} onClick={() => void online.start()}>START MATCH</button> : <span className="draft-turn">WAITING FOR THE HOST TO START</span>}
      </div>
    </div>
  </div>;
}

// Follows the live match for the screen around the field: the scoreboard, whose turn, this person's player, and a
// message for what just happened.
function useMatchState(online: Online, room: Room, me: string) {
  const [hud, setHud] = useState<Hud | null>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Waiting for the match…", kind: "ready" });
  const seatsRef = useRef(room.seats);
  const onlineRef = useRef(online);
  useEffect(() => { seatsRef.current = room.seats; onlineRef.current = online; });

  useEffect(() => {
    let key = "";
    let last: Hud | null = null;
    return onlineRef.current.onFrame((data) => {
      const frame = data as TouchFrame;
      const mine = frame.people[me];
      const next: Hud = {
        phase: frame.phase, attacking: frame.attacking, score: frame.score, turn: frame.turn, totalTurns: frame.totalTurns,
        clock: frame.clock === null ? null : Math.ceil(frame.clock / 1000), player: mine?.player ?? null, team: mine?.team ?? null,
      };
      const nextKey = JSON.stringify(next);
      if (nextKey !== key) { key = nextKey; setHud(next); }
      // Who controls a player, for the messages.
      const owner = (id: string | null) => Object.entries(frame.people).find(([, p]) => p.player === id)?.[0];
      const label = (id: string | null) => {
        if (!id) return "The runner";
        const guestId = owner(id);
        if (guestId === me) return "You";
        const name = seatsRef.current.find((s) => s.guestId === guestId)?.name;
        return name ? `${name} (${roleName(id)})` : roleName(id);
      };
      const team = (t: number) => TEAMS[t];
      const message = (event: WireEvent): Notice | null => {
        switch (event.type) {
          case "home": return { text: `${label(event.attacker)} made it home! +${TOUCH.homePoints} for ${team(event.team)}. ${team(event.team)} attacks again.`, kind: mine && mine.team !== event.team ? "danger" : "success" };
          case "touch": return { text: `Touch! The ${roleName(event.defender)} caught ${label(event.attacker) === "You" ? "you" : label(event.attacker)}.`, kind: "danger" };
          case "turnOver": {
            if (event.over) {
              const [blue, orange] = frame.score;
              const result = blue === orange ? "It's a draw" : `${blue > orange ? "Blue" : "Orange"} wins`;
              return { text: `Full time! ${result}, ${blue}–${orange}.`, kind: "success" };
            }
            return { text: `${event.reason === "time" ? "Time! The run took too long." : "Sides change."} ${team(frame.attacking)} attacks next.`, kind: "danger" };
          }
          case "mark": return { text: `Main Line marks ${label(event.attacker)}.`, kind: "ready" };
          default: return null;
        }
      };
      let latest: Notice | null = null;
      for (const event of frame.events) latest = message(event) ?? latest;
      // A new line-up, or this person's player changed: say who they are now.
      const lineUp = frame.phase === "ready" && last?.phase !== "ready";
      const started = frame.phase === "playing" && last?.phase !== "playing";
      if (!latest && (lineUp || started || (last && last.player !== next.player && next.player))) {
        const side = mine ? (mine.team === frame.attacking ? "Your team attacks" : "Your team defends") : `${team(frame.attacking)} attacks`;
        const you = mine?.player ? `: you are ${roleName(mine.player)}${mine.team !== frame.attacking ? " (SWITCH or tap a defender to change)" : ""}` : "";
        latest = { text: `Turn ${frame.turn} of ${frame.totalTurns}. ${side}${you}.`, kind: "ready" };
      }
      if (latest) setNotice(latest);
      last = next;
    });
  }, [me]);
  return { hud, notice };
}

// The live match. On a computer or a party's shared screen: the field, with the stick and buttons below it (none on
// the shared screen, which only watches). On a phone in a party: just the controller, since the field is on the TV.
function Match({ room, me, mode, online, muted, onMute, onBack }: { room: Room; me: string; mode: OnlineMode; online: Online; muted: boolean; onMute: () => void; onBack: () => void }) {
  const { hud, notice } = useMatchState(online, room, me);
  const inputRef = useRef<TouchInput>({ x: 0, y: 0, sprint: false });
  const seated = room.seats.some((s) => s.guestId === me);
  const partyHost = room.party && room.hostId === me;
  const defending = hud !== null && hud.team !== null && hud.team !== hud.attacking;
  const between = hud !== null && (hud.phase === "ready" || hud.phase === "stopped");
  const over = hud?.phase === "over";

  function move(x: number, y: number) { inputRef.current = { ...inputRef.current, x, y }; }
  function setSprint(on: boolean) { inputRef.current = { ...inputRef.current, sprint: on }; }
  function begin() { sound.unlock(); void online.act({ type: "begin" }); }

  const [blue, orange] = hud?.score ?? [0, 0];
  const winner = blue === orange ? "It's a draw" : `${blue > orange ? "Blue" : "Orange"} wins!`;
  const scoreboard = <div className="scoreboard touch-online-score" aria-label={`Score: Blue ${blue}, Orange ${orange}`}>
    <span className={hud?.attacking === 0 ? "turn" : ""}>BLUE<b>{blue}</b></span><span className={hud?.attacking === 1 ? "turn" : ""}>ORANGE<b>{orange}</b></span>
    <small>TURN {hud?.turn ?? 1}/{hud?.totalTurns ?? TOUCH.turnsPerTeam * 2}{hud?.clock != null ? ` · ${hud.clock}s` : ""}</small>
  </div>;
  const overlay = over
    ? <div className="match-result" role="dialog" aria-label="Match result"><small>FULL TIME</small><strong>{winner}</strong><span>{blue} – {orange}</span>{(seated || partyHost) && <button onClick={() => void online.act({ type: "rematch" })}>▶ PLAY AGAIN</button>}</div>
    : between && (seated || partyHost) ? <button className="start-overlay" onClick={begin}><span>▶</span>{hud?.phase === "ready" && hud.turn === 1 && blue + orange === 0 ? "START MATCH" : "NEXT RUN"}</button> : null;
  const controls = <>
    <div className="touch-pad"><Joystick onMove={move} /></div>
    <div className="touch-actions">
      <button className="action-button sprint" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setSprint(true); }} onPointerUp={() => setSprint(false)} onPointerCancel={() => setSprint(false)}>SPRINT</button>
      <button className="action-button" disabled={!defending} onClick={() => void online.act({ type: "switch" })}>SWITCH</button>
    </div>
  </>;
  const header = <header className="game-topbar">
    <button className="back-button" onClick={onBack}>← <span>GAMES</span></button>
    <div className="game-title"><span className="brand-mark">S</span><strong>TOUCH</strong><small>{room.party ? "PARTY" : "ONLINE"} · ROOM {room.code}</small></div>
    <div className="game-settings">
      <button className="icon-button" onClick={onMute} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button>
      <button className="back-button" onClick={() => void online.leave()}>{partyHost ? "END PARTY" : "LEAVE"}</button>
    </div>
  </header>;
  const errors = <OnlineNotices connection={online.connection} error={online.error} onDismiss={online.clearError} />;

  if (mode === "phone") {
    const team = hud?.team ?? null;
    return <main className="game-screen touch-phone">
      {header}
      <section className="touch-phone-body">
        {errors}
        <div className={`touch-phone-role ${team === null ? "" : `team-${team}`}`}>
          <small>{team === null ? "WATCHING" : `${TEAMS[team].toUpperCase()} · ${defending ? "DEFENDING" : "ATTACKING"}`}</small>
          <strong>{hud?.player ? roleName(hud.player) : "Waiting for a player…"}</strong>
        </div>
        <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
        {scoreboard}
        {overlay}
      </section>
      <div className="game-bottom touch-bottom touch-phone-controls">{controls}</div>
    </main>;
  }

  return <main className={`game-screen${room.party ? " party-screen" : ""}`}>
    {header}
    <div className="game-stage"><div className="game-frame touch-frame">
      <LiveField online={online} room={room} me={partyHost ? "" : me} input={inputRef} />
      <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
      {scoreboard}
      {overlay}
      {errors}
    </div></div>
    {partyHost
      ? <div className="game-bottom"><span className="game-help">Players use their phones as controllers. Anyone can start the next run.</span><span className="game-help">Line crossed +{TOUCH.linePoints} · home +{TOUCH.homePoints} · a touch swaps sides</span></div>
      : <div className="game-bottom touch-bottom">
        {controls}
        <span className="game-help touch-keys">WASD / arrows: move · Shift: sprint · Space or tap a defender: switch (when defending)</span>
        <span className="game-help touch-rules">Line crossed +{TOUCH.linePoints} · home +{TOUCH.homePoints} · a touch swaps sides</span>
      </div>}
  </main>;
}

// The Phaser field, drawing the live match from the server's frames.
function LiveField({ online, room, me, input }: { online: Online; room: Room; me: string; input: { current: TouchInput } }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onlineRef = useRef(online);
  const names = useRef<Record<string, string>>({});
  useEffect(() => { onlineRef.current = online; });
  useEffect(() => { names.current = Object.fromEntries(room.seats.filter((s) => s.guestId).map((s) => [s.guestId!, s.name])); }, [room.seats]);

  useEffect(() => {
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;
    const feed: OnlineFeed = {
      me,
      names,
      onFrame: (listener) => onlineRef.current.onFrame((frame) => listener(frame as TouchFrame)),
      input,
      sendInput: (value) => onlineRef.current.sendInput(value),
      switchTo: (player) => void onlineRef.current.act({ type: "switch", to: player }),
    };
    void import("phaser").then((module) => {
      if (disposed || !hostRef.current) return;
      const Phaser = module.default;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: FIELD_W,
        height: FIELD_H,
        backgroundColor: "#174b38",
        scene: createOnlineTouchScene(Phaser, feed, sound),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
      });
    });
    return () => { disposed = true; game?.destroy(true); };
  }, [me, input]);

  return <div className="game-host" ref={hostRef} />;
}
