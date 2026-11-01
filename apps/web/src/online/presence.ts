"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import type { PresenceReport } from "@salone/games/online/admin";
import { EVENTS, type Guest } from "@salone/games/online/protocol";
import { serverUrl } from "@/online/useRoom";

// Tells the game server what this screen is showing, for the admin dashboard: the games shelf, a game's setup, or
// a game being played. One connection is shared by every page and stays open while the visitor moves between them;
// closing the page ends it, and with it any game session.

const VISITOR_KEY = "salone-visitor";

let socket: Socket | null = null;
let fallbackId = "";
let current: Omit<PresenceReport, "visitorId" | "name"> = { game: null, mode: null, playing: false };

// A random id. Not crypto.randomUUID, which phones opening the game over plain http on the local network lack.
function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function visitorId() {
  try {
    const saved = window.localStorage.getItem(VISITOR_KEY);
    if (saved) return saved;
    const id = newId();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    // Storage blocked: an id for this visit only.
    return (fallbackId ||= newId());
  }
}

// The name the visitor last played online with, if any.
function name() {
  try { return (JSON.parse(window.localStorage.getItem("salone-guest") ?? "null") as Guest | null)?.name ?? ""; } catch { return ""; }
}

function send() {
  if (!socket?.connected) return;
  // A game left open in a hidden tab is not being played.
  const report: PresenceReport = { visitorId: visitorId(), name: name(), ...current, playing: current.playing && document.visibilityState === "visible" };
  socket.emit(EVENTS.presence, report);
}

function connect() {
  if (socket) return;
  socket = io(serverUrl(), { transports: ["websocket"], reconnectionDelayMax: 10000 });
  socket.on("connect", send);
  document.addEventListener("visibilitychange", send);
}

// Reports this screen: `game` is the game's page name (null on the shelf), `mode` how it is played, and `playing`
// whether a game is under way (false on its setup screen).
export function usePresence(game: string | null, mode: string | null, playing: boolean) {
  useEffect(() => {
    connect();
    current = { game, mode, playing };
    send();
  }, [game, mode, playing]);
}
