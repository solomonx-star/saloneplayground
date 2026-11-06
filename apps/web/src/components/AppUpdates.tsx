"use client";

import { useEffect, useState } from "react";

// Keeps the app on the phone (the service worker in public/sw.js) and offers a newer release when there is one.
//
// A screen can be on an older release when it opened from the phone on a slow or missing connection, or when it was
// left open across a release. It finds out by asking the site, with a tiny request that skips the service worker,
// which release it is on now (X-App-Version, set in next.config.ts): shortly after opening, and whenever the screen is
// shown again, at most every CHECK_EVERY_MS. RELOAD loads the newer release; an online game comes back to its room.

const MINE = process.env.NEXT_PUBLIC_APP_RELEASE ?? "local";
const CHECK_EVERY_MS = 15 * 60_000;
const FIRST_CHECK_MS = 5_000;

export default function AppUpdates() {
  const [newer, setNewer] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || MINE === "local") return;
    let last = 0;
    async function check() {
      if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < CHECK_EVERY_MS) return;
      last = Date.now();
      try {
        // HEAD: only the headers come back. The service worker leaves anything but GET to the network.
        const response = await fetch("/", { method: "HEAD", cache: "no-store" });
        const current = response.headers.get("X-App-Version");
        if (response.ok && current && current !== "local" && current !== MINE) setNewer(true);
      } catch { /* No connection: ask again later. */ }
    }
    const first = setTimeout(() => void check(), FIRST_CHECK_MS);
    const again = () => void check();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => { clearTimeout(first); document.removeEventListener("visibilitychange", again); window.removeEventListener("online", again); };
  }, []);

  if (!newer || dismissed) return null;
  return <div className="app-update" role="status">
    <span>A new version of Salone Playground is ready.</span>
    <button className="draft-stop" onClick={() => window.location.reload()}>RELOAD</button>
    <button className="app-update-later" onClick={() => setDismissed(true)} aria-label="Not now">LATER</button>
  </div>;
}
