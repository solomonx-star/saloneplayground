import type PhaserNamespace from "phaser";
import { floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import { rustleRate, stepHider, type Hider } from "./hiders";
import { FIELD_H, FIELD_W, HOME, HOME_RADIUS, LEVELS, SEEK, SPOTS, YARD, type Level } from "./settings";

type Arc = PhaserNamespace.GameObjects.Arc;
type Graphics = PhaserNamespace.GameObjects.Graphics;
type Text = PhaserNamespace.GameObjects.Text;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type SeekScore = { caught: number; safe: number; total: number; seconds: number; over: boolean };
export type SeekInput = { x: number; y: number; sprint: boolean };

const HIDER_COLORS = [0x69c6ef, 0xf5cb67, 0xd1a0dd, 0x92d18b, 0xf29b68];
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The React screen sends seek-start (with the level) and listens for seek-status, seek-state and seek-score.
export function createSeekScene(Phaser: typeof PhaserNamespace, input: { current: SeekInput }, sound: GameSound) {
  return class SeekField extends Phaser.Scene {
    private seeker!: Arc;
    private hiders: Hider[] = [];
    private tokens = new Map<number, Arc>();
    private spotArt: Graphics[] = [];
    private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
    private overlay!: PhaserNamespace.GameObjects.Rectangle;
    private bigText!: Text;
    private drawLayer!: Graphics;
    private phase: "ready" | "counting" | "seeking" | "over" = "ready";
    private level: Level = "normal";
    private counting = 0;
    private timeLeft = 0;
    private lastSecond = -1;
    private stamina = 1;
    private sprinting = false;
    private stepDistance = 0;
    private trail: { x: number; y: number }[] = [];

    constructor() { super("SeekField"); }

    create() {
      const g = this.add.graphics();
      g.fillGradientStyle(0x85a86a, 0x85a86a, 0x627f52, 0x627f52, 1).fillRect(0, 0, FIELD_W, FIELD_H);
      g.fillStyle(0x70945c, 0.9).fillEllipse(475, 300, 700, 430);
      g.lineStyle(3, 0xd5dfad, 0.8).strokeRoundedRect(40, 40, 880, 520, 22);
      g.fillStyle(0xead78c, 0.9).fillCircle(HOME.x, HOME.y, HOME_RADIUS).lineStyle(3, 0x805f37, 0.9).strokeCircle(HOME.x, HOME.y, HOME_RADIUS);
      this.add.text(HOME.x, HOME.y, "HOME", { fontFamily: "Arial", fontSize: "13px", color: "#513d28", fontStyle: "bold" }).setOrigin(0.5);
      this.add.text(55, 48, "PLAY KECH · STAY INSIDE THE YARD", { fontFamily: "Arial", fontSize: "12px", color: "#f2f1d9", fontStyle: "bold" });
      // Each hiding spot is its own object so it can shake when someone inside moves.
      this.spotArt = SPOTS.map((spot) => {
        const art = this.add.graphics({ x: spot.x, y: spot.y }).setDepth(5);
        if (spot.kind === "bush") art.fillStyle(0x385a38).fillCircle(0, 0, 34).fillStyle(0x4d7047).fillCircle(-4, -8, 25);
        else if (spot.kind === "crate") art.fillStyle(0x76583c).fillRoundedRect(-28, -23, 56, 46, 8).fillStyle(0x96734b).fillRect(-21, -16, 42, 12);
        else art.fillStyle(0x3d683e).fillEllipse(0, 0, 85, 52).fillStyle(0x4f7c48).fillEllipse(-8, -6, 50, 26);
        return art;
      });
      this.drawLayer = this.add.graphics().setDepth(3);
      this.seeker = this.add.circle(HOME.x, HOME.y, 16, 0xe57859).setStrokeStyle(3, 0xffd2c4).setDepth(6);
      this.overlay = this.add.rectangle(FIELD_W / 2, FIELD_H / 2, FIELD_W, FIELD_H, 0x0b1a12, 0).setDepth(20);
      this.bigText = this.add.text(FIELD_W / 2, FIELD_H / 2 - 10, "", { fontFamily: "Arial", fontSize: "54px", color: "#fff4c6", fontStyle: "bold", stroke: "#25402e", strokeThickness: 6 }).setOrigin(0.5).setDepth(21);
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT") as typeof this.keys;
      window.addEventListener("seek-start", this.start);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("seek-start", this.start));
      this.publish();
    }

    private start = (event: Event) => {
      this.level = ((event as CustomEvent<Level>).detail) ?? "normal";
      this.tokens.forEach((token) => token.destroy()); this.tokens.clear();
      const spots = Phaser.Utils.Array.Shuffle(SPOTS.map((spot) => ({ x: spot.x, y: spot.y }))).slice(0, SEEK.hiders);
      this.hiders = spots.map((spot, id) => ({ id, x: spot.x, y: spot.y, spot, mode: "hidden", think: 1 + Math.random() }));
      // Everyone runs off from home to hide while the seeker counts with eyes closed.
      this.hiders.forEach((hider) => {
        const token = this.add.circle(HOME.x, HOME.y, 12, HIDER_COLORS[hider.id]).setStrokeStyle(2, 0xffffff).setDepth(4);
        this.tweens.add({ targets: token, x: hider.x, y: hider.y, duration: SEEK.countSeconds * 1000 * 0.8, ease: "Sine.easeInOut" });
        this.tokens.set(hider.id, token);
      });
      this.seeker.setPosition(HOME.x, HOME.y);
      this.stamina = 1; this.trail = [];
      this.counting = SEEK.countSeconds; this.timeLeft = LEVELS[this.level].seconds; this.lastSecond = -1;
      this.phase = "counting";
      this.overlay.setFillStyle(0x0b1a12, 0.86);
      sound.unlock();
      emit("seek-state", { playing: true });
      emit("seek-status", { text: "Eyes closed! Count while everyone hides.", kind: "ready" });
      this.publish();
    };

    update(_time: number, delta: number) {
      const dt = Math.min(delta / 1000, 0.04);
      this.drawLayer.clear();
      if (this.phase === "counting") return this.count(dt);
      if (this.phase !== "seeking") return;
      this.timeLeft -= dt;
      if (Math.ceil(this.timeLeft) !== this.lastSecond) { this.lastSecond = Math.ceil(this.timeLeft); this.publish(); }
      if (this.timeLeft <= 0) return this.finish(true);
      this.moveSeeker(dt);
      for (const hider of this.hiders) {
        const token = this.tokens.get(hider.id)!;
        if (hider.mode === "caught" || hider.mode === "safe") continue;
        const event = stepHider(hider, this.seeker, this.level, dt);
        token.setPosition(hider.x, hider.y);
        if (event === "spotted") { this.reveal(token); floatText(this, "SPOTTED!", hider.x, hider.y - 26, "#fff4c6"); sound.whoosh(); emit("seek-status", { text: "Spotted! Catch them before they reach HOME.", kind: "ready" }); }
        if (event === "dash") { this.reveal(token); floatText(this, "RUN!", hider.x, hider.y - 26, "#ffb59e"); sound.whoosh(); emit("seek-status", { text: "Someone is sneaking home! Cut them off.", kind: "danger" }); }
        if (event === "safe") this.onSafe(hider, token);
        if (hider.mode === "running" && Phaser.Math.Distance.Between(hider.x, hider.y, this.seeker.x, this.seeker.y) < SEEK.catchRadius) this.onCatch(hider, token);
      }
      this.rustle(dt);
      this.drawSeeker();
      if (this.hiders.every((hider) => hider.mode === "caught" || hider.mode === "safe")) this.finish(false);
    }

    private count(dt: number) {
      const before = Math.ceil(this.counting);
      this.counting -= dt;
      const now = Math.ceil(this.counting);
      if (now !== before && now > 0) sound.step();
      this.bigText.setText(this.counting > 0 ? String(Math.max(1, now)) : "");
      if (this.counting > 0) return;
      // Hiders are in their spots now; they can only be seen once spotted or when they break cover.
      this.tokens.forEach((token) => token.setVisible(false));
      this.hiders.forEach((hider) => this.tokens.get(hider.id)!.setPosition(hider.x, hider.y));
      this.tweens.add({ targets: this.overlay, fillAlpha: 0, duration: 350 });
      floatText(this, "READY OR NOT, HERE I COME!", HOME.x, HOME.y - 60, "#fff4c6");
      sound.whistle();
      this.phase = "seeking";
      emit("seek-status", { text: "Search the yard. Watch for rustling spots — hiders give themselves away.", kind: "ready" });
    }

    private moveSeeker(dt: number) {
      let dx = input.current.x; let dy = input.current.y;
      if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
      if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
      if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
      const length = Math.hypot(dx, dy);
      const wants = length > 0.1 && (this.keys.SHIFT.isDown || input.current.sprint);
      this.sprinting = wants && (this.sprinting ? this.stamina > 0 : this.stamina >= SEEK.sprintMinimum);
      this.stamina = this.sprinting ? Math.max(0, this.stamina - SEEK.sprintDrain * dt) : Math.min(1, this.stamina + SEEK.sprintRegen * dt);
      if (!length) { this.trail.shift(); return; }
      // Joystick input is analog (a partial push moves slower); keys and combined input are capped at full speed.
      const scale = (length > 1 ? 1 / length : 1) * SEEK.seekerSpeed * (this.sprinting ? SEEK.sprintMultiplier : 1) * dt;
      const before = { x: this.seeker.x, y: this.seeker.y };
      this.seeker.setPosition(Phaser.Math.Clamp(this.seeker.x + dx * scale, YARD.left, YARD.right), Phaser.Math.Clamp(this.seeker.y + dy * scale, YARD.top, YARD.bottom));
      this.stepDistance += Phaser.Math.Distance.Between(before.x, before.y, this.seeker.x, this.seeker.y);
      if (this.stepDistance >= (this.sprinting ? 26 : 34)) { this.stepDistance = 0; sound.step(); }
      if (this.sprinting) this.trail.push({ x: this.seeker.x, y: this.seeker.y }); else this.trail.shift();
      if (this.trail.length > 10) this.trail.shift();
    }

    // Hidden hiders (and, on harder levels, the wind in empty spots) shake their hiding place now and then.
    private rustle(dt: number) {
      SPOTS.forEach((spot, i) => {
        const hider = this.hiders.find((h) => h.mode === "hidden" && h.spot.x === spot.x && h.spot.y === spot.y);
        const rate = rustleRate(!!hider, Phaser.Math.Distance.Between(spot.x, spot.y, this.seeker.x, this.seeker.y), this.level);
        if (Math.random() >= rate * dt) return;
        const art = this.spotArt[i];
        this.tweens.add({ targets: art, x: spot.x + 3, duration: 45, yoyo: true, repeat: 3, onComplete: () => art.setX(spot.x) });
        for (let leaf = 0; leaf < 3; leaf++) {
          const bit = this.add.circle(spot.x + (Math.random() - 0.5) * 40, spot.y - 10, 3, 0x9cc77f).setDepth(6);
          this.tweens.add({ targets: bit, y: bit.y - 22 - Math.random() * 14, x: bit.x + (Math.random() - 0.5) * 24, alpha: 0, duration: 650, onComplete: () => bit.destroy() });
        }
        if (Phaser.Math.Distance.Between(spot.x, spot.y, this.seeker.x, this.seeker.y) < 420) sound.rustle();
      });
    }

    private reveal(token: Arc) {
      token.setVisible(true).setAlpha(1).setDepth(7);
      this.tweens.add({ targets: token, scale: 1.4, duration: 120, yoyo: true });
    }

    private onCatch(hider: Hider, token: Arc) {
      hider.mode = "caught";
      sound.touch(); sound.point();
      ripple(this, hider.x, hider.y, 0xffd166);
      this.cameras.main.shake(180, 0.004);
      floatText(this, "CAUGHT!", hider.x, hider.y - 26, "#d7ec83");
      // Caught players wait in a line at the top of the yard.
      const benched = this.hiders.filter((h) => h.mode === "caught").length - 1;
      this.tweens.add({ targets: token, x: 640 + benched * 30, y: 48, scale: 0.8, duration: 500, ease: "Cubic.easeOut" });
      emit("seek-status", { text: "Caught one! Keep searching.", kind: "success" });
      this.publish();
    }

    private onSafe(hider: Hider, token: Arc) {
      sound.lose();
      ripple(this, HOME.x, HOME.y, 0xffb59e);
      floatText(this, "SAFE!", HOME.x, HOME.y - 54, "#ffb59e");
      const safe = this.hiders.filter((h) => h.mode === "safe").length - 1;
      this.tweens.add({ targets: token, x: 640 + safe * 30, y: 552, scale: 0.8, alpha: 0.7, duration: 500, ease: "Cubic.easeOut" });
      emit("seek-status", { text: "A hider made it HOME. Guard home better!", kind: "danger" });
      this.publish();
    }

    private finish(timeUp: boolean) {
      this.phase = "over";
      // When time runs out, anyone still hidden or running wins.
      for (const hider of this.hiders) if (hider.mode === "hidden" || hider.mode === "running") { hider.mode = "safe"; this.reveal(this.tokens.get(hider.id)!); }
      const caught = this.hiders.filter((h) => h.mode === "caught").length;
      const allCaught = caught === this.hiders.length;
      if (allCaught) sound.cheer(); else sound.whistle();
      emit("seek-status", {
        text: allCaught ? "You caught everyone!" : `${timeUp ? "Time up! " : ""}You caught ${caught} of ${this.hiders.length}.`,
        kind: allCaught ? "success" : caught >= this.hiders.length / 2 ? "ready" : "danger",
      });
      emit("seek-state", { playing: false });
      this.publish();
    }

    private publish() {
      const score: SeekScore = {
        caught: this.hiders.filter((h) => h.mode === "caught").length,
        safe: this.hiders.filter((h) => h.mode === "safe").length,
        total: SEEK.hiders,
        seconds: Math.max(0, Math.ceil(this.timeLeft)),
        over: this.phase === "over",
      };
      emit("seek-score", score);
    }

    // Seeker sprint trail and stamina bar.
    private drawSeeker() {
      for (let i = 1; i < this.trail.length; i++) {
        this.drawLayer.lineStyle(19 * i / this.trail.length, 0xe57859, 0.35 * i / this.trail.length).lineBetween(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
      }
      if (this.stamina < 1) {
        const x = this.seeker.x - 16; const y = this.seeker.y - 28;
        this.drawLayer.fillStyle(0x0d2f24, 0.7).fillRect(x, y, 32, 4);
        this.drawLayer.fillStyle(this.stamina < SEEK.sprintMinimum ? 0xff9b7a : 0xd7ec83, 1).fillRect(x, y, 32 * this.stamina, 4);
      }
    }
  };
}
