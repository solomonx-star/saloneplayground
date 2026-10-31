"use client";

import { useEffect, useRef, useState } from "react";
import { cellOf } from "@salone/games/ludo/board";
import type { LudoEvent, LudoMatch } from "@salone/games/ludo/match";
import type { Moving } from "@/components/ludo/LudoBoard";

// Plays the game server's updates back one at a time, the way Ludo on one device looks: the dice tumble for a roll
// and a token slides square by square for a move, then the new state is shown. If updates pile up (several moves
// arrived while one was still animating), it skips ahead without animating to catch up.

const STEP_MS = 130;
const ROLL_MS = 700;
const FLICKER_MS = 75;
const face = () => 1 + Math.floor(Math.random() * 6);

type Shown = { match: LudoMatch; pair: [number, number]; rolling: boolean; moving: Moving | null };

export function usePlayback(match: LudoMatch, onEvent?: (event: LudoEvent, after: LudoMatch) => void) {
  const [view, setView] = useState<Shown>({ match, pair: match.dice ?? [6, 6], rolling: false, moving: null });
  // The updates waiting to be shown; kept outside React state because the playback loop reads and changes it.
  const playerRef = useRef({ queue: [] as LudoMatch[], last: match.seq, shown: match, running: false, gone: false });
  const latest = useRef(onEvent);
  useEffect(() => { latest.current = onEvent; });
  useEffect(() => {
    const player = playerRef.current;
    player.gone = false;
    return () => { player.gone = true; };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (match.seq < player.last) player.queue = [match]; // A new game (a rematch) starts its count again.
    else if (match.seq > player.last) player.queue.push(match);
    else return;
    player.last = match.seq;
    if (player.running) return;
    player.running = true;

    const step = () => {
      const next = player.queue.shift();
      if (!next || player.gone) { player.running = false; return; }
      const before = player.shown;
      const restarted = next.seq < before.seq;
      const fresh = restarted ? [] : next.events.filter((e) => e.seq > before.seq);
      const main = [...fresh].reverse().find((e) => e.kind === "rolled" || e.kind === "moved");
      const finish = (pair?: [number, number]) => {
        player.shown = next;
        setView((v) => ({ match: next, pair: pair ?? next.dice ?? v.pair, rolling: false, moving: null }));
        for (const event of fresh) latest.current?.(event, next);
        window.setTimeout(step, 0);
      };
      if (!main || restarted || player.queue.length > 2) { finish(); return; }
      if (main.kind === "rolled") {
        setView((v) => ({ ...v, rolling: true }));
        const flicker = window.setInterval(() => setView((v) => ({ ...v, pair: [face(), face()] })), FLICKER_MS);
        window.setTimeout(() => { window.clearInterval(flicker); finish(main.dice); }, ROLL_MS);
        return;
      }
      const path = main.path.map((t) => cellOf(main.colour, t, main.play.token));
      const slide = (at: number) => {
        if (at >= path.length) { finish(); return; }
        setView((v) => ({ ...v, moving: { colour: main.colour, token: main.play.token, path, step: at } }));
        window.setTimeout(() => slide(at + 1), STEP_MS);
      };
      slide(0);
    };
    window.setTimeout(step, 0);
  }, [match]);

  // Whether the screen is still catching up with the server.
  const behind = view.rolling || !!view.moving || view.match.seq !== match.seq;
  return { ...view, behind };
}
