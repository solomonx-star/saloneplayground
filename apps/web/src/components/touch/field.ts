import { TOUCH } from "./settings";

// Field layout in game pixels. Attackers start below HOME_LINE, run up to TURN_LINE and come back home.
export const FIELD_W = TOUCH.fieldWidth;
export const FIELD_H = 600;
export const MID = FIELD_W / 2;
export const LINES = [132, 222, 312, 402];
export const TURN_LINE = 72;
export const HOME_LINE = 492;
export const START_Y = 544;
export const EDGE = 42;
export const TOUCH_RADIUS = 26;

export type Point = { x: number; y: number };

// The parts of a Phaser game object the AI needs. Tests use plain objects with the same shape.
export interface Body {
  x: number;
  y: number;
  active?: boolean;
  getData(key: string): unknown;
  setData(key: string, value: unknown): unknown;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Defended lines crossed when moving from prevY to y in the direction of the run (1 = up the field, -1 = back home).
export function linesCrossed(prevY: number, y: number, direction: number) {
  return direction === 1
    ? LINES.filter((lineY) => prevY > lineY && y <= lineY)
    : LINES.filter((lineY) => prevY < lineY && y >= lineY);
}
