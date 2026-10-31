import type PhaserNamespace from "phaser";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import { circleAt, clamp, dangerTime, dodgeStep, headingTo, interceptPoint, opposite, shouldRun, stepBall, targetCircle, throwVelocity, type Ball, type Side } from "./logic";
import { BALANCE, CIRCLES, DODGE_ZONE, FIELD_H, FIELD_W, LEFT_LINE, RIGHT_LINE, START, THROW_ZONES, type Mode, type Point } from "./settings";

type Arc = PhaserNamespace.GameObjects.Arc;
type Graphics = PhaserNamespace.GameObjects.Graphics;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type BalanceInput = { x: number; y: number };
export type BalanceState = { you: number; them: number; inning: number; over: boolean; humanDodges: boolean; player: number; round: number; mode: Mode };

// Extra facts about the ball in flight that the scene needs but the pure ball model does not.
type Flight = Ball & { aimed: boolean; hit: boolean; safeCalled: boolean; seen: boolean; closest: number; called: boolean; from: Side };

const BLUE = { fill: 0x69c6ef, stroke: 0xe7f8ff };
const ORANGE = { fill: 0xf2a354, stroke: 0xffe3b1 };
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The React screen sends balance-start ({ mode }) and listens for balance-status, balance-playing and balance-state.
export function createBalanceScene(Phaser: typeof PhaserNamespace, input: { current: BalanceInput }, sound: GameSound) {
  return class BalanceField extends Phaser.Scene {
    private dodgers: Arc[] = [];
    private throwers!: Record<Side, Arc>;
    private ballArt!: Arc;
    private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
    private circleArt!: Graphics;
    private circleLabels: PhaserNamespace.GameObjects.Text[] = [];
    private layer!: Graphics;
    private mode: Mode = "classic";
    private humanDodges = true;
    private inning = 1;
    private scores = { you: 0, them: 0 };
    private active = false;
    private over = false;
    private started = false;
    // Index of the player currently dodging; the others wait on the bench or are out.
    private turn = 0;
    private ball: Flight | null = null;
    private holder: Side | null = "left";
    private pickup = 0;
    private windup = 0;
    private windupTotal = 1;
    private holdTime = 0;
    private round = 1;
    private circle: number | null = 0;
    private circleTime = 0;
    private cpuRunning = false;
    private courage = 1;
    private wander: Point = { ...START };
    private wanderTime = 0;
    private velocity: Point = { x: 0, y: 0 };
    private trail: Point[] = [];
    private stepDistance = 0;
    private pendingOut = false;
    private slowMoUntil = 0;
    private nextUp?: PhaserNamespace.Time.TimerEvent;
    private lastHint = 0;
    private wasSafe = false;

    constructor() { super("BalanceField"); }

    create() {
      const g = this.add.graphics();
      g.fillGradientStyle(0x236c4c, 0x236c4c, 0x1c5b40, 0x1c5b40, 1).fillRoundedRect(14, 14, 932, 572, 20);
      g.lineStyle(2, 0xe0e8bb, 0.75).strokeRoundedRect(32, 34, 896, 532, 12);
      g.lineStyle(2, 0xf4db88, 0.85).lineBetween(LEFT_LINE, 35, LEFT_LINE, 565).lineBetween(RIGHT_LINE, 35, RIGHT_LINE, 565);
      const label = { fontFamily: "Arial", fontSize: "12px", color: "#e5f0dc", fontStyle: "bold" };
      this.add.text(56, 49, "THROWING TEAM", label);
      this.add.text(806, 49, "THROWING TEAM", label);
      this.add.text(440, 49, "DODGE ZONE", label);
      this.circleArt = this.add.graphics().setDepth(1);
      this.layer = this.add.graphics().setDepth(2);
      for (let i = 0; i < BALANCE.players; i++) this.dodgers.push(this.add.circle(START.x, START.y, 14, BLUE.fill).setDepth(3));
      this.throwers = {
        left: this.add.circle(110, 300, 15, ORANGE.fill).setDepth(3),
        right: this.add.circle(850, 300, 15, ORANGE.fill).setDepth(3),
      };
      this.ballArt = this.add.circle(0, 0, BALANCE.ballRadius, 0xf4e5bd).setStrokeStyle(2, 0x876d45).setDepth(5);
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE") as typeof this.keys;
      this.input.on("pointerdown", (p: PhaserNamespace.Input.Pointer) => this.humanThrow({ x: p.worldX, y: p.worldY }));
      this.keys.SPACE.on("down", () => this.humanThrow(this.dodger()));
      window.addEventListener("balance-start", this.start);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("balance-start", this.start));
      this.drawCircles();
      this.positionTeams();
      this.publish();
    }

    // ---- Match flow ----

    private start = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: Mode }>).detail?.mode ?? this.mode;
      if (!this.started || this.over || mode !== this.mode) this.newMatch(mode);
      sound.whistle();
      this.active = true;
      emit("balance-playing", true);
      this.notice(this.playHint(), "ready");
    };

    private newMatch(mode: Mode) {
      this.mode = mode;
      this.started = true;
      this.over = false;
      this.inning = 1;
      this.humanDodges = true;
      this.scores = { you: 0, them: 0 };
      this.turn = 0;
      this.drawCircles();
      this.resetInning();
    }

    private resetInning() {
      this.nextUp?.remove();
      this.pendingOut = false;
      this.ball = null;
      this.holder = "left";
      this.pickup = 0;
      this.armWindup();
      this.resetRun();
      this.positionTeams();
      this.publish();
    }

    private resetRun() {
      this.round = 1;
      this.circle = 0;
      this.circleTime = 0;
      this.cpuRunning = false;
      this.courage = 0.8 + Math.random() * 0.5;
      this.trail = [];
      this.velocity = { x: 0, y: 0 };
    }

    private playHint() {
      const player = `Player ${this.turn + 1} of ${BALANCE.players}`;
      if (this.mode === "round24") {
        return this.humanDodges
          ? `${player}: run the circles 1 → 2 → 3 → 4 and round again. You are only safe inside a circle.`
          : `${player} of theirs is running the circles. Hit them when they are out in the open. Tap to throw.`;
      }
      return this.humanDodges ? `${player} is in the middle. Dodge the sock ball!` : `Your team is throwing at their ${player.toLowerCase()}. Tap to throw when you have the ball.`;
    }

    private notice(text: string, kind: Notice["kind"]) { emit("balance-status", { text, kind }); }

    private publish() {
      const state: BalanceState = { ...this.scores, inning: this.inning, over: this.over, humanDodges: this.humanDodges, player: this.turn + 1, round: this.round, mode: this.mode };
      emit("balance-state", state);
    }

    private award(points: number, at: Point, label: string) {
      if (this.humanDodges) this.scores.you += points; else this.scores.them += points;
      floatText(this, label, at.x, at.y - 26, this.humanDodges ? "#d7ec83" : "#ffb59e");
      if (this.humanDodges) sound.point();
      this.publish();
    }

    // ---- Teams ----

    private dodger() { return this.dodgers[this.turn]; }

    private positionTeams() {
      const dodge = this.humanDodges ? BLUE : ORANGE;
      const throwing = this.humanDodges ? ORANGE : BLUE;
      // The current dodger starts in the middle, players still to come wait on the bench, and players already out leave.
      this.dodgers.forEach((p, i) => {
        this.tweens.killTweensOf(p);
        p.setFillStyle(dodge.fill).setStrokeStyle(3, dodge.stroke);
        if (i < this.turn) p.setVisible(false);
        else if (i === this.turn) p.setVisible(true).setPosition(START.x, START.y).setAlpha(1).setScale(1).setStrokeStyle(5, 0xf4df79);
        else p.setVisible(true).setPosition(440 + (i - this.turn - 1) * 40, 86).setAlpha(0.5).setScale(0.75);
      });
      for (const side of ["left", "right"] as Side[]) {
        const zone = THROW_ZONES[side];
        this.throwers[side].setFillStyle(throwing.fill).setStrokeStyle(3, throwing.stroke).setPosition((zone.left + zone.right) / 2, side === "left" ? 240 : 360);
      }
    }

    private isSafe() {
      return this.mode === "round24" && this.circle !== null && this.circleTime < BALANCE.circleSeconds;
    }

    // ---- Frame loop ----

    update(_time: number, delta: number) {
      let dt = Math.min(delta / 1000, 0.04);
      if (this.pendingOut) {
        dt *= BALANCE.slowMoScale;
        if (this.time.now >= this.slowMoUntil) { this.pendingOut = false; this.playerOut(); }
      }
      this.layer.clear();
      this.drawCircleState();
      if (this.active) {
        if (!this.pendingOut) this.moveDodger(dt);
        this.moveThrowers(dt);
        this.updateBall(dt);
        if (!this.pendingOut && this.mode === "round24") this.checkCircles(dt);
      }
      this.drawBall();
      this.drawGuides();
    }

    private moveDodger(dt: number) {
      const dodger = this.dodger();
      const before = { x: dodger.x, y: dodger.y };
      if (this.humanDodges) {
        let dx = input.current.x; let dy = input.current.y;
        if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
        if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
        if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
        if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
        // Joystick input is analog (a partial push moves slower); keys and combined input are capped at full speed.
        const length = Math.hypot(dx, dy); const scale = length > 1 ? 1 / length : 1;
        if (length) this.place(dodger, dodger.x + dx * scale * BALANCE.dodgerSpeed * dt, dodger.y + dy * scale * BALANCE.dodgerSpeed * dt);
        this.stepDistance += dist(before, dodger);
        if (this.stepDistance >= 34) { this.stepDistance = 0; sound.step(); }
      } else if (this.mode === "round24") this.cpuRunCircles(dodger, dt);
      else this.cpuDodge(dodger, dt);
      if (dt > 0) {
        this.velocity = { x: (dodger.x - before.x) / dt * 0.3 + this.velocity.x * 0.7, y: (dodger.y - before.y) / dt * 0.3 + this.velocity.y * 0.7 };
      }
      if (Math.hypot(this.velocity.x, this.velocity.y) > 120) this.trail.push({ x: dodger.x, y: dodger.y }); else this.trail.shift();
      if (this.trail.length > 10) this.trail.shift();
    }

    private place(p: Arc, x: number, y: number) {
      p.setPosition(clamp(x, DODGE_ZONE.left, DODGE_ZONE.right), clamp(y, DODGE_ZONE.top, DODGE_ZONE.bottom));
    }

    private moveTowards(p: Arc, target: Point, speed: number, dt: number) {
      const d = dist(p, target);
      if (d < 1) return;
      const step = Math.min(d, speed * dt);
      return { x: p.x + (target.x - p.x) / d * step, y: p.y + (target.y - p.y) / d * step };
    }

    // Classic: the computer dodger drifts away from whoever has the ball and sidesteps throws it sees coming.
    private cpuDodge(dodger: Arc, dt: number) {
      const step = this.ball?.seen ? dodgeStep(this.ball, dodger) : null;
      if (step) { this.place(dodger, dodger.x + step.x * 170 * dt, dodger.y + step.y * 170 * dt); return; }
      this.wanderTime -= dt;
      if (this.wanderTime <= 0) {
        const threat = this.holder ?? (this.ball ? headingTo(this.ball) : "left");
        const x = threat === "left" ? 480 + Math.random() * 260 : 220 + Math.random() * 260;
        this.wander = { x, y: 90 + Math.random() * 420 };
        this.wanderTime = 0.8 + Math.random() * 0.9;
      }
      const next = this.moveTowards(dodger, this.wander, BALANCE.dodgerSpeed * 0.55, dt);
      if (next) this.place(dodger, next.x, next.y);
    }

    // Round of 24: wait safely in a circle, run for the next one when the ball is far away, and dodge on the way.
    private cpuRunCircles(dodger: Arc, dt: number) {
      const target = CIRCLES[targetCircle(this.round)];
      if (!this.cpuRunning) {
        const here = this.circle !== null ? CIRCLES[this.circle] : null;
        if (here) { const settle = this.moveTowards(dodger, here, 60, dt); if (settle) this.place(dodger, settle.x, settle.y); }
        const holderAt = this.holder ? this.throwers[this.holder] : null;
        const danger = dangerTime(target, this.ball, holderAt, { left: this.throwers.left, right: this.throwers.right }, this.windup);
        if (this.circle === null || shouldRun(dodger, target, danger, this.circleTime, this.courage)) this.cpuRunning = true;
        return;
      }
      const d = dist(dodger, target) || 1;
      let mx = (target.x - dodger.x) / d; let my = (target.y - dodger.y) / d;
      const step = this.ball?.seen ? dodgeStep(this.ball, dodger) : null;
      if (step) { mx = mx * 0.5 + step.x * 1.2; my = my * 0.5 + step.y * 1.2; }
      const length = Math.hypot(mx, my) || 1;
      this.place(dodger, dodger.x + mx / length * BALANCE.dodgerSpeed * dt, dodger.y + my / length * BALANCE.dodgerSpeed * dt);
      if (d < target.r * 0.5) this.cpuRunning = false;
    }

    private moveThrowers(dt: number) {
      const dodger = this.dodger();
      for (const side of ["left", "right"] as Side[]) {
        const t = this.throwers[side];
        const zone = THROW_ZONES[side];
        const front = side === "left" ? zone.right - 10 : zone.left + 10;
        const middle = (zone.left + zone.right) / 2;
        let goal: Point;
        let speed = BALANCE.throwerSpeed;
        const fetching = this.ball && headingTo(this.ball) === side;
        if (fetching) {
          // Run to meet the ball: track its line while it crosses, then go and pick it up.
          const ball = this.ball!;
          const crossing = side === "left" ? ball.x > LEFT_LINE : ball.x < RIGHT_LINE;
          goal = crossing ? { x: middle, y: ball.y } : { x: ball.x, y: ball.y };
          speed = BALANCE.fetchSpeed;
        } else if (this.holder === side) {
          if (!this.humanDodges) {
            // Your thrower with the ball: move it with the joystick or the keys.
            let dx = input.current.x; let dy = input.current.y;
            if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
            if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
            if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
            if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
            const length = Math.hypot(dx, dy); const scale = length > 1 ? 1 / length : 1;
            goal = { x: t.x + dx * scale * 60, y: t.y + dy * scale * 60 };
          } else {
            // Computer thrower with the ball steps up to the line and squares up to the dodger.
            goal = { x: front, y: dodger.y + this.velocity.y * 0.4 };
          }
        } else {
          // The other thrower spreads out from the dodger's line to make a second angle.
          const spread = dodger.y < 300 ? 110 : -110;
          goal = { x: middle, y: dodger.y + spread };
        }
        const next = this.moveTowards(t, goal, speed, dt);
        if (next) t.setPosition(clamp(next.x, zone.left, zone.right), clamp(next.y, zone.top, zone.bottom));
        // The ball can be picked up once it has reached this end.
        if (fetching && this.ball && !this.ball.live && (side === "left" ? this.ball.x <= LEFT_LINE : this.ball.x >= RIGHT_LINE) && dist(t, this.ball) < 24) this.catchBall(side);
      }
    }

    // ---- The ball ----

    private armWindup() {
      const [lo, hi] = BALANCE.windup;
      this.windupTotal = lo + Math.random() * (hi - lo);
      this.windup = this.windupTotal;
      this.holdTime = 0;
    }

    private catchBall(side: Side) {
      const ball = this.ball!;
      // A throw aimed at the dodger that reached the far end without a hit counts as dodged in Classic.
      if (this.mode === "classic" && ball.aimed && !ball.hit) this.award(1, this.dodger(), "DODGED +1");
      this.ball = null;
      this.holder = side;
      this.pickup = BALANCE.pickupSeconds;
      this.armWindup();
    }

    private throwBall(side: Side, at: Point, aimed: boolean) {
      const t = this.throwers[side];
      const v = throwVelocity(t, at, side);
      const seenChance = this.mode === "round24" ? 0.8 : 0.6;
      this.ball = { x: t.x, y: t.y, vx: v.x, vy: v.y, live: true, aimed, hit: false, safeCalled: false, called: false, closest: Infinity, seen: Math.random() < seenChance, from: side };
      this.holder = null;
      this.tweens.add({ targets: t, scale: 1.3, duration: 90, yoyo: true, ease: "Quad.easeOut" });
      sound.whoosh();
    }

    private humanThrow(at: Point) {
      if (!this.active || this.humanDodges || this.pendingOut) return;
      if (!this.holder || this.pickup > 0) {
        if (this.time.now - this.lastHint > 1500) { this.lastHint = this.time.now; this.notice("Wait — the ball has to reach the other end before it can be thrown again.", "ready"); }
        return;
      }
      this.throwBall(this.holder, at, true);
    }

    private cpuThrow(dt: number) {
      if (!this.holder || !this.humanDodges) return;
      this.pickup -= dt;
      if (this.pickup > 0) return;
      this.windup -= dt;
      this.holdTime += dt;
      const thrower = this.throwers[this.holder];
      const safe = this.isSafe();
      if (this.wasSafe && !safe) {
        // The dodger has just broken from a circle: give the thrower a moment to react, shown by the wind-up ring.
        const [lo, hi] = BALANCE.reaction;
        this.windupTotal = lo + Math.random() * (hi - lo);
        this.windup = Math.max(this.windup, this.windupTotal);
      }
      this.wasSafe = safe;
      if (this.windup > 0) return;
      if (safe) {
        // No point throwing at a dodger standing in a circle: hold, then pass across for a new angle.
        if (this.holdTime > BALANCE.holdBeforePass) this.throwBall(this.holder, this.throwers[opposite(this.holder)], false);
        return;
      }
      const lead = Math.random() < BALANCE.leadChance ? interceptPoint(thrower, this.dodger(), this.velocity, BALANCE.ballSpeed) : { x: this.dodger().x, y: this.dodger().y };
      const angle = Math.atan2(lead.y - thrower.y, lead.x - thrower.x) + (Math.random() * 2 - 1) * BALANCE.aimError;
      const d = dist(thrower, lead);
      this.throwBall(this.holder, { x: thrower.x + Math.cos(angle) * d, y: thrower.y + Math.sin(angle) * d }, true);
    }

    private updateBall(dt: number) {
      if (this.holder) {
        if (!this.humanDodges) this.pickup -= dt;
        this.cpuThrow(dt);
        return;
      }
      const ball = this.ball;
      if (!ball) return;
      stepBall(ball, dt);
      if (!ball.live || this.pendingOut) return;
      const dodger = this.dodger();
      const d = dist(ball, dodger);
      if (d < BALANCE.hitRadius) {
        if (this.isSafe()) {
          if (!ball.safeCalled) { ball.safeCalled = true; floatText(this, "SAFE", dodger.x, dodger.y - 26, "#fff4c6"); }
          return;
        }
        this.hit(ball, dodger);
        return;
      }
      // Call out a close dodge once the ball has passed by.
      if (d < ball.closest) ball.closest = d;
      else if (!ball.called && ball.closest < BALANCE.closeRadius && d > ball.closest + 6) {
        ball.called = true;
        floatText(this, this.humanDodges ? "CLOSE!" : "DODGED", dodger.x, dodger.y - 24, this.humanDodges ? "#d7ec83" : "#ffe5a0");
      }
    }

    private hit(ball: Flight, dodger: Arc) {
      ball.hit = true;
      ball.live = false;
      // The ball glances off and still rolls on to the far end.
      ball.vx *= 0.55; ball.vy = -ball.vy * 0.5 + (Math.random() - 0.5) * 80;
      sound.touch();
      ripple(this, dodger.x, dodger.y, 0xffd166);
      this.cameras.main.shake(260, 0.006);
      if (this.humanDodges) this.cameras.main.flash(160, 255, 140, 110); else this.cameras.main.flash(160, 120, 220, 140);
      floatText(this, "OUT!", dodger.x, dodger.y - 24, this.humanDodges ? "#ffb59e" : "#d7ec83");
      this.tweens.add({ targets: dodger, alpha: 0.35, duration: 110, yoyo: true, repeat: 2 });
      this.pendingOut = true;
      this.slowMoUntil = this.time.now + BALANCE.slowMoMs;
    }

    // ---- Round of 24 ----

    private checkCircles(dt: number) {
      const dodger = this.dodger();
      const here = circleAt(dodger);
      if (here !== this.circle) { this.circle = here; this.circleTime = 0; } else if (here !== null) {
        const before = this.circleTime;
        this.circleTime += dt;
        if (before < BALANCE.circleSeconds && this.circleTime >= BALANCE.circleSeconds) {
          floatText(this, "MOVE ON!", dodger.x, dodger.y - 26, "#ffb59e");
          if (this.humanDodges) this.notice("Your circle time is up — you are not safe here any more. Run!", "danger");
        }
      }
      if (here === targetCircle(this.round)) {
        const done = this.round;
        this.award(1, CIRCLES[here], done === BALANCE.rounds ? "24!" : String(done));
        if (done === BALANCE.rounds) { this.completeRun(); return; }
        this.round++;
        this.circleTime = 0;
        this.publish();
      }
    }

    private completeRun() {
      sound.cheer();
      burst(this, START.x, START.y);
      this.notice(this.humanDodges ? `All 24 rounds! Player ${this.turn + 1} made it home.` : "They ran all 24 rounds.", this.humanDodges ? "success" : "danger");
      this.nextDodger(false);
    }

    // ---- Outs and innings ----

    private playerOut() {
      const out = this.turn + 1;
      this.notice(this.humanDodges ? `Player ${out} is out!` : `Hit! Their player ${out} is out.`, this.humanDodges ? "danger" : "success");
      this.nextDodger(true);
    }

    private nextDodger(wasOut: boolean) {
      this.tweens.killTweensOf(this.dodger());
      this.turn++;
      if (this.turn >= BALANCE.players) { this.endInning(); return; }
      this.active = false;
      this.resetRun();
      this.positionTeams();
      this.publish();
      this.nextUp = this.time.delayedCall(1100, () => {
        this.active = true;
        this.notice(`${wasOut ? "Next up: " : ""}${this.playHint()}`, "ready");
      });
    }

    private endInning() {
      this.active = false;
      input.current = { x: 0, y: 0 };
      if (this.inning === 1) {
        this.inning = 2;
        this.humanDodges = false;
        this.turn = 0;
        this.resetInning();
        this.notice(`Inning over. Teams swap — your team throws now. Score: you ${this.scores.you}, CPU ${this.scores.them}.`, "success");
      } else {
        this.over = true;
        const { you, them } = this.scores;
        if (you > them) { sound.cheer(); burst(this, START.x, START.y); } else if (you < them) sound.lose(); else sound.whistle();
        this.notice(you > them ? `You win, ${you}–${them}!` : you < them ? `The CPU wins, ${them}–${you}.` : `It's a draw, ${you}–${them}.`, you >= them ? "success" : "danger");
        this.publish();
      }
      emit("balance-playing", false);
    }

    // ---- Drawing ----

    private drawCircles() {
      this.circleArt.clear();
      this.circleLabels.forEach((t) => t.destroy());
      this.circleLabels = [];
      if (this.mode !== "round24") return;
      CIRCLES.forEach((c, i) => {
        this.circleArt.fillStyle(0xe0e8bb, 0.1).fillCircle(c.x, c.y, c.r);
        this.circleArt.lineStyle(3, 0xf4f1d0, 0.8).strokeCircle(c.x, c.y, c.r);
        const text = i === 0 ? "START · END" : String(i);
        this.circleLabels.push(this.add.text(c.x, c.y + (i === 0 ? c.r + 10 : 0), text, { fontFamily: "Arial", fontSize: i === 0 ? "10px" : "22px", color: "#f4f1d0", fontStyle: "bold" }).setOrigin(0.5).setAlpha(i === 0 ? 0.85 : 0.35).setDepth(1));
      });
      this.circleArt.lineStyle(2, 0xf4f1d0, 0.18);
      for (let i = 1; i <= 4; i++) {
        const a = CIRCLES[i]; const b = CIRCLES[(i % 4) + 1];
        this.circleArt.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // The next circle glows, and the circle the dodger stands in shows how much safe time is left.
    private drawCircleState() {
      if (this.mode !== "round24" || !this.started) return;
      const target = CIRCLES[targetCircle(this.round)];
      const pulse = 0.55 + Math.sin(this.time.now / 180) * 0.25;
      this.layer.lineStyle(4, 0xd7ec83, pulse).strokeCircle(target.x, target.y, target.r + 4);
      if (this.circle !== null) {
        const c = CIRCLES[this.circle];
        const left = 1 - this.circleTime / BALANCE.circleSeconds;
        if (left > 0) this.layer.lineStyle(4, left < 0.3 ? 0xff9b7a : 0x8fd3f0, 0.9).beginPath().arc(c.x, c.y, c.r - 5, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).strokePath();
        else this.layer.lineStyle(3, 0xff6b5a, pulse).strokeCircle(c.x, c.y, c.r - 5);
      }
    }

    private drawBall() {
      if (this.holder) {
        const t = this.throwers[this.holder];
        const hand = this.holder === "left" ? 14 : -14;
        this.ballArt.setPosition(t.x + hand, t.y - 6).setVisible(true);
        // A shrinking ring shows a computer thrower winding up, so a quick dodger can read the throw.
        if (this.humanDodges && this.active && this.pickup <= 0 && this.windup > 0) {
          this.layer.lineStyle(3, 0xffe3b1, 0.8).beginPath().arc(t.x, t.y, 22, -Math.PI / 2, -Math.PI / 2 + (this.windup / this.windupTotal) * Math.PI * 2).strokePath();
        }
        return;
      }
      if (!this.ball) { this.ballArt.setVisible(false); return; }
      const b = this.ball;
      this.ballArt.setPosition(b.x, b.y).setVisible(true);
      this.layer.fillStyle(0x0b2a1f, 0.28).fillEllipse(b.x + 3, b.y + 7, 16, 7);
      if (b.live) this.layer.lineStyle(2, 0xf5e7bd, 0.25).lineBetween(b.x, b.y, b.x - b.vx * 0.05, b.y - b.vy * 0.05);
    }

    private drawGuides() {
      const dodger = this.dodger();
      for (let i = 1; i < this.trail.length; i++) {
        this.layer.lineStyle(dodger.radius * 1.2 * i / this.trail.length, dodger.fillColor, 0.35 * i / this.trail.length).lineBetween(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
      }
      // While your team throws, a faint guide shows where the ball will go from the thrower who has it.
      if (!this.active || this.humanDodges || !this.holder || this.pendingOut) return;
      const p = this.input.activePointer;
      if (p.worldX < 0 || p.worldX > FIELD_W || p.worldY < 0 || p.worldY > FIELD_H) return;
      const t = this.throwers[this.holder];
      const v = throwVelocity(t, { x: p.worldX, y: p.worldY }, this.holder, 1);
      const ready = this.pickup <= 0;
      this.layer.lineStyle(2, 0xf4df79, ready ? 0.4 : 0.12).lineBetween(t.x, t.y, t.x + v.x * 260, t.y + v.y * 260);
      this.layer.lineStyle(3, 0xf4df79, ready ? 0.9 : 0.3).strokeCircle(t.x, t.y, 21);
    }
  };
}
