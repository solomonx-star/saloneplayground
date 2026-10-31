"use client";

import { useState, type ReactNode } from "react";
import { MAX_NAME, ROOM_CODE, type Guest } from "@salone/games/online/protocol";
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
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onLocal: () => void;
};

export function OnlineEntry({ title, blurb, connection, children, onCreate, onJoin, onLocal }: EntryProps) {
  // This screen only renders after a click, so storage can be read during the first render.
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState("");
  const online = connection === "online";
  return <div className="online-panel">
    <div className="draft-intro"><p className="eyebrow">PLAY ONLINE</p><h1>{title}</h1><p>{blurb}</p></div>
    <label className="online-field"><span>YOUR NAME</span><input value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aminata" autoComplete="nickname" /></label>
    {children}
    <button className="draft-stop online-big" disabled={!online} onClick={() => onCreate(name)}>CREATE A ROOM</button>
    <form className="online-join" onSubmit={(e) => { e.preventDefault(); onJoin(name, code); }}>
      <label className="online-field"><span>OR JOIN WITH A CODE</span><input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="ABCD" autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
      <button type="submit" disabled={!online || !ROOM_CODE.test(code)}>JOIN</button>
    </form>
    <button className="online-link" onClick={onLocal}>← Play on this device instead</button>
  </div>;
}

// The room code to share, big enough to read across a room.
export function RoomCode({ code }: { code: string }) {
  return <div className="online-code"><span>ROOM CODE</span><strong>{code}</strong><small>Share this code with friends so they can join.</small></div>;
}
