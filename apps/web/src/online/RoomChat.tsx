"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_CHAT, QUICK_EMOJI, QUICK_PHRASES } from "@salone/games/online/chat";
import type { RoomView } from "@salone/games/online/protocol";
import type { ChatEntry } from "@/online/useRoom";

// The room chat, shared by every online game screen. A seated player gets a chat button (with a count of unread
// messages) that opens a panel with one-tap phrases, emoji and a short message box; new messages pop up briefly
// beside the button while the panel is closed. The party screen (a TV with no seat) cannot send: it shows each new
// message as a large pop-up so the whole room can read it.

const TOAST_MS = 6000;
const MAX_TOASTS = 3;

type Props = {
  room: RoomView<unknown, unknown>;
  me: string;
  chat: ChatEntry[];
  send: (text: string) => Promise<string | null>;
  // Where the chat button sits: the bottom right corner, or near the top on screens whose controls fill the bottom
  // (Touch's joystick and buttons).
  placement?: "bottom" | "top";
};

export function RoomChat({ room, me, chat, send, placement = "bottom" }: Props) {
  const partyScreen = room.party && room.hostId === me;
  const seated = room.seats.some((s) => s.guestId === me);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  // The newest message this person has seen with the panel open; later ones from others count as unread. Messages
  // that came before this panel appeared (for example in Touch's lobby, before the match) count as read.
  const [readUpTo, setReadUpTo] = useState(() => chat.at(-1)?.id ?? 0);
  // The time, ticking while pop-ups may be on show, so they go away after TOAST_MS.
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLOListElement>(null);

  const latest = chat.at(-1)?.id ?? 0;
  const fromOthers = chat.filter((m) => m.receivedAt > 0 && (partyScreen || m.guestId !== me));
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
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, latest]);

  if (!seated && !partyScreen) return null;

  function toggle() {
    setReadUpTo(latest);
    setProblem("");
    setOpen(!open);
  }

  async function post(message: string) {
    if (sending || !message.trim()) return;
    setSending(true);
    setProblem("");
    const refused = await send(message);
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
    {toasts.map((m) => <li key={m.id}><b>{m.name}</b> {m.text}</li>)}
  </ol>;

  if (partyScreen) return <div className="room-chat party" aria-live="polite">{toastList}</div>;

  return <div className={`room-chat ${placement}`}>
    {toastList}
    {open && <section className="room-chat-panel" aria-label="Room chat">
      <header><strong>ROOM CHAT</strong><button onClick={toggle} aria-label="Close chat">×</button></header>
      <ol className="room-chat-list" ref={listRef} aria-live="polite">
        {chat.length === 0 && <li className="room-chat-empty">No messages yet. Say hello!</li>}
        {chat.map((m) => <li key={m.id} className={m.guestId === me ? "mine" : ""}>
          <small>{m.guestId === me ? "You" : m.name}</small><span>{m.text}</span>
        </li>)}
      </ol>
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
      <p className="room-chat-note">Be kind. Links and phone numbers are hidden. Chat is not saved.</p>
    </section>}
    <button className="room-chat-toggle" onClick={toggle} aria-expanded={open} aria-label={unread ? `Chat, ${unread} unread` : "Chat"}>
      💬<span>CHAT</span>{unread > 0 && <i>{unread > 9 ? "9+" : unread}</i>}
    </button>
  </div>;
}
