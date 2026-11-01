import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GameScreen from "@/components/GameScreen";
import { findGame, GAMES } from "@/components/games";

// Each game has its own screen: /games/touch, /games/ludo, and so on.
export function generateStaticParams() {
  return GAMES.map((game) => ({ game: game.slug }));
}

export async function generateMetadata(props: PageProps<"/games/[game]">): Promise<Metadata> {
  const game = findGame((await props.params).game);
  return { title: game ? `${game.name} · Salone Playground` : "Salone Playground" };
}

export default async function GamePage(props: PageProps<"/games/[game]">) {
  const game = findGame((await props.params).game);
  if (!game) notFound();
  return <GameScreen game={game.slug} />;
}
