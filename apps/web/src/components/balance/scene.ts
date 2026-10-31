import type PhaserNamespace from "phaser";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import { circleAt, clamp, dangerTime, dodgeStep, headingTo, interceptPoint, lapOf, nearestItem, opposite, pickMark, roundWinner, safeAt, scatter, shouldRun, standing, stepBall, targetCircle, throwVelocity, tuning, type Ball, type Side } from "./logic";
import { ALLMAN, BALANCE, CIRCLES, DODGE_ZONE, DROP, FIELD_H, FIELD_W, GATHER, LEFT_LINE, LEVELS, RIGHT_LINE, START, THROW_ZONES, type Level, type Mode, type Point } from "./settings";

type Arc = PhaserNamespace.GameObjects.Arc;
type Graphics = PhaserNamespace.GameObjects.Graphics;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type BalanceInput = { x: number; y: number };
// gathered/items: Gather progress. standing: All Man Yone players still in, per team.
export type BalanceState = { you: number; them: number; inning: number; over: boolean; humanDodges: boolean; player: number; round: number; mode: Mode; gathered: number; items: number; standing: { you: number; them: number } };

// Extra facts about the ball in flight that the scene needs but the pure ball model does not.
// seenBy: in All Man Yone, which players in the field saw this throw coming.
type Flight = Ball & { aimed: boolean; hit: boolean; safeCalled: boolean; seen: boolean; seenBy: boolean[]; closest: number; called: boolean; from: Side };
// All Man Yone: where each computer-run player is drifting to, and how each player is moving (for leading throws).
type Plan = { wander: Point; time: number; velocity: Point; last: Point };

const BLUE = { fill: 0x69c6ef, stroke: 0xe7f8ff };
const ORANGE = { fill: 0xf2a354, stroke: 0xffe3b1 };
const NEUTRAL = { fill: 0xd8ceb2, stroke: 0xfff6dc };
const MINE = 0xf4df79;
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The React screen sends balance-start ({ mode, level }) and listens for balance-status, balance-playing and balance-state.
export function createBalanceScene(Phaser: typeof PhaserNamespace, input: { current: BalanceInput }, sound: GameSound) {
  return class BalanceField extends Phaser.Scene {
    private dodgers: Arc[] = [];
    // All Man Yone: the computer team, in the field with yours.
    private rivals: Arc[] = [];
    private throwers!: Record<Side, Arc>;
    private ballArt!: Arc;
    private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
    private circleArt!: Graphics;
    private circleLabels: PhaserNamespace.GameObjects.Text[] = [];
    private layer!: Graphics;
    private mode: Mode = "classic";
    private level: Level = "normal";
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
    // Round of 24: the circle the dodger last reached in order, and how long since they reached it.
    private base = 0;
    private baseTime = 0;
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
    // Gather: caps still on the field, whether the dodger is carrying one, and how many are in.
    private items: Point[] = [];
    private carrying = false;
    private gathered = 0;
    // All Man Yone: who is out (your team first, then theirs), each player's plan, and who the throwers are after.
    private out: boolean[] = [];
    private plans: Plan[] = [];
    private mark = 0;

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
      for (let i = 0; i < BALANCE.players; i++) this.rivals.push(this.add.circle(START.x, START.y, 14, ORANGE.fill).setDepth(3).setVisible(false));
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
      const detail = (event as CustomEvent<{ mode: Mode; level: Level }>).detail;
      const mode = detail?.mode ?? this.mode; const level = detail?.level ?? this.level;
      if (!this.started || this.over || mode !== this.mode || level !== this.level) this.newMatch(mode, level);
      sound.whistle();
      this.active = true;
      emit("balance-playing", true);
      this.notice(this.playHint(), "ready");
    };

    private newMatch(mode: Mode, level: Level) {
      this.mode = mode;
      this.level = level;
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
      this.chooseMark();
      this.positionTeams();
      this.publish();
    }

    private resetRun() {
      this.round = 1;
      this.base = 0;
      this.baseTime = 0;
      this.cpuRunning = false;
      this.courage = 0.8 + Math.random() * 0.5;
      this.trail = [];
      this.velocity = { x: 0, y: 0 };
      // Gather: every dodger gets a fresh field of caps.
      this.items = this.mode === "gather" ? scatter(LEVELS[this.level].items) : [];
      this.carrying = false;
      this.gathered = 0;
      if (this.mode === "allman") {
        // All Man Yone: a new round puts everyone back in, and you start on your first player.
        this.turn = 0;
        this.out = this.crowd().map(() => false);
        this.plans = this.crowd().map(() => ({ wander: { ...START }, time: 0, velocity: { x: 0, y: 0 }, last: { ...START } }));
        this.mark = 0;
      }
    }

    private playHint() {
      const player = `Player ${this.turn + 1} of ${BALANCE.players}`;
      if (this.mode === "allman") return `All Man Yone, round ${this.inning}! Both teams are in the field. You play the gold-ringed player; if you are hit you take over a teammate. Last team standing wins.`;
      if (this.mode === "gather") {
        const count = LEVELS[this.level].items;
        return this.humanDodges
          ? `${player}: pick up the bottle caps one at a time and bring each one to the small circle in the middle. Get all ${count}.`
          : `${player} of theirs is gathering ${count} caps. Hit them before they bring them all in. Tap to throw.`;
      }
      if (this.mode === "round24") {
        return this.humanDodges
          ? `${player}: run the circles 1 → 2 → 3 → 4 and round again. You are only safe in the circle you last reached, until its ring runs out.`
          : `${player} of theirs is running the circles. Hit them when they are out in the open. Tap to throw.`;
      }
      return this.humanDodges ? `${player} is in the middle. Dodge the sock ball!` : `Your team is throwing at their ${player.toLowerCase()}. Tap to throw when you have the ball.`;
    }

    private notice(text: string, kind: Notice["kind"]) { emit("balance-status", { text, kind }); }

    private publish() {
      const state: BalanceState = {
        ...this.scores, inning: this.inning, over: this.over, humanDodges: this.humanDodges, player: this.turn + 1, round: this.round, mode: this.mode,
        gathered: this.gathered, items: LEVELS[this.level].items, standing: this.mode === "allman" ? standing(this.out) : { you: 0, them: 0 },
      };
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

    // All Man Yone: everyone in the field, your team first.
    private crowd() { return [...this.dodgers, ...this.rivals]; }

    // Who the computer throwers are after: the dodger, or in All Man Yone the player they have picked.
    private focus() { return this.mode === "allman" ? this.crowd()[this.mark] : this.dodger(); }
    private focusVelocity() { return this.mode === "allman" ? this.plans[this.mark].velocity : this.velocity; }

    private positionTeams() {
      this.rivals.forEach((p) => p.setVisible(false));
      if (this.mode === "allman") { this.positionCrowd(); return; }
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

    // All Man Yone: both teams stand in a ring in the middle, the two teams taking turns around it, and the
    // throwers at the ends are neutral.
    private positionCrowd() {
      this.crowd().forEach((p, i) => {
        this.tweens.killTweensOf(p);
        const mine = i < BALANCE.players;
        const slot = mine ? i * 2 : (i - BALANCE.players) * 2 + 1;
        const angle = (slot / (BALANCE.players * 2)) * Math.PI * 2 - Math.PI / 2;
        const colors = mine ? BLUE : ORANGE;
        p.setFillStyle(colors.fill).setStrokeStyle(3, colors.stroke).setVisible(true).setAlpha(1).setScale(1)
          .setPosition(START.x + Math.cos(angle) * 120, START.y + Math.sin(angle) * 120);
        this.plans[i].last = { x: p.x, y: p.y };
      });
      this.highlightMine();
      for (const side of ["left", "right"] as Side[]) {
        const zone = THROW_ZONES[side];
        this.throwers[side].setFillStyle(NEUTRAL.fill).setStrokeStyle(3, NEUTRAL.stroke).setPosition((zone.left + zone.right) / 2, side === "left" ? 240 : 360);
      }
    }

    private highlightMine() {
      this.dodgers.forEach((p, i) => { if (!this.out[i]) p.setStrokeStyle(i === this.turn ? 5 : 3, i === this.turn ? MINE : BLUE.stroke); });
    }

    // How the computer team plays right now: its level, sharpened lap by lap in Round of 24.
    private tune() { return tuning(this.level, this.mode, this.round); }

    // Your own team always throws at the normal pace; the level sets the computer team.
    private throwSpeed() { return this.humanDodges ? this.tune().ballSpeed : BALANCE.ballSpeed; }

    private inBase() { return circleAt(this.dodger()) === this.base; }

    private isSafe() {
      return this.mode === "round24" && safeAt(this.dodger(), this.base, this.baseTime, this.tune().circleSeconds);
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
      this.drawItems();
      if (this.active) {
        if (!this.pendingOut) this.moveDodger(dt);
        if (this.mode === "allman") this.moveCrowd(dt);
        this.moveThrowers(dt);
        this.updateBall(dt);
        if (!this.pendingOut && this.mode === "round24") this.checkCircles(dt);
        if (!this.pendingOut && this.mode === "gather") this.checkItems();
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
        const speed = BALANCE.dodgerSpeed * (this.carrying ? GATHER.carrySpeed : 1);
        if (length) this.place(dodger, dodger.x + dx * scale * speed * dt, dodger.y + dy * scale * speed * dt);
        this.stepDistance += dist(before, dodger);
        if (this.stepDistance >= 34) { this.stepDistance = 0; sound.step(); }
      } else if (this.mode === "round24") this.cpuRunCircles(dodger, dt);
      else if (this.mode === "gather") this.cpuGather(dodger, dt);
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
      if (step) { const speed = LEVELS[this.level].dodgerSpeed * 0.8; this.place(dodger, dodger.x + step.x * speed * dt, dodger.y + step.y * speed * dt); return; }
      this.wanderTime -= dt;
      if (this.wanderTime <= 0) {
        const threat = this.holder ?? (this.ball ? headingTo(this.ball) : "left");
        const x = threat === "left" ? 480 + Math.random() * 260 : 220 + Math.random() * 260;
        this.wander = { x, y: 90 + Math.random() * 420 };
        this.wanderTime = 0.8 + Math.random() * 0.9;
      }
      const next = this.moveTowards(dodger, this.wander, LEVELS[this.level].dodgerSpeed * 0.55, dt);
      if (next) this.place(dodger, next.x, next.y);
    }

    // Round of 24: wait safely in the base circle, run for the next one when the ball is far away, and dodge on the way.
    private cpuRunCircles(dodger: Arc, dt: number) {
      const target = CIRCLES[targetCircle(this.round)];
      const speed = LEVELS[this.level].dodgerSpeed;
      if (!this.cpuRunning) {
        const inBase = this.inBase();
        if (inBase) { const settle = this.moveTowards(dodger, CIRCLES[this.base], 60, dt); if (settle) this.place(dodger, settle.x, settle.y); }
        // Your team can throw as soon as the ball is picked up, so the runner allows only a short reaction.
        const holderAt = this.holder ? this.throwers[this.holder] : null;
        const danger = dangerTime(target, this.ball, holderAt, { left: this.throwers.left, right: this.throwers.right }, Math.max(0, this.pickup) + 0.25, BALANCE.ballSpeed, 0.25);
        if (!inBase || shouldRun(dodger, target, danger, this.baseTime, this.courage, this.tune().circleSeconds, speed)) this.cpuRunning = true;
        return;
      }
      const d = dist(dodger, target) || 1;
      let mx = (target.x - dodger.x) / d; let my = (target.y - dodger.y) / d;
      const step = this.ball?.seen ? dodgeStep(this.ball, dodger) : null;
      if (step) { mx = mx * 0.5 + step.x * 1.2; my = my * 0.5 + step.y * 1.2; }
      const length = Math.hypot(mx, my) || 1;
      this.place(dodger, dodger.x + mx / length * speed * dt, dodger.y + my / length * speed * dt);
    }

    // Gather: go for the handiest cap, carry it to the middle circle, and sidestep throws seen coming on the way.
    private cpuGather(dodger: Arc, dt: number) {
      const index = this.carrying ? -1 : nearestItem(dodger, this.items);
      const goal = this.carrying || index < 0 ? DROP : this.items[index];
      const speed = LEVELS[this.level].dodgerSpeed * (this.carrying ? GATHER.carrySpeed : 1);
      const d = dist(dodger, goal) || 1;
      let mx = (goal.x - dodger.x) / d; let my = (goal.y - dodger.y) / d;
      const step = this.ball?.seen ? dodgeStep(this.ball, dodger) : null;
      if (step) { mx = mx * 0.5 + step.x * 1.2; my = my * 0.5 + step.y * 1.2; }
      const length = Math.hypot(mx, my) || 1;
      this.place(dodger, dodger.x + mx / length * speed * dt, dodger.y + my / length * speed * dt);
    }

    // All Man Yone: every player you are not steering keeps away from the thrower with the ball, sidesteps throws
    // they see coming, and does not bunch up with the others. Your teammates play at Normal; their team at the level.
    private moveCrowd(dt: number) {
      const crowd = this.crowd();
      crowd.forEach((p, i) => {
        const plan = this.plans[i];
        if (!this.out[i] && i !== this.turn) {
          const speed = (i < BALANCE.players ? LEVELS.normal : LEVELS[this.level]).dodgerSpeed;
          const step = this.ball?.seenBy[i] ? dodgeStep(this.ball, p) : null;
          if (step) this.place(p, p.x + step.x * speed * 0.8 * dt, p.y + step.y * speed * 0.8 * dt);
          else {
            plan.time -= dt;
            if (plan.time <= 0) {
              const threat = this.holder ?? (this.ball ? headingTo(this.ball) : "left");
              const x = threat === "left" ? 480 + Math.random() * 260 : 220 + Math.random() * 260;
              plan.wander = { x, y: 90 + Math.random() * 420 };
              plan.time = 0.7 + Math.random() * 0.9;
            }
            let next = this.moveTowards(p, plan.wander, speed * 0.55, dt) ?? { x: p.x, y: p.y };
            // Keep a little room from the nearest player still in.
            crowd.forEach((q, j) => {
              if (j === i || this.out[j]) return;
              const gap = dist(next, q);
              if (gap > 0 && gap < 44) next = { x: next.x + (next.x - q.x) / gap * 40 * dt, y: next.y + (next.y - q.y) / gap * 40 * dt };
            });
            this.place(p, next.x, next.y);
          }
        }
        if (dt > 0) plan.velocity = { x: (p.x - plan.last.x) / dt * 0.3 + plan.velocity.x * 0.7, y: (p.y - plan.last.y) / dt * 0.3 + plan.velocity.y * 0.7 };
        plan.last = { x: p.x, y: p.y };
      });
    }

    private moveThrowers(dt: number) {
      const dodger = this.focus();
      for (const side of ["left", "right"] as Side[]) {
        const t = this.throwers[side];
        const zone = THROW_ZONES[side];
        const front = side === "left" ? zone.right - 10 : zone.left + 10;
        const middle = (zone.left + zone.right) / 2;
        let goal: Point;
        let speed = this.humanDodges ? this.tune().throwerSpeed : BALANCE.throwerSpeed;
        const fetching = this.ball && headingTo(this.ball) === side;
        if (fetching) {
          // Run to meet the ball: track its line while it crosses, then go and pick it up.
          const ball = this.ball!;
          const crossing = side === "left" ? ball.x > LEFT_LINE : ball.x < RIGHT_LINE;
          goal = crossing ? { x: middle, y: ball.y } : { x: ball.x, y: ball.y };
          speed *= BALANCE.fetchBoost;
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
            goal = { x: front, y: dodger.y + this.focusVelocity().y * 0.4 };
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
      const [lo, hi] = this.tune().windup;
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
      this.chooseMark();
    }

    // All Man Yone: the thrower with the ball picks who to go after.
    private chooseMark() {
      if (this.mode !== "allman" || !this.holder) return;
      const pick = pickMark(this.throwers[this.holder], this.crowd(), this.out);
      if (pick >= 0) this.mark = pick;
    }

    private throwBall(side: Side, at: Point, aimed: boolean) {
      const t = this.throwers[side];
      const v = throwVelocity(t, at, side, this.throwSpeed());
      const seenChance = Math.min(0.95, LEVELS[this.level].seen + (this.mode === "round24" ? 0.2 : this.mode === "gather" ? 0.1 : 0));
      // All Man Yone: each player has their own chance to see it coming; your teammates see as well as at Normal.
      const seenBy = this.mode === "allman" ? this.crowd().map((_, i) => Math.random() < (i < BALANCE.players ? LEVELS.normal : LEVELS[this.level]).seen) : [];
      this.ball = { x: t.x, y: t.y, vx: v.x, vy: v.y, live: true, aimed, hit: false, safeCalled: false, called: false, closest: Infinity, seen: Math.random() < seenChance, seenBy, from: side };
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
      const tune = this.tune();
      const safe = this.isSafe();
      if (this.wasSafe && !safe) {
        // The dodger has just broken from a circle: give the thrower a moment to react, shown by the wind-up ring.
        const [lo, hi] = tune.reaction;
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
      if (this.mode === "allman" && this.out[this.mark]) this.chooseMark();
      const target = this.focus();
      const lead = Math.random() < tune.leadChance ? interceptPoint(thrower, target, this.focusVelocity(), tune.ballSpeed) : { x: target.x, y: target.y };
      const angle = Math.atan2(lead.y - thrower.y, lead.x - thrower.x) + (Math.random() * 2 - 1) * tune.aimError;
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
      if (this.mode === "allman") {
        const struck = this.crowd().findIndex((p, i) => !this.out[i] && dist(ball, p) < BALANCE.hitRadius);
        if (struck >= 0) { this.crowdHit(ball, struck); return; }
      }
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

    // The ball glances off whoever it hit and still rolls on to the far end.
    private glance(ball: Flight) {
      ball.hit = true;
      ball.live = false;
      ball.vx *= 0.55; ball.vy = -ball.vy * 0.5 + (Math.random() - 0.5) * 80;
    }

    private hit(ball: Flight, dodger: Arc) {
      this.glance(ball);
      // Gather: a cap being carried is lost with the player.
      this.carrying = false;
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
      const limit = this.tune().circleSeconds;
      const before = this.baseTime;
      this.baseTime += dt;
      if (before < limit && this.baseTime >= limit && this.inBase()) {
        floatText(this, "MOVE ON!", dodger.x, dodger.y - 26, "#ffb59e");
        if (this.humanDodges) this.notice("Your circle time is up — you are not safe here any more. Run!", "danger");
      }
      const target = targetCircle(this.round);
      if (circleAt(dodger) !== target) return;
      const done = this.round;
      this.base = target;
      this.baseTime = 0;
      this.cpuRunning = false;
      if (done === BALANCE.rounds) { this.award(1 + BALANCE.homeBonus, CIRCLES[target], `HOME +${1 + BALANCE.homeBonus}`); this.completeRun(); return; }
      const lapDone = done % 4 === 0;
      this.award(1, CIRCLES[target], lapDone ? `LAP ${lapOf(done)}!` : String(done));
      this.round++;
      if (this.round === BALANCE.rounds) {
        sound.whistle();
        this.notice(this.humanDodges ? "Round 24 — the home stretch! Run back to the middle." : "Their runner is on the home stretch. Stop them!", this.humanDodges ? "success" : "danger");
      } else if (lapDone && this.humanDodges) {
        this.notice(`Lap ${lapOf(done)} of 6 done. The throwers are sharper now, and a circle keeps you safe for ${Math.round(this.tune().circleSeconds * 10) / 10}s.`, "success");
      }
      this.publish();
    }

    private completeRun() {
      sound.cheer();
      burst(this, START.x, START.y);
      const gather = this.mode === "gather";
      const mine = gather ? `All ${this.gathered} caps in! Player ${this.turn + 1} cleared the field.` : `All 24 rounds! Player ${this.turn + 1} made it home.`;
      this.notice(this.humanDodges ? mine : gather ? "They brought in every cap." : "They ran all 24 rounds.", this.humanDodges ? "success" : "danger");
      this.nextDodger(false);
    }

    // ---- Gather ----

    // Picks up a cap the dodger runs over (one at a time) and banks a carried cap in the middle circle.
    private checkItems() {
      const dodger = this.dodger();
      if (!this.carrying) {
        const index = this.items.findIndex((item) => dist(item, dodger) < GATHER.pickupRadius);
        if (index < 0) return;
        this.items.splice(index, 1);
        this.carrying = true;
        sound.step();
        return;
      }
      if (dist(dodger, DROP) > DROP.r) return;
      this.carrying = false;
      this.gathered++;
      const total = LEVELS[this.level].items;
      if (this.gathered < total) { this.award(1, DROP, `${this.gathered}/${total}`); return; }
      this.award(1 + GATHER.clearBonus, DROP, `ALL IN +${1 + GATHER.clearBonus}`);
      this.completeRun();
    }

    // ---- All Man Yone ----

    private crowdHit(ball: Flight, index: number) {
      this.glance(ball);
      const p = this.crowd()[index];
      const mine = index < BALANCE.players;
      this.out[index] = true;
      sound.touch();
      ripple(this, p.x, p.y, 0xffd166);
      floatText(this, "OUT!", p.x, p.y - 24, mine ? "#ffb59e" : "#d7ec83");
      this.tweens.add({ targets: p, alpha: 0.2, scale: 0.7, duration: 320, ease: "Quad.easeOut" });
      if (index === this.turn) { this.cameras.main.shake(220, 0.005); this.cameras.main.flash(140, 255, 140, 110); }
      const winner = roundWinner(this.out);
      if (winner) { this.endRound(winner); return; }
      const left = standing(this.out);
      if (index === this.turn) {
        // You were hit: take over the next teammate still in.
        this.turn = this.out.findIndex((o, i) => !o && i < BALANCE.players);
        this.trail = [];
        this.velocity = { x: 0, y: 0 };
        this.highlightMine();
        this.notice(left.you === 1 ? "You are hit! You take over your last player — last man standing!" : "You are hit! You take over a teammate.", "danger");
      } else if (left.you === 1 && mine) this.notice("Your team is down to one. Last man standing — it is all on you!", "danger");
      else if (left.them === 1 && !mine) this.notice("Their team is down to their last man. Keep dodging!", "success");
      else this.notice(mine ? `A teammate is out. Your team ${left.you}, theirs ${left.them}.` : `One of theirs is out! Your team ${left.you}, theirs ${left.them}.`, mine ? "danger" : "success");
      this.publish();
    }

    // The round goes to the team still standing; the match to the first team to win enough rounds.
    private endRound(winner: "you" | "them") {
      this.active = false;
      input.current = { x: 0, y: 0 };
      this.scores[winner]++;
      const { you, them } = this.scores;
      if (this.scores[winner] >= ALLMAN.winsNeeded) {
        this.over = true;
        if (winner === "you") { sound.cheer(); burst(this, START.x, START.y); } else sound.lose();
        this.notice(winner === "you" ? `Your team is the last standing — you win the match, ${you}–${them}!` : `Their team is the last standing. They win the match, ${them}–${you}.`, winner === "you" ? "success" : "danger");
        this.publish();
        emit("balance-playing", false);
        return;
      }
      if (winner === "you") sound.cheer(); else sound.whistle();
      this.notice(winner === "you" ? `Your team wins round ${this.inning}! Rounds: you ${you}, them ${them}.` : `Their team wins round ${this.inning}. Rounds: you ${you}, them ${them}.`, winner === "you" ? "success" : "danger");
      this.publish();
      this.nextUp = this.time.delayedCall(1800, () => {
        this.inning++;
        this.resetInning();
        this.active = true;
        this.notice(this.playHint(), "ready");
      });
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
      if (this.mode === "gather") {
        this.circleArt.fillStyle(0xe0e8bb, 0.14).fillCircle(DROP.x, DROP.y, DROP.r);
        this.circleArt.lineStyle(3, 0xf4f1d0, 0.85).strokeCircle(DROP.x, DROP.y, DROP.r);
        this.circleLabels.push(this.add.text(DROP.x, DROP.y + DROP.r + 10, "BRING CAPS HERE", { fontFamily: "Arial", fontSize: "10px", color: "#f4f1d0", fontStyle: "bold" }).setOrigin(0.5).setAlpha(0.8).setDepth(1));
        return;
      }
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

    // The next circle glows (gold for the home stretch), and the base circle shows how much safe time is left.
    private drawCircleState() {
      if (this.mode !== "round24" || !this.started) return;
      const targetIndex = targetCircle(this.round);
      const target = CIRCLES[targetIndex];
      const pulse = 0.55 + Math.sin(this.time.now / 180) * 0.25;
      const home = this.round === BALANCE.rounds;
      this.layer.lineStyle(home ? 6 : 4, home ? 0xf4df79 : 0xd7ec83, pulse).strokeCircle(target.x, target.y, target.r + 4);
      this.circleLabels.forEach((label, i) => label.setAlpha(i === targetIndex ? 0.95 : i === 0 ? 0.6 : 0.3));
      if (this.inBase()) {
        const c = CIRCLES[this.base];
        const left = 1 - this.baseTime / this.tune().circleSeconds;
        if (left > 0) this.layer.lineStyle(4, left < 0.3 ? 0xff9b7a : 0x8fd3f0, 0.9).beginPath().arc(c.x, c.y, c.r - 5, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).strokePath();
        else this.layer.lineStyle(3, 0xff6b5a, pulse).strokeCircle(c.x, c.y, c.r - 5);
      }
    }

    // Gather: the caps on the field, the one being carried, and the middle circle lit up while it is wanted.
    private drawItems() {
      if (this.mode !== "gather" || !this.started) return;
      const cap = (x: number, y: number, size: number) => {
        this.layer.fillStyle(0x0b2a1f, 0.25).fillEllipse(x + 2, y + 4, size * 2.2, size);
        this.layer.fillStyle(0xe9c25a, 1).fillCircle(x, y, size);
        this.layer.lineStyle(2, 0x8a6a22, 1).strokeCircle(x, y, size);
        this.layer.fillStyle(0xfff1b8, 0.8).fillCircle(x - size * 0.3, y - size * 0.3, size * 0.3);
      };
      this.items.forEach((item) => cap(item.x, item.y, 6));
      if (!this.carrying) return;
      const d = this.dodger();
      cap(d.x + 11, d.y - 13, 5);
      const pulse = 0.55 + Math.sin(this.time.now / 180) * 0.25;
      this.layer.lineStyle(4, 0xd7ec83, pulse).strokeCircle(DROP.x, DROP.y, DROP.r + 4);
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
