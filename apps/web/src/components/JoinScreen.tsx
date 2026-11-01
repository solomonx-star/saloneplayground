"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useBackToShelf } from "@/components/GameScreen";
import LeaveGuard from "@/components/LeaveGuard";
import { usePresence } from "@/online/presence";

// A phone joining a party from its QR code: opens the right game with the room code filled in. The game screens load
// in the browser only, since they read this device's saved name and connect to the game server straight away.
const LudoOnline = dynamic(() => import("@/components/ludo/LudoOnline"), { ssr: false });
const TinTanToOnline = dynamic(() => import("@/components/tintanto/TinTanToOnline"), { ssr: false });
const DraftOnline = dynamic(() => import("@/components/draft/DraftOnline"), { ssr: false });
const TouchOnline = dynamic(() => import("@/components/touch/TouchOnline"), { ssr: false });

export default function JoinScreen({ room, game }: { room: string; game: string }) {
  return <LeaveGuard><Join room={room} game={game} /></LeaveGuard>;
}

function Join({ room, game }: { room: string; game: string }) {
  const home = useBackToShelf();
  usePresence(game === "tintanto" ? "tin-tan-to" : game || null, "phone", !!game);
  if (game === "ludo") return <LudoOnline mode="phone" joinCode={room} onBack={home} onLocal={home} />;
  if (game === "tintanto") return <TinTanToOnline mode="phone" joinCode={room} onBack={home} onLocal={home} />;
  if (game === "draft") return <DraftOnline mode="phone" joinCode={room} onBack={home} onLocal={home} />;
  if (game === "touch") return <TouchOnline mode="phone" joinCode={room} onBack={home} onLocal={home} />;
  return <main className="draft-screen">
    <section className="draft-content">
      <div className="draft-intro"><p className="eyebrow">JOIN A GAME</p><h1>That link is not complete.</h1><p>Scan the QR code on the big screen again, or open the games and join with the room code.</p></div>
      <Link className="online-link" href="/">← All the games</Link>
    </section>
  </main>;
}
