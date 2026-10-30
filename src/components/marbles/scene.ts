import type PhaserNamespace from "phaser";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import { chooseShot } from "./ai";
import { atRest, cloneBalls, shotVelocity, step, type Ball } from "./physics";
import { edgePoint, insideRing, makeShooter, newMatch, resolveShot, setupTargets, SHOOTER_COLORS, type Match, type Player, type Point } from "./rules";
import { CENTER, FIELD, MAX_DRAG, PHYSICS, RING_R, type Level } from "./settings";

type Graphics = PhaserNamespace.GameObjects.Graphics;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type Mode = "cpu" | "friend";
export type MarblesState = { scores: [number, number]; current: Player; over: boolean; mode: Mode };

const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const CPU_THINK_MS = 650;

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The React screen sends marbles-start ({ mode, level }) and listens for marbles-status, marbles-state and marbles-score.
export function createMarblesScene(Phaser: typeof PhaserNamespace, sound: GameSound) {
  return class MarblesRing extends Phaser.Scene {
    private balls: Ball[] = [];
    private match: Match = newMatch();
    private mode: Mode = "cpu";
    private level: Level = "normal";
    private phase: "idle" | "aim" | "rolling" | "cpu" | "over" = "idle";
    private shooterAt: Point | null = null;
    private dragging: "aim" | "slide" | null = null;
    private aim: { angle: number; power: number } | null = null;
    private before: Ball[] = [];
    private table!: Graphics;
    private guide!: Graphics;
    private lastClack = 0;
    private accumulator = 0;

    constructor() { super("MarblesRing"); }

    create() {
      const g = this.add.graphics();
      // Packed earth with a scratched ring, the way it is drawn with a stick.
      g.fillStyle(0xb98a5a).fillRect(0, 0, FIELD, FIELD);
      for (let i = 0; i < 900; i++) {
        g.fillStyle(Math.random() < 0.5 ? 0xa37548 : 0xc99a68, 0.5).fillCircle(Math.random() * FIELD, Math.random() * FIELD, 1 + Math.random() * 2.5);
      }
      g.fillStyle(0xc49464, 0.55).fillCircle(CENTER.x, CENTER.y, RING_R);
      g.lineStyle(5, 0x6b4a2b, 0.6).strokeCircle(CENTER.x, CENTER.y, RING_R);
      g.lineStyle(2, 0xf1dcb6, 0.5).strokeCircle(CENTER.x, CENTER.y, RING_R - 3);
      this.add.text(18, 16, "KNOCK THEM OUT OF THE RING", { fontFamily: "Arial", fontSize: "12px", color: "#fff4dd", fontStyle: "bold" }).setAlpha(0.85);
      this.table = this.add.graphics().setDepth(3);
      this.guide = this.add.graphics().setDepth(4);
      this.input.on("pointerdown", this.pointerDown);
      this.input.on("pointermove", this.pointerMove);
      this.input.on("pointerup", this.pointerUp);
      // Pulling back from a shooter on the bottom of the ring usually ends below the board, so releases there count too.
      this.input.on("pointerupoutside", this.pointerUp);
      window.addEventListener("marbles-start", this.start);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("marbles-start", this.start));
      this.balls = setupTargets();
      this.draw();
    }

    private start = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: Mode; level: Level }>).detail;
      this.mode = detail?.mode ?? "cpu";
      this.level = detail?.level ?? "normal";
      this.balls = setupTargets();
      this.match = newMatch(0);
      sound.unlock();
      sound.whistle();
      emit("marbles-state", { playing: true });
      this.beginTurn();
    };

    private isCpuTurn() { return this.mode === "cpu" && this.match.current === 1; }
    private playerName(player: Player = this.match.current) {
      return this.mode === "cpu" ? (player === 0 ? "You" : "The computer") : `Player ${player + 1}`;
    }

    private beginTurn() {
      this.balls = this.balls.filter((b) => b.kind === "target");
      const at = this.match.fromEdge || !this.shooterAt ? this.defaultEdge() : this.shooterAt;
      this.shooterAt = at;
      this.balls.push(makeShooter(this.match.current, at));
      this.aim = null;
      this.publish();
      if (this.isCpuTurn()) {
        this.phase = "cpu";
        emit("marbles-status", { text: "The computer is lining up a shot…", kind: "ready" });
        // Search in a timer so the message shows first; the search itself takes a fraction of a second.
        this.time.delayedCall(CPU_THINK_MS, () => this.cpuShoot());
        return;
      }
      this.phase = "aim";
      const who = this.mode === "cpu" ? "Your" : `${this.playerName()}'s`;
      emit("marbles-status", {
        text: this.match.fromEdge
          ? `${who} shot. Drag the shooter around the ring to place it, then pull back from it and let go to flick.`
          : `${who} shot again, from where your shooter stopped. Pull back and let go.`,
        kind: "ready",
      });
    }

    // Each turn from the edge starts at the bottom of the ring, nearest the player holding the phone.
    private defaultEdge() { return edgePoint({ x: CENTER.x, y: CENTER.y + 1 }); }

    private shooter() { return this.balls.find((b) => b.kind === "shooter")!; }

    private pointerDown = (p: PhaserNamespace.Input.Pointer) => {
      if (this.phase !== "aim") return;
      const shooter = this.shooter();
      const near = Phaser.Math.Distance.Between(p.worldX, p.worldY, shooter.x, shooter.y) < 46;
      if (this.match.fromEdge && !near) {
        // Tapping near the ring line moves the shooter there; keep holding to slide it around.
        this.dragging = "slide";
        this.slideTo(p.worldX, p.worldY);
        return;
      }
      if (near) this.dragging = "aim";
    };

    private pointerMove = (p: PhaserNamespace.Input.Pointer) => {
      if (this.phase !== "aim" || !this.dragging) return;
      if (this.dragging === "slide") { this.slideTo(p.worldX, p.worldY); return; }
      const shooter = this.shooter();
      const dx = shooter.x - p.worldX; const dy = shooter.y - p.worldY;
      const pull = Math.hypot(dx, dy);
      this.aim = pull < 8 ? null : { angle: Math.atan2(dy, dx), power: Math.min(1, pull / MAX_DRAG) };
    };

    private pointerUp = () => {
      if (this.phase !== "aim") return;
      const aim = this.dragging === "aim" ? this.aim : null;
      this.dragging = null;
      if (aim && aim.power > 0.06) this.shoot(aim.angle, aim.power);
      else this.aim = null;
    };

    private slideTo(x: number, y: number) {
      const at = edgePoint({ x, y });
      const shooter = this.shooter();
      shooter.x = at.x; shooter.y = at.y; this.shooterAt = at;
    }

    private cpuShoot() {
      if (this.phase !== "cpu") return;
      const shot = chooseShot(this.balls, 1, this.match.fromEdge, this.shooterAt, this.level);
      const shooter = this.shooter();
      // Show where the computer is aiming for a moment before it flicks.
      this.tweens.add({
        targets: shooter, x: shot.from.x, y: shot.from.y, duration: 350, ease: "Sine.easeInOut",
        onComplete: () => {
          this.aim = { angle: shot.angle, power: shot.power };
          this.time.delayedCall(450, () => this.shoot(shot.angle, shot.power));
        },
      });
    }

    private shoot(angle: number, power: number) {
      const shooter = this.shooter();
      this.before = cloneBalls(this.balls);
      Object.assign(shooter, shotVelocity(angle, power));
      this.aim = null;
      this.phase = "rolling";
      sound.whoosh();
    }

    update(_time: number, delta: number) {
      if (this.phase === "rolling") {
        // Fixed physics steps keep the game the same speed on fast and slow screens.
        this.accumulator += Math.min(delta / 1000, 0.05);
        while (this.accumulator >= PHYSICS.step) {
          this.accumulator -= PHYSICS.step;
          for (const contact of step(this.balls)) this.onContact(contact.x, contact.y, contact.strength);
        }
        if (atRest(this.balls)) { this.accumulator = 0; this.finishShot(); }
      }
      this.draw();
    }

    private onContact(x: number, y: number, strength: number) {
      if (this.time.now - this.lastClack < 35) return;
      this.lastClack = this.time.now;
      sound.clack(strength / PHYSICS.maxShotSpeed * 1.6);
      if (strength > 250) ripple(this, x, y, 0xfff4dd, 1.6);
    }

    private finishShot() {
      const shooter = this.shooter();
      const result = resolveShot(this.match, this.before, this.balls);
      const scorer = this.match.current;
      this.match = result.match;
      this.shooterAt = insideRing(shooter) ? { x: shooter.x, y: shooter.y } : null;
      // Knocked-out marbles go to the shooter's pile.
      for (const id of result.knocked) {
        const ball = this.balls.find((b) => b.id === id && b.kind === "target")!;
        floatText(this, "+1", ball.x, ball.y - 16, scorer === 0 ? "#d7ec83" : "#ffd2b8");
        this.balls = this.balls.filter((b) => b !== ball);
      }
      if (result.knocked.length) sound.point();
      this.publish();
      if (this.match.over) return this.endMatch();
      if (result.knocked.length) {
        emit("marbles-status", { text: `${this.playerName(scorer)} knocked out ${result.knocked.length}! ${scorer === 0 && this.mode === "cpu" ? "Shoot" : "Shoots"} again.`, kind: scorer === 0 || this.mode === "friend" ? "success" : "danger" });
      } else {
        const next = this.mode === "cpu" ? (this.match.current === 0 ? "your" : "the computer's") : `${this.playerName()}'s`;
        emit("marbles-status", { text: `Nothing out. Now it's ${next} turn.`, kind: "ready" });
      }
      this.phase = "idle";
      this.time.delayedCall(900, () => this.beginTurn());
    }

    private endMatch() {
      this.phase = "over";
      const [a, b] = this.match.scores;
      const winner: Player | null = a === b ? null : a > b ? 0 : 1;
      if (winner === 0 || (this.mode === "friend" && winner !== null)) { sound.cheer(); burst(this, CENTER.x, CENTER.y); } else if (winner === 1) sound.lose(); else sound.whistle();
      const text = winner === null ? `It's a draw, ${a}–${b}.`
        : this.mode === "cpu" ? (winner === 0 ? `You win, ${a}–${b}!` : `The computer wins, ${b}–${a}.`)
          : `Player ${winner + 1} wins, ${Math.max(a, b)}–${Math.min(a, b)}!`;
      emit("marbles-status", { text, kind: winner === 0 || (this.mode === "friend" && winner !== null) ? "success" : "danger" });
      emit("marbles-state", { playing: false });
    }

    private publish() {
      const state: MarblesState = { scores: this.match.scores, current: this.match.current, over: this.match.over, mode: this.mode };
      emit("marbles-score", state);
    }

    private draw() {
      this.table.clear();
      for (const b of this.balls) {
        this.table.fillStyle(0x3b2614, 0.28).fillEllipse(b.x + 3, b.y + 4, b.r * 2.1, b.r * 1.5);
        this.table.fillStyle(b.color, 1).fillCircle(b.x, b.y, b.r);
        // A swirl and a highlight make them read as glass.
        this.table.fillStyle(0xffffff, 0.22).fillEllipse(b.x + b.r * 0.15, b.y + b.r * 0.2, b.r * 1.1, b.r * 0.45);
        this.table.fillStyle(0xffffff, 0.75).fillCircle(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.28);
        if (b.kind === "shooter") this.table.lineStyle(2, 0xffffff, 0.9).strokeCircle(b.x, b.y, b.r);
      }
      this.drawGuide();
    }

    // The pull-back band, the direction of the shot and a power meter while aiming.
    private drawGuide() {
      this.guide.clear();
      if (this.phase === "aim" && this.match.fromEdge && !this.aim) {
        // Shows that the shooter can be slid around the ring line.
        const s = this.shooter();
        this.guide.lineStyle(2, 0xfff4dd, 0.35).strokeCircle(s.x, s.y, 22);
      }
      if (!this.aim || (this.phase !== "aim" && this.phase !== "cpu")) return;
      const s = this.shooter();
      const { angle, power } = this.aim;
      const color = SHOOTER_COLORS[this.match.current];
      const back = MAX_DRAG * power;
      this.guide.lineStyle(3, 0x3b2614, 0.5).lineBetween(s.x, s.y, s.x - Math.cos(angle) * back, s.y - Math.sin(angle) * back);
      const length = 60 + power * 150;
      for (let d = s.r + 6; d < length; d += 14) {
        this.guide.fillStyle(color, 0.85 * (1 - d / length) + 0.15).fillCircle(s.x + Math.cos(angle) * d, s.y + Math.sin(angle) * d, 2.4);
      }
      this.guide.fillStyle(0x3b2614, 0.55).fillRoundedRect(s.x - 26, s.y + 20, 52, 7, 3);
      this.guide.fillStyle(power > 0.85 ? 0xff9b7a : 0xd7ec83, 1).fillRoundedRect(s.x - 26, s.y + 20, 52 * power, 7, 3);
    }
  };
}
