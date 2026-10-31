"use client";

import { useMemo, useState } from "react";
import { legalTurns, moveOnly, posKey, samePos, type Board, type Pos, type Side, type Step, type Turn } from "@salone/games/draft/rules";

// Building a Draft turn by tapping, shared by Draft on one device and online: pick up a piece, then tap where it goes;
// a capture chain is played one jump at a time and may stop after any jump (captures are optional). When the turn is
// complete, `onTurn` gets it.
//
// What has been tapped belongs to the board it was tapped on, so it lapses by itself once the board changes.

export const CHAIN_HINT = "Jump again, or press STOP HERE to end your turn.";

const matches = (turn: Turn, progress: Step[]) => progress.every((step, i) => turn.steps[i] && samePos(turn.steps[i].from, step.from) && samePos(turn.steps[i].to, step.to));

type Picking = { on: Board; progress: Step[]; selected: Pos | null; hint: string | null };

export function useDraftPicker(board: Board, side: Side, enabled: boolean, onTurn: (turn: Turn) => void) {
  const [picking, setPicking] = useState<Picking | null>(null);
  const current = picking?.on === board ? picking : null;
  const progress = current?.progress ?? [];
  const selected = current?.selected ?? null;
  const hint = current?.hint ?? null;

  const turns = useMemo(() => (enabled ? legalTurns(board, side) : []), [board, side, enabled]);
  const candidates = turns.filter((turn) => matches(turn, progress));
  const at = progress.length ? progress[progress.length - 1].to : selected;
  const nextSteps = candidates.map((turn) => turn.steps[progress.length]).filter((s): s is Step => !!s && !!at && samePos(s.from, at));
  const set = (change: Partial<Picking>) => setPicking({ on: board, progress, selected, hint, ...change });
  const finish = (turn: Turn) => { setPicking(null); onTurn(turn); };

  return {
    turns,
    progress,
    selected,
    hint,
    at,
    // Squares the piece in hand can go to next.
    targets: new Set(nextSteps.map((s) => posKey(s.to))),
    // The board as it looks part-way through a capture chain: the piece where it has jumped to, the pieces it has
    // taken still there but fading.
    view: progress.reduce((b, step) => moveOnly(b, step), board),
    taken: new Set(progress.map((step) => posKey(step.captured!))),
    canCapture: turns.length > 0 && turns[0].captured.length > 0,
    // Pieces that could capture glow as a suggestion; the player is free to ignore them.
    capturers: new Set(progress.length ? [] : turns.filter((turn) => turn.captured.length).map((turn) => posKey(turn.steps[0].from))),
    click(pos: Pos) {
      if (!enabled) return;
      const step = nextSteps.find((s) => samePos(s.to, pos));
      if (step) {
        const chain = [...progress, step];
        const rest = candidates.filter((turn) => matches(turn, chain));
        // The turn ends by itself when no further jump is possible; otherwise the player may continue or stop.
        if (rest.length === 1) finish(rest[0]);
        else set({ progress: chain, selected: step.to, hint: CHAIN_HINT });
        return;
      }
      if (progress.length) { set({ hint: CHAIN_HINT }); return; }
      if (board[pos.r][pos.c]?.side !== side) { set({ selected: null, hint: null }); return; }
      if (candidates.some((turn) => samePos(turn.steps[0].from, pos))) set({ selected: pos, hint: null });
      else set({ selected: null, hint: "That piece has no legal move." });
    },
    // Ends a capture chain after the jumps made so far.
    stop() {
      const turn = turns.find((t) => t.steps.length === progress.length && matches(t, progress));
      if (turn && progress.length) finish(turn);
    },
    cancel: () => setPicking(null),
  };
}

export type DraftPicker = ReturnType<typeof useDraftPicker>;
