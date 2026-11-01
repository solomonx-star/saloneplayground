import type PhaserNamespace from "phaser";
import { FIELD_H, FIELD_W, HOME_LINE, LINES, MID, TURN_LINE } from "@salone/games/touch/field";

// The Touch field: grass, the four defended lines, the turn line, home, and the Main Line down the middle.
export function drawField(scene: PhaserNamespace.Scene) {
  const w = FIELD_W;
  const h = FIELD_H;
  const g = scene.add.graphics();
  g.fillGradientStyle(0x226b4d, 0x226b4d, 0x1d6045, 0x1d6045, 1);
  g.fillRoundedRect(12, 12, w - 24, h - 24, 20);
  g.lineStyle(2, 0x9bc5a1, 0.75).strokeRoundedRect(28, 28, w - 56, h - 56, 12);
  g.lineStyle(2, 0xd1e3cb, 0.48);
  LINES.forEach((y, i) => {
    g.lineBetween(32, y, w - 32, y);
    scene.add.text(40, y - 22, `LINE ${i + 1}`, { fontFamily: "Arial", fontSize: "10px", color: "#d9ead6", fontStyle: "bold" }).setAlpha(0.8);
  });
  g.lineStyle(3, 0xf0d77a, 0.85).lineBetween(32, HOME_LINE, w - 32, HOME_LINE);
  g.lineStyle(3, 0xf0d77a, 0.85).lineBetween(32, TURN_LINE, w - 32, TURN_LINE);
  g.lineStyle(2, 0xf6dda0, 0.8).lineBetween(MID, 46, MID, 524);
  scene.add.text(42, HOME_LINE + 9, "START · HOME", { fontFamily: "Arial", fontSize: "11px", color: "#fff4c6", fontStyle: "bold" });
  scene.add.text(42, 52, "LAST LINE · TURN BACK", { fontFamily: "Arial", fontSize: "11px", color: "#fff4c6", fontStyle: "bold" });
  scene.add.text(MID + 8, 270, "MAIN LINE", { fontFamily: "Arial", fontSize: "10px", color: "#ffe8ad", fontStyle: "bold" }).setAngle(-90).setAlpha(0.9);
}

// A white wedge in front of a player showing which way they face, turned smoothly toward where they last moved.
// `memory` keeps the last position and heading between calls.
export function drawFacing(graphics: PhaserNamespace.GameObjects.Graphics, memory: { last?: { x: number; y: number }; heading?: { x: number; y: number } }, x: number, y: number, radius: number, start: { x: number; y: number }) {
  const last = memory.last ?? { x, y };
  const moved = Math.hypot(x - last.x, y - last.y);
  let heading = memory.heading ?? start;
  if (moved > 0.3) {
    const blend = { x: heading.x * 0.7 + (x - last.x) / moved * 0.3, y: heading.y * 0.7 + (y - last.y) / moved * 0.3 };
    const length = Math.hypot(blend.x, blend.y) || 1;
    heading = { x: blend.x / length, y: blend.y / length };
  }
  memory.last = { x, y };
  memory.heading = heading;
  const base = radius + 2; const tip = base + 7;
  const side = { x: -heading.y * 5, y: heading.x * 5 };
  graphics.fillStyle(0xffffff, 0.85).fillTriangle(
    x + heading.x * tip, y + heading.y * tip,
    x + heading.x * base + side.x, y + heading.y * base + side.y,
    x + heading.x * base - side.x, y + heading.y * base - side.y,
  );
  return moved;
}
