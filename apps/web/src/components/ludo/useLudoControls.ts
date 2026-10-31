"use client";

import { useState } from "react";
import type { Game, Play } from "@salone/games/ludo/rules";

// What the player to move can tap, shared by Ludo on one device and online: which die is in use, which tokens
// glow, and (Back & Front) a token picked up to show its lines of play.
//
// A choice made by tapping belongs to the game state it was made on, so it lapses by itself when the game moves on.

export function useLudoControls(game: Game, options: Play[], human: boolean, onPick: (play: Play) => void) {
  const [dieChoice, setDieChoice] = useState<{ die: number; on: Game } | null>(null);
  const [picked, setPicked] = useState<{ token: number; on: Game } | null>(null);
  const chosen = dieChoice?.on === game ? dieChoice.die : 0;
  const selected = picked?.on === game ? picked.token : null;

  // The die in use: the one picked if it can move something, otherwise the first that can.
  const usable = [...new Set(options.map((p) => p.die))];
  const die = usable.includes(chosen) ? chosen : usable[0];
  const forDie = options.filter((p) => p.die === die);
  const movableTokens = new Set(forDie.map((p) => p.token));
  // Back & Front: tokens that can capture backward with either die. Tapping one shows all its lines of play
  // (backward captures in red, forward moves in green) instead of moving it straight away.
  const choosers = new Set(human ? options.filter((p) => p.back).map((p) => p.token) : []);
  const lines = selected !== null && choosers.has(selected) ? options.filter((p) => p.token === selected) : [];
  const canChoose = human && new Set(usable.map((d) => game.dice[d])).size > 1;

  return {
    options, usable, die, forDie, movableTokens, choosers, lines, canChoose, selected,
    chooseDie: (index: number) => { if (usable.includes(index)) setDieChoice({ die: index, on: game }); },
    // Steps to the other die (keyboard D).
    nextDie: () => { if (canChoose) setDieChoice({ die: usable[(usable.indexOf(die) + 1) % usable.length], on: game }); },
    putDown: () => setPicked(null),
    // Tapping a token moves it with the die in use. A token that could capture backward is picked up instead, to
    // show its lines of play; tapping it again puts it down.
    tapToken(token: number) {
      if (choosers.has(token)) { setPicked(selected === token ? null : { token, on: game }); return; }
      setPicked(null);
      const mine = forDie.filter((p) => p.token === token);
      if (mine.length) onPick(mine[0]);
    },
    // Marks the die being played while its token moves.
    playing: (play: Play) => { setPicked(null); setDieChoice({ die: play.die, on: game }); },
  };
}

export type LudoControls = ReturnType<typeof useLudoControls>;
