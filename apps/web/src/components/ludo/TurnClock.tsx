"use client";

import { useEffect, useRef, useState } from "react";

// Turn Timer: counts down to `endsAt` (this device's clock) and calls `onTimeUp`, if given, once when it gets there.
// It keeps its own clock so its ticking does not re-render the board (which would restart the board's own timers).
// Online the server plays for the player when time runs out, so there it only shows the time left.
export default function TurnClock({ endsAt, seconds, paused = false, label, onTimeUp }: { endsAt: number; seconds: number; paused?: boolean; label?: string; onTimeUp?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(onTimeUp);
  const firedFor = useRef(0);
  useEffect(() => { latest.current = onTimeUp; });
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, []);
  const left = Math.min(seconds, Math.max(0, Math.ceil((endsAt - now) / 1000)));
  useEffect(() => {
    if (paused || left > 0 || firedFor.current === endsAt) return;
    firedFor.current = endsAt;
    latest.current?.();
  }, [paused, left, endsAt]);
  const shown = paused ? seconds : left;
  return <div className={`ludo-timer${shown <= 10 ? " low" : ""}`} role="timer" aria-label={`${label ? `${label} ` : ""}${shown} seconds`}>
    <span>{label ? `${label} ` : ""}{shown}s</span><i><b style={{ width: `${(shown / seconds) * 100}%` }} /></i>
  </div>;
}
