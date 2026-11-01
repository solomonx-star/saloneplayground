"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import LeaveGuard, { useConfirmLeave } from "@/components/LeaveGuard";
import type { GameSlug } from "@/components/games";

// The games load in the browser only: they draw with Phaser and read this device's saved settings.
type Game = ComponentType<{ onBack: () => void }>;
const SCREENS: Record<GameSlug, Game> = {
  "balance-ball": dynamic(() => import("@/components/balance/BalanceGame"), { ssr: false }),
  touch: dynamic(() => import("@/components/touch/TouchGame"), { ssr: false }),
  "hide-and-seek": dynamic(() => import("@/components/HideSeekGame"), { ssr: false }),
  draft: dynamic(() => import("@/components/DraftGame"), { ssr: false }),
  marbles: dynamic(() => import("@/components/MarblesGame"), { ssr: false }),
  "tin-tan-to": dynamic(() => import("@/components/TinTanToGame"), { ssr: false }),
  ludo: dynamic(() => import("@/components/LudoGame"), { ssr: false }),
};

// One game on its own screen. Going back to the games shelf asks first.
export default function GameScreen({ game }: { game: GameSlug }) {
  return <LeaveGuard><Screen game={game} /></LeaveGuard>;
}

function Screen({ game }: { game: GameSlug }) {
  const Game = SCREENS[game];
  const back = useBackToShelf();
  return <Game onBack={back} />;
}

// Asks, then leaves fullscreen and returns to the games shelf.
export function useBackToShelf() {
  const router = useRouter();
  const confirmLeave = useConfirmLeave();
  return () => confirmLeave({
    title: "Leave this game?",
    body: "You will go back to the games shelf and the game in progress will end.",
    onConfirm: () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      router.push("/");
    },
  });
}
