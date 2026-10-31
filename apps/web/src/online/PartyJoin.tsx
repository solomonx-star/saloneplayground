"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { GameId } from "@salone/games/online/protocol";
import { RoomCode } from "@/online/OnlineEntry";
import { serverUrl, type Connection } from "@/online/useRoom";

// Party play: the shared screen (a TV or laptop) shows how to join — a QR code to scan and the link and room code to
// type — and phones open the link to play.

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The link phones open to join a room. A screen opened at "localhost" asks the game server (on the same computer) for
// its address on the local network, since a phone cannot reach "localhost".
function useJoinLink(code: string, game: GameId) {
  const [link, setLink] = useState<{ url: string; reachable: boolean } | null>(null);
  useEffect(() => {
    let gone = false;
    (async () => {
      const { protocol, hostname, port } = window.location;
      let host = hostname;
      if (LOCAL.has(hostname)) {
        try {
          const answer = (await (await fetch(`${serverUrl()}/network`)).json()) as { addresses?: string[] };
          if (answer.addresses?.[0]) host = answer.addresses[0];
        } catch { /* No answer: show the link as it is, with a warning. */ }
      }
      if (!gone) setLink({ url: `${protocol}//${host}${port ? `:${port}` : ""}/join?room=${code}&game=${game}`, reachable: !LOCAL.has(host) });
    })();
    return () => { gone = true; };
  }, [code, game]);
  return link;
}

// A QR code for `text`, drawn as one SVG path of dark squares.
function Qr({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    let d = "";
    for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) if (modules.get(x, y)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { size: modules.size + 4, path: d };
  }, [text]);
  return <svg className="party-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code to join this room" shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fff" /><path d={path} fill="#0e1838" />
  </svg>;
}

export function PartyJoin({ code, game }: { code: string; game: GameId }) {
  const link = useJoinLink(code, game);
  return <div className="party-join">
    {link ? <Qr text={link.url} /> : <div className="party-qr" aria-hidden="true" />}
    <div className="party-join-text">
      <p className="eyebrow">JOIN ON YOUR PHONE</p>
      <p>Scan the code with your phone&apos;s camera, or open</p>
      <strong className="party-link">{link?.url.replace(/^https?:\/\//, "") ?? "…"}</strong>
      {link && !link.reachable && <p className="online-error">Phones cannot open &quot;localhost&quot;. Open this screen at this computer&apos;s network address instead (for example http://192.168.1.20:3000), on the same Wi-Fi as the phones.</p>}
      <RoomCode code={code} />
    </div>
  </div>;
}

// The shared screen's way into party play: choose the game's settings and start a party room.
export function PartyStart({ title, blurb, connection, children, onStart, onLocal }: { title: string; blurb: string; connection: Connection; children?: ReactNode; onStart: () => void; onLocal: () => void }) {
  return <div className="online-panel">
    <div className="draft-intro"><p className="eyebrow">PARTY PLAY</p><h1>{title}</h1><p>{blurb}</p></div>
    {children}
    <button className="draft-stop online-big" disabled={connection !== "online"} onClick={onStart}>START A PARTY</button>
    <button className="online-link" onClick={onLocal}>← Play on this device instead</button>
  </div>;
}
