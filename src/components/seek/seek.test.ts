import { describe, expect, it } from "vitest";
import { canBeatSeekerHome, rustleRate, stepHider, type Hider } from "./hiders";
import { HOME, SEEK } from "./settings";

const hider = (x: number, y: number, mode: Hider["mode"] = "hidden"): Hider => ({ id: 0, x, y, spot: { x, y }, mode, think: 0 });
const always = () => 0;

describe("hiders", () => {
  it("are spotted when the seeker comes close", () => {
    const h = hider(150, 150);
    expect(stepHider(h, { x: 150 + SEEK.spotRadius - 5, y: 150 }, "normal", 0.016)).toBe("spotted");
    expect(h.mode).toBe("running");
  });

  it("sneak home when the seeker has wandered far from home", () => {
    const h = hider(330, 300);
    expect(stepHider(h, { x: 880, y: 540 }, "normal", 0.016, always)).toBe("dash");
  });

  it("stay hidden while the seeker guards home", () => {
    const h = hider(150, 150);
    for (let i = 0; i < 200; i++) stepHider(h, { x: HOME.x + 50, y: HOME.y }, "hard", 0.05, always);
    expect(h.mode).toBe("hidden");
    expect(canBeatSeekerHome(h, { x: HOME.x + 50, y: HOME.y }, "hard")).toBe(false);
  });

  it("run home and are safe when they get there", () => {
    const h = hider(150, 300, "running");
    let event = null;
    for (let i = 0; i < 300 && !event; i++) event = stepHider(h, { x: 900, y: 60 }, "normal", 0.016);
    expect(event).toBe("safe");
  });

  it("swerve away from a seeker standing in their path", () => {
    const h = hider(300, 300, "running");
    stepHider(h, { x: 360, y: 290 }, "normal", 0.1);
    expect(h.y).toBeGreaterThan(300);
  });

  it("rustle more as the seeker gets closer, and empty spots only rustle on harder levels", () => {
    expect(rustleRate(true, 50, "normal")).toBeGreaterThan(rustleRate(true, 350, "normal"));
    expect(rustleRate(false, 50, "easy")).toBe(0);
    expect(rustleRate(false, 50, "hard")).toBeGreaterThan(0);
  });
});
