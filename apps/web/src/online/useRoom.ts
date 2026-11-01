"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { EVENTS, type GameId, type Guest, type Reply, type RoomView } from "@salone/games/online/protocol";

// The connection to the game server for party and online play, shared by every online game screen. It keeps the
// guest's identity on this device so they come back as themselves, rejoins their room after a reload or a dropped
// connection, and holds the latest state of the room.

// The game server's address. On the same Wi-Fi a phone reaches it at this computer's address, so by default it is
// the host the page was opened from, on port 4000.
export function serverUrl() {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (configured) return configured;
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

const GUEST_KEY = "salone-guest";
const roomKey = (game: GameId) => `salone-room-${game}`;

function read<T>(key: string): T | null {
  try { const text = window.localStorage.getItem(key); return text ? (JSON.parse(text) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage blocked: works for this visit only. */ }
}

export type Connection = "connecting" | "online" | "offline";
// How a game screen plays with other people's devices:
// - online: each player on their own device; create a room and share its code, or join one with a code.
// - party: this is the shared screen (a TV or laptop): it shows the QR code to join and then the board for everyone;
//   the players play on their phones.
// - phone: a phone that opened a party's join link, used as that player's controller.
export type OnlineMode = "online" | "party" | "phone";
export type OnlineRoom<M, O = unknown> = ReturnType<typeof useRoom<M, O>>;

// `joinCode`: the room a phone was sent to by a party's join link. The device only goes back to the room it was in
// before if that is the same room.
export function useRoom<M, O = unknown>(game: GameId, joinCode?: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [room, setRoomState] = useState<RoomView<M, O> | null>(null);
  // When the room on show arrived, in this device's clock: the server's timer counts from there.
  const [receivedAt, setReceivedAt] = useState(0);
  const [error, setError] = useState("");
  // Screens of real-time games (Touch) listen for the live match's frames here.
  const frameListeners = useRef(new Set<(frame: unknown) => void>());
  // The latest frame, for a listener that starts after it arrived (between runs no new frames come).
  const lastFrame = useRef<{ events?: unknown[] } | null>(null);

  // Shows a room from the server, unless it is older than the one on show.
  const setRoom = useCallback((view: RoomView<M, O> | null) => {
    setRoomState((shown) => (view && shown && shown.code === view.code && shown.version > view.version ? shown : view));
    setReceivedAt(Date.now());
  }, []);

  useEffect(() => {
    const socket = io(serverUrl(), { transports: ["websocket"], reconnectionDelayMax: 4000 });
    socketRef.current = socket;
    socket.on("connect", async () => {
      // Say hello as the guest this device already is, then go back to the room it was in, if any.
      const saved = read<Guest>(GUEST_KEY);
      const hello: Reply<Guest> = await socket.emitWithAck(EVENTS.hello, saved ?? {});
      if (!hello.ok) { setError(hello.error); return; }
      write(GUEST_KEY, hello.value);
      setGuest(hello.value);
      setConnection("online");
      const code = read<string>(roomKey(game));
      if (!code || (joinCode && code !== joinCode)) return;
      const joined: Reply<RoomView<M, O>> = await socket.emitWithAck(EVENTS.join, { code });
      if (joined.ok) setRoom(joined.value);
      else { write(roomKey(game), null); setRoom(null); }
    });
    socket.on(EVENTS.frame, (frame: { events?: unknown[] }) => {
      lastFrame.current = frame;
      for (const listener of frameListeners.current) listener(frame);
    });
    socket.on("disconnect", () => setConnection("offline"));
    socket.on("connect_error", () => setConnection("offline"));
    socket.on(EVENTS.update, (view: RoomView<M, O>) => {
      if (view.game !== game) return;
      // The party screen left: the room is over for everyone.
      if (view.status === "closed") {
        write(roomKey(game), null);
        setRoomState(null);
        setError("This room has closed: the party screen left.");
        return;
      }
      setRoom(view);
    });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [game, joinCode, setRoom]);

  // Sends a request; on success applies the room it returns, on failure shows the server's message.
  async function request<T>(event: string, body?: unknown): Promise<T | null> {
    const socket = socketRef.current;
    if (!socket?.connected) { setError("Not connected to the game server."); return null; }
    setError("");
    try {
      const answer: Reply<T> = await socket.timeout(8000).emitWithAck(event, body);
      if (!answer.ok) { setError(answer.error); return null; }
      return answer.value;
    } catch {
      setError("The game server did not answer. Check your connection and try again.");
      return null;
    }
  }

  function show(view: RoomView<M, O> | null) {
    if (!view) return;
    write(roomKey(game), view.code);
    setRoom(view);
  }

  // Updates the name this guest plays under (on this device and the server).
  async function rename(name: string) {
    const saved = read<Guest>(GUEST_KEY);
    const renamed = await request<Guest>(EVENTS.hello, { ...saved, name });
    if (renamed) { write(GUEST_KEY, renamed); setGuest(renamed); }
    return !!renamed;
  }

  return {
    connection,
    guest,
    room,
    receivedAt,
    error,
    clearError: () => setError(""),
    async create(name: string, options?: O, party = false) { if (await rename(name)) show(await request<RoomView<M, O>>(EVENTS.create, { game, options, party })); },
    async join(name: string, code: string) { if (await rename(name)) show(await request<RoomView<M, O>>(EVENTS.join, { code })); },
    async leave() { await request(EVENTS.leave); write(roomKey(game), null); lastFrame.current = null; setRoom(null); },
    setOptions: async (options: Partial<O>) => show(await request<RoomView<M, O>>(EVENTS.options, { options })),
    addCpu: async (seat: number, level: string) => show(await request<RoomView<M, O>>(EVENTS.addCpu, { seat, level })),
    removeCpu: async (seat: number) => show(await request<RoomView<M, O>>(EVENTS.removeCpu, { seat })),
    start: async () => show(await request<RoomView<M, O>>(EVENTS.start)),
    act: async (action: unknown) => show(await request<RoomView<M, O>>(EVENTS.act, { action })),
    takeSeat: async (seat: number) => show(await request<RoomView<M, O>>(EVENTS.seat, { seat })),
    // Real-time games: every frame of the live match (returns a function that stops listening), and this player's
    // stick and buttons. Input is sent without waiting for an answer: the next frame shows the result.
    onFrame(listener: (frame: unknown) => void) {
      frameListeners.current.add(listener);
      // Catch up with the match as it is now; what happened before is not played again.
      if (lastFrame.current) listener({ ...lastFrame.current, events: [] });
      return () => { frameListeners.current.delete(listener); };
    },
    sendInput(input: unknown) { socketRef.current?.volatile.emit(EVENTS.input, { input }); },
  };
}
