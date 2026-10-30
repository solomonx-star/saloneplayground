"use client";

import { useRef, useState } from "react";

// On-screen analog stick. Reports a direction with x and y in -1..1; length below the dead zone reports 0, 0.
export default function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(event: React.PointerEvent<HTMLDivElement>) {
    const rect = base.current!.getBoundingClientRect();
    const radius = rect.width / 2;
    let x = (event.clientX - rect.left - radius) / radius;
    let y = (event.clientY - rect.top - radius) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    setKnob({ x, y });
    if (length < 0.15) onMove(0, 0);
    else onMove(x, y);
  }

  function release() {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }

  return (
    <div
      className="joystick"
      ref={base}
      role="application"
      aria-label="Movement joystick"
      onPointerDown={(event) => { pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
      onPointerMove={(event) => { if (pointer.current === event.pointerId) update(event); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="joystick-knob" style={{ transform: `translate(${knob.x * 30}px, ${knob.y * 30}px)` }} />
    </div>
  );
}
