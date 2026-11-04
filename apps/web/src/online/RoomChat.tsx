"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_CHAT, QUICK_EMOJI, QUICK_PHRASES, REPORT_DAYS, REPORT_REASONS, type ReportReason } from "@salone/games/online/chat";
import type { RoomView } from "@salone/games/online/protocol";
import type { ChatEntry } from "@/online/useRoom";

// The room chat, shared by every online game screen. A seated player gets a chat button (with a count of unread
// messages) that opens a panel with one-tap phrases, emoji and a short message box; new messages pop up briefly
// beside the button while the panel is closed. The panel's Players view lets them mute someone (on this device
// only) or report them to the admins. The party screen (a TV with no seat) cannot send: it shows each new message
// as a large pop-up so the whole room can read it. Players blocked after reports are hidden for everyone.

const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const MUTED_KEY = "salone-chat-muted";
// Mutes are kept on this device by guest id (guests keep their id); only the most recent are remembered.
const MAX_MUTED = 200;

function readMuted(): string[] {
  try { const list: unknown = JSON.parse(window.localStorage.getItem(MUTED_KEY) ?? "[]"); return Array.isArray(list) ? list.filter((id) => typeof id === "string") : []; } catch { return []; }
}
function writeMuted(list: string[]) {
  try { window.localStorage.setItem(MUTED_KEY, JSON.stringify(list.slice(-MAX_MUTED))); } catch { /* Storage blocked: mutes last for this visit only. */ }
}

// The parts of the room connection (useRoom) the chat uses.
export type ChatConnection = {
  chat: ChatEntry[];
  blocked: string[];
  sendChat: (text: string) => Promise<string | null>;
  reportPlayer: (guestId: string, reason: ReportReason) => Promise<string | null>;
};

type Props = {
  room: RoomView<unknown, unknown>;
  me: string;
  online: ChatConnection;
  // Where the chat button sits: the bottom right corner, or near the top on screens whose controls fill the bottom
  // (Touch's joystick and buttons).
  placement?: "bottom" | "top";
};

export function RoomChat({ room, me, online, placement = "bottom" }: Props) {
  const { chat, blocked } = online;
  const partyScreen = room.party && room.hostId === me;
  const seated = room.seats.some((s) => s.guestId === me);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"messages" | "players">("messages");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  // This screen only renders in the browser, so storage can be read during the first render.
  const [muted, setMuted] = useState(readMuted);
  // The newest message this person has seen with the panel open; later ones from others count as unread. Messages
  // that came before this panel appeared (for example in Touch's lobby, before the match) count as read.
  const [readUpTo, setReadUpTo] = useState(() => chat.at(-1)?.id ?? 0);
  // The time, ticking while pop-ups may be on show, so they go away after TOAST_MS.
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLOListElement>(null);

  // Messages this screen shows: none from players blocked in this room, or muted on this device.
  const hidden = (m: ChatEntry) => blocked.includes(m.guestId) || (!partyScreen && muted.includes(m.guestId));
  const shown = chat.filter((m) => !hidden(m));
  const latest = chat.at(-1)?.id ?? 0;
  const fromOthers = shown.filter((m) => m.receivedAt > 0 && (partyScreen || m.guestId !== me));
  const unread = open ? 0 : fromOthers.filter((m) => m.id > readUpTo).length;
  const toasts = open ? [] : fromOthers.filter((m) => now - m.receivedAt < TOAST_MS).slice(-MAX_TOASTS);
  const newest = fromOthers.at(-1)?.receivedAt ?? 0;

  // Keep the clock moving only while a pop-up could still be showing.
  useEffect(() => {
    if (!newest) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time - newest >= TOAST_MS) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [newest]);

  // The open panel follows the conversation to the newest message.
  useEffect(() => {
    if (open && view === "messages" && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, view, latest]);

  if (!seated && !partyScreen) return null;

  function toggle() {
    setReadUpTo(latest);
    setProblem("");
    setView("messages");
    setOpen(!open);
  }

  function setMute(guestId: string, on: boolean) {
    const list = on ? [...muted.filter((id) => id !== guestId), guestId] : muted.filter((id) => id !== guestId);
    setMuted(list);
    writeMuted(list);
  }

  async function post(message: string) {
    if (sending || !message.trim()) return;
    setSending(true);
    setProblem("");
    const refused = await online.sendChat(message);
    setSending(false);
    if (refused) setProblem(refused);
    else if (message === text) setText("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void post(text);
  }

  // Typing must not also steer the game: the Touch field listens to the keyboard (WASD, Space) on the window.
  function keepKeys(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") toggle();
  }

  const toastList = toasts.length > 0 && <ol className="room-chat-toasts" aria-hidden={partyScreen ? undefined : true}>
    {toasts.map((m) => <li key={m.id} className={m.system ? "system" : ""}>{!m.system && <b>{m.name}</b>} {m.text}</li>)}
  </ol>;

  if (partyScreen) return <div className="room-chat party" aria-live="polite">{toastList}</div>;

  const others = room.seats.filter((s) => s.guestId && s.guestId !== me);
  const iAmBlocked = blocked.includes(me);

  return <div className={`room-chat ${placement}`}>
    {toastList}
    {open && <section className="room-chat-panel" aria-label="Room chat">
      <header>
        <strong>{view === "players" ? "PLAYERS" : "ROOM CHAT"}</strong>
        <div className="room-chat-head-buttons">
          {others.length > 0 && <button className="room-chat-tab" onClick={() => { setProblem(""); setView(view === "players" ? "messages" : "players"); }}>{view === "players" ? "← CHAT" : "PLAYERS"}</button>}
          <button onClick={toggle} aria-label="Close chat">×</button>
        </div>
      </header>
      {view === "players"
        ? <Players people={others.map((s) => ({ guestId: s.guestId!, name: s.name }))} muted={muted} blocked={blocked} onMute={setMute} report={online.reportPlayer} />
        : <>
          <ol className="room-chat-list" ref={listRef} aria-live="polite">
            {shown.length === 0 && <li className="room-chat-empty">No messages yet. Say hello!</li>}
            {shown.map((m) => m.system
              ? <li key={m.id} className="system"><span>{m.text}</span></li>
              : <li key={m.id} className={m.guestId === me ? "mine" : ""}><small>{m.guestId === me ? "You" : m.name}</small><span>{m.text}</span></li>)}
          </ol>
          {iAmBlocked
            ? <p className="room-chat-problem" role="status">You can no longer chat in this room: other players reported your messages. You can still play.</p>
            : <>
              <div className="room-chat-quick" role="group" aria-label="Quick messages">
                {QUICK_EMOJI.map((e) => <button key={e} className="emoji" disabled={sending} onClick={() => void post(e)}>{e}</button>)}
                {QUICK_PHRASES.map((p) => <button key={p} disabled={sending} onClick={() => void post(p)}>{p}</button>)}
              </div>
              {problem && <p className="room-chat-problem" role="alert">{problem}</p>}
              <form className="room-chat-form" onSubmit={submit}>
                <input value={text} maxLength={MAX_CHAT} onChange={(e) => setText(e.target.value)} onKeyDown={keepKeys} onKeyUp={(e) => e.stopPropagation()}
                  placeholder="Type a message…" aria-label="Message" autoComplete="off" enterKeyHint="send" />
                <button type="submit" disabled={sending || !text.trim()}>SEND</button>
              </form>
            </>}
          <p className="room-chat-note">Be kind. Links and phone numbers are hidden. Chat is not saved unless someone reports it. Someone bothering you? Tap PLAYERS to mute or report them.</p>
        </>}
    </section>}
    <button className="room-chat-toggle" onClick={toggle} aria-expanded={open} aria-label={unread ? `Chat, ${unread} unread` : "Chat"}>
      💬<span>CHAT</span>{unread > 0 && <i>{unread > 9 ? "9+" : unread}</i>}
    </button>
  </div>;
}

type Person = { guestId: string; name: string };

// The other people in the room, each with Mute (this device only) and Report (to the admins). Reporting someone
// also mutes them here.
function Players({ people, muted, blocked, onMute, report }: { people: Person[]; muted: string[]; blocked: string[]; onMute: (guestId: string, on: boolean) => void; report: ChatConnection["reportPlayer"] }) {
  const [reporting, setReporting] = useState<Person | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "done" | "problem" } | null>(null);

  async function send() {
    if (!reporting || !reason || busy) return;
    setBusy(true);
    const refused = await report(reporting.guestId, reason);
    setBusy(false);
    if (refused) { setMessage({ text: refused, kind: "problem" }); return; }
    onMute(reporting.guestId, true);
    setMessage({ text: `Thank you. The admins will look at this. You will not see ${reporting.name}'s messages now.`, kind: "done" });
    setReporting(null);
    setReason(null);
  }

  if (reporting) return <div className="room-chat-report">
    <p><strong>Report {reporting.name}</strong></p>
    <p className="room-chat-help">Why are you reporting them? Their recent messages go to the admins with your report and are deleted after {REPORT_DAYS} days.</p>
    <div className="room-chat-reasons" role="radiogroup" aria-label="Reason">
      {(Object.keys(REPORT_REASONS) as ReportReason[]).map((key) => <label key={key} className={reason === key ? "on" : ""}>
        <input type="radio" name="report-reason" checked={reason === key} onChange={() => setReason(key)} />{REPORT_REASONS[key]}
      </label>)}
    </div>
    {message?.kind === "problem" && <p className="room-chat-problem" role="alert">{message.text}</p>}
    <div className="room-chat-report-buttons">
      <button onClick={() => { setReporting(null); setReason(null); setMessage(null); }}>CANCEL</button>
      <button className="danger" disabled={!reason || busy} onClick={() => void send()}>SEND REPORT</button>
    </div>
  </div>;

  return <div className="room-chat-players">
    {message && <p className={message.kind === "done" ? "room-chat-done" : "room-chat-problem"} role="status">{message.text}</p>}
    <ul>
      {people.map((p) => {
        const isMuted = muted.includes(p.guestId);
        const isBlocked = blocked.includes(p.guestId);
        return <li key={p.guestId}>
          <span className="room-chat-person">{p.name}{isBlocked ? <small>BLOCKED FROM CHAT</small> : isMuted ? <small>MUTED</small> : null}</span>
          <button aria-pressed={isMuted} onClick={() => onMute(p.guestId, !isMuted)}>{isMuted ? "UNMUTE" : "MUTE"}</button>
          <button className="danger" onClick={() => { setMessage(null); setReporting(p); }}>REPORT</button>
        </li>;
      })}
    </ul>
    <p className="room-chat-help">Mute hides someone&apos;s messages on this device only. Report sends their recent messages to the admins; if other players report them too, they can no longer chat in this room.</p>
  </div>;
}
