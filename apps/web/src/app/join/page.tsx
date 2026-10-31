import { Suspense } from "react";
import JoinScreen from "@/components/JoinScreen";

// The page phones open from a party's QR code: /join?room=ABCD&game=ludo. It reads the room and game from the link
// and opens that game ready to join.
export default function JoinPage(props: PageProps<"/join">) {
  return <Suspense fallback={<main className="draft-screen"><p className="online-status">Opening the game…</p></main>}>
    <Join searchParams={props.searchParams} />
  </Suspense>;
}

async function Join({ searchParams }: { searchParams: PageProps<"/join">["searchParams"] }) {
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  return <JoinScreen room={first(query.room).toUpperCase()} game={first(query.game)} />;
}
