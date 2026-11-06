"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MAX_NAME, QUICK_ALONE_SECONDS, ROOM_CODE, type Guest, type RoomView } from "@salone/games/online/protocol";
import type { Connection } from "@/online/useRoom";

// The way into online play, shared by every online game: a name (no sign-up), then create a room or join one with
// its code. Also the line that shows when the game server cannot be reached, and the server's error messages.

// The name this device last played under, to fill in the form.
function savedName() {
  try { return (JSON.parse(window.localStorage.getItem("salone-guest") ?? "null") as Guest | null)?.name ?? ""; } catch { return ""; }
}

export function OnlineNotices({ connection, error, onDismiss }: { connection: Connection; error: string; onDismiss: () => void }) {
  return <>
    {connection !== "online" && <p className={`online-status ${connection}`} role="status">{connection === "connecting" ? "Connecting to the game server…" : "Can't reach the game server. Retrying… (is it running? `npm run dev` starts it with the web app)"}</p>}
    {error && <p className="online-error" role="alert">{error} <button onClick={onDismiss} aria-label="Dismiss">×</button></p>}
  </>;
}

type EntryProps = {
  title: string;
  blurb: string;
  connection: Connection;
  // Extra settings shown above the Create button (for example Ludo's players and house rules).
  children?: ReactNode;
  // A phone that opened a party's join link: the code is filled in and there is no Create button.
  joinCode?: string;
  onCreate: (name: string) => void;
  // Quick match: play with whoever is online now, without a code.
  onQuick?: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onLocal: () => void;
};

export function OnlineEntry({ title, blurb, connection, children, joinCode, onCreate, onQuick, onJoin, onLocal }: EntryProps) {
  // This screen only renders after a click (or on the join page, in the browser only), so storage can be read during
  // the first render.
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(joinCode ?? "");
  const online = connection === "online";
  return <div className="online-panel">
    <div className="draft-intro"><p className="eyebrow">PLAY ONLINE</p><h1>{title}</h1><p>{blurb}</p></div>
    <label className="online-field"><span>YOUR NAME</span><input value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aminata" autoComplete="nickname" /></label>
    {onQuick && !joinCode && <div className="online-quick">
      <button className="draft-stop online-big" disabled={!online} onClick={() => onQuick(name)}>QUICK MATCH</button>
      <small>Play with whoever is online now. No code needed; the computer fills any empty seats.</small>
      <p className="online-or"><span>OR PLAY WITH FRIENDS</span></p>
    </div>}
    {children}
    {!joinCode && <button className={`${onQuick ? "" : "draft-stop "}online-big`} disabled={!online} onClick={() => onCreate(name)}>CREATE A ROOM</button>}
    <form className="online-join" onSubmit={(e) => { e.preventDefault(); onJoin(name, code); }}>
      <label className="online-field"><span>{joinCode ? "ROOM CODE" : "OR JOIN WITH A CODE"}</span><input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="ABCD" autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
      <button type="submit" disabled={!online || !ROOM_CODE.test(code)}>JOIN</button>
    </form>
    <button className="online-link" onClick={onLocal}>{joinCode ? "← All the games" : "← Play on this device instead"}</button>
  </div>;
}

// The room code to share, big enough to read across a room.
export function RoomCode({ code }: { code: string }) {
  return <div className="online-code"><span>ROOM CODE</span><strong>{code}</strong><small>Share this code with friends so they can join.</small></div>;
}

// A quick-match room before the game, in place of the room code and the host's Start: how many players are here,
// the countdown once a second player has arrived, and, for someone waiting alone a while, a game against the
// computer instead.
export function QuickMatchStatus({ room, me, receivedAt, onPlayComputer }: { room: RoomView; me: string; receivedAt: number; onPlayComputer: () => void }) {
  const people = room.seats.filter((s) => s.guestId).length;
  const alone = people === 1 && room.seats.some((s) => s.guestId === me);
  const [now, setNow] = useState(() => Date.now());
  // When this screen first saw itself alone in the room, in this device's clock (null while others are here).
  const [aloneSince, setAloneSince] = useState<number | null>(() => (alone ? now : null));
  if (alone && aloneSince === null) setAloneSince(now);
  if (!alone && aloneSince !== null) setAloneSince(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const startsIn = room.startsIn == null ? null : Math.max(0, Math.ceil((room.startsIn - (now - receivedAt)) / 1000));
  const offerComputer = aloneSince !== null && now - aloneSince >= QUICK_ALONE_SECONDS * 1000;
  return <div className="online-code online-quick-status" role="status">
    <span>QUICK MATCH</span>
    <strong>{people} of {room.seats.length}</strong>
    <small>{startsIn !== null
      ? `Starting in ${startsIn} s. The computer takes any empty seats.`
      : alone ? "Looking for players… The game starts once someone else joins." : "Waiting for players…"}</small>
    {offerComputer && <div className="online-quick-alone">
      <p>Nobody else is here right now.</p>
      <button className="draft-stop" onClick={onPlayComputer}>PLAY THE COMPUTER</button>
    </div>}
  </div>;
}
