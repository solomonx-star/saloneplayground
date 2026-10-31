import type PhaserNamespace from "phaser";
import { chooseOpenLane, moveComputerAttackers } from "./attackers";
import { chooseComputerTarget, goalOf, moveComputerDefenders, nextTrapLine, projectedX, threatScore, type DefenderIntent } from "./defenders";
import { clamp, FIELD_H, FIELD_W, HOME_LINE, LINES, MID, START_Y, TOUCH_RADIUS, TURN_LINE, linesCrossed, type Point } from "./field";
import { LEVELS, TOUCH, type Level } from "./settings";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import type { World } from "./world";

type Arc = PhaserNamespace.GameObjects.Arc;
type Text = PhaserNamespace.GameObjects.Text;
type Graphics = PhaserNamespace.GameObjects.Graphics;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type MatchState = { you: number; them: number; turn: number; totalTurns: number; over: boolean };
export type TouchInput = { x: number; y: number; sprint: boolean };

const TOTAL_TURNS = TOUCH.turnsPerTeam * 2;
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The React screen talks to the scene through window events: it sends touch-start, touch-count, touch-level,
// touch-new-match, touch-switch and touch-move, and listens for touch-status, touch-state and touch-match.
export function createTouchScene(Phaser: typeof PhaserNamespace, input: { current: TouchInput }, sound: GameSound) {
  return class TouchField extends Phaser.Scene {
    private runner!: Arc;
    private runnerLabel!: Text;
    private teammates: Arc[] = [];
    private selectedPlayer: Arc | null = null;
    private defenders: Arc[] = [];
    private mainDefender!: Arc;
    private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
    private active = false;
    private humanAttacks = true;
    private count = 4;
    private trailGraphics!: Graphics;
    private orderGraphics!: Graphics;
    private playerGraphics!: Graphics;
    private aiMarker!: Text;
    private intentLabels = new Map<Arc, Text>();
    private aiTarget: Arc | null = null;
    private lastAnnouncedTarget: Arc | null = null;
    private aiOrderSignature = "";
    private level: Level = "normal";
    private scoreYou = 0;
    private scoreThem = 0;
    private turn = 1;
    private over = false;
    private stamina = 1;
    private sprinting = false;
    private stepDistance = 0;
    // After a touch the play runs on in slow motion until slowMoUntil, then pendingEnd changes the sides.
    private slowMoUntil = 0;
    private pendingEnd: (() => void) | null = null;

    constructor() { super("TouchField"); }

    create() {
      const w = FIELD_W;
      const h = FIELD_H;
      const g = this.add.graphics();
      g.fillGradientStyle(0x226b4d, 0x226b4d, 0x1d6045, 0x1d6045, 1);
      g.fillRoundedRect(12, 12, w - 24, h - 24, 20);
      g.lineStyle(2, 0x9bc5a1, 0.75).strokeRoundedRect(28, 28, w - 56, h - 56, 12);
      g.lineStyle(2, 0xd1e3cb, 0.48);
      LINES.forEach((y, i) => {
        g.lineBetween(32, y, w - 32, y);
        this.add.text(40, y - 22, `LINE ${i + 1}`, { fontFamily: "Arial", fontSize: "10px", color: "#d9ead6", fontStyle: "bold" }).setAlpha(0.8);
      });
      g.lineStyle(3, 0xf0d77a, 0.85).lineBetween(32, HOME_LINE, w - 32, HOME_LINE);
      g.lineStyle(3, 0xf0d77a, 0.85).lineBetween(32, TURN_LINE, w - 32, TURN_LINE);
      g.lineStyle(2, 0xf6dda0, 0.8).lineBetween(MID, 46, MID, 524);
      this.add.text(42, HOME_LINE + 9, "START · HOME", { fontFamily: "Arial", fontSize: "11px", color: "#fff4c6", fontStyle: "bold" });
      this.add.text(42, 52, "LAST LINE · TURN BACK", { fontFamily: "Arial", fontSize: "11px", color: "#fff4c6", fontStyle: "bold" });
      this.add.text(MID + 8, 270, "MAIN LINE", { fontFamily: "Arial", fontSize: "10px", color: "#ffe8ad", fontStyle: "bold" }).setAngle(-90).setAlpha(0.9);
      this.trailGraphics = this.add.graphics().setDepth(2);
      this.orderGraphics = this.add.graphics().setDepth(4);
      this.playerGraphics = this.add.graphics().setDepth(6);
      this.aiMarker = this.add.text(0, 0, "MARKED", { fontFamily: "Arial", fontSize: "9px", color: "#ffe5a0", backgroundColor: "#593a20", padding: { x: 4, y: 2 }, fontStyle: "bold" }).setDepth(7).setVisible(false);

      // Four line defenders and one Main Line defender.
      LINES.forEach((y, i) => {
        const defender = this.add.circle(i % 2 ? FIELD_W - 130 : 130, y, 13, 0xf2a354).setStrokeStyle(3, 0xffe3b1).setDepth(3);
        defender.setData("lineY", y);
        defender.setData("name", `Line ${i + 1} defender`);
        this.defenders.push(defender);
      });
      this.mainDefender = this.add.circle(MID, 300, 14, 0xe57859).setStrokeStyle(3, 0xffd2c4).setDepth(3);
      this.mainDefender.setData("main", true);
      this.mainDefender.setData("name", "Main Line defender");
      this.defenders.push(this.mainDefender);
      this.add.text(MID + 18, 284, "MAIN", { fontFamily: "Arial", fontSize: "9px", color: "#fff0e9", fontStyle: "bold" });
      for (const defender of this.defenders) {
        this.intentLabels.set(defender, this.add.text(0, 0, "", { fontFamily: "Arial", fontSize: "9px", color: "#2b0d08", fontStyle: "bold", padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(9).setVisible(false));
      }

      this.runner = this.add.circle(MID - 120, START_Y, 14, 0x69c6ef).setStrokeStyle(3, 0xe7f8ff).setDepth(5);
      this.runner.setData("name", "Player 1");
      this.runnerLabel = this.add.text(this.runner.x, this.runner.y + 16, "1", { fontFamily: "Arial", fontSize: "9px", color: "#e7f8ff", fontStyle: "bold" }).setDepth(5);
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT") as typeof this.keys;
      this.input.keyboard!.on("keydown-SPACE", this.switchPlayer);
      this.input.on("pointerdown", (pointer: PhaserNamespace.Input.Pointer) => this.selectPlayerAt(pointer.worldX, pointer.worldY));
      const listeners: [string, EventListener][] = [
        ["touch-start", this.start], ["touch-count", this.setCount], ["touch-move", this.moveBy],
        ["touch-level", this.setLevel], ["touch-new-match", this.newMatch], ["touch-switch", this.switchPlayer],
      ];
      for (const [name, listener] of listeners) window.addEventListener(name, listener);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        for (const [name, listener] of listeners) window.removeEventListener(name, listener);
      });
      this.newMatch();
    }

    private world(): World {
      return {
        attackers: this.attackers(),
        defenders: this.defenders,
        mainDefender: this.mainDefender,
        humanAttacks: this.humanAttacks,
        selected: this.selectedPlayer,
        aiTarget: this.aiTarget,
        // The level sets the opposing team; the player's own computer teammates always play at normal.
        attack: this.humanAttacks ? LEVELS.normal : LEVELS[this.level],
        defense: this.humanAttacks ? LEVELS[this.level] : LEVELS.normal,
        now: this.time.now,
        random: Math.random,
      };
    }

    private attackers() { return [this.runner, ...this.teammates]; }

    private start = () => {
      if (this.over) return;
      this.reset();
      this.active = true;
      sound.whistle();
      emit("touch-state", { playing: true });
    };
    private setCount = (event: Event) => { this.count = (event as CustomEvent<number>).detail; this.newMatch(); };
    private setLevel = (event: Event) => { this.level = (event as CustomEvent<Level>).detail; this.newMatch(); };
    private newMatch = () => {
      this.scoreYou = 0; this.scoreThem = 0; this.turn = 1; this.over = false; this.humanAttacks = true;
      this.reset();
      this.publishMatch();
    };
    private publishMatch() {
      emit("touch-match", { you: this.scoreYou, them: this.scoreThem, turn: this.turn, totalTurns: TOTAL_TURNS, over: this.over });
    }
    private moveBy = (event: Event) => {
      const { x, y } = (event as CustomEvent<Point>).detail;
      input.current = { ...input.current, x, y };
    };

    private selectPlayerAt(x: number, y: number) {
      if (!this.active) return;
      const own = this.humanAttacks ? this.attackers() : this.defenders;
      this.control(own.find((player) => Phaser.Math.Distance.Between(x, y, player.x, player.y) < 25));
    }
    // Space (or the SWITCH button) hands control to the next player on your team.
    private switchPlayer = () => {
      if (!this.active) return;
      const own = this.humanAttacks ? this.attackers() : this.defenders;
      const index = this.selectedPlayer ? own.indexOf(this.selectedPlayer) : -1;
      this.control(own[(index + 1) % own.length]);
    };
    private control(player: Arc | undefined) {
      if (!player || player === this.selectedPlayer) return;
      this.selectedPlayer?.setStrokeStyle(2, 0xe7f8ff);
      if (this.humanAttacks) this.selectedPlayer?.setData("mode", null);
      this.selectedPlayer = player;
      if (this.humanAttacks) player.setData("goal", null);
      player.setStrokeStyle(5, 0xf7e486);
    }

    private reset = () => {
      this.active = false;
      this.pendingEnd = null;
      this.stamina = 1; this.sprinting = false; this.stepDistance = 0;
      input.current = { x: 0, y: 0, sprint: false };
      this.teammates.forEach((player) => {
        (player.getData("tag") as Text | undefined)?.destroy();
        player.destroy();
      });
      this.teammates = [];
      this.selectedPlayer = null;
      this.aiOrderSignature = "";
      this.aiTarget = null;
      this.lastAnnouncedTarget = null;
      this.runner.setPosition(MID - (this.count - 1) / 2 * 38, START_Y);
      for (const key of ["goal", "mode", "think", "targetX", "holdTime", "courage", "crossLine", "lastPos", "trail", "heading"]) this.runner.setData(key, null);
      this.runner.setData("direction", 1);
      this.defenders.forEach((defender, i) => {
        const friendly = !this.humanAttacks;
        defender.setFillStyle(friendly ? 0x69b8d8 : 0xf2a354);
        defender.setStrokeStyle(3, friendly ? 0xe7f8ff : 0xffe3b1);
        for (const key of ["goal", "guardX", "guardY", "baitUntil", "intent", "lastPos", "trail", "heading"]) defender.setData(key, null);
        const lineY = defender.getData("lineY") as number | undefined;
        const homeX = lineY === undefined ? MID : i % 2 ? FIELD_W - 130 : 130;
        defender.setPosition(homeX, lineY ?? 300);
        defender.setData("homeX", homeX);
      });
      this.runner.setFillStyle(this.humanAttacks ? 0x69c6ef : 0xe57859);
      this.runnerLabel.setPosition(this.runner.x - 3, this.runner.y + 16);
      this.mainDefender.setFillStyle(this.humanAttacks ? 0xf2a354 : 0x69b8d8);
      const text = this.humanAttacks
        ? `Turn ${this.turn} of ${TOTAL_TURNS}: your team attacks. Each line crossed scores ${TOUCH.linePoints}, getting home scores ${TOUCH.homePoints}.`
        : `Turn ${this.turn} of ${TOTAL_TURNS}: your team defends. You control the Main Line defender; press Space or tap to switch.`;
      emit("touch-status", { text, kind: "ready" });
      emit("touch-state", { playing: false });
      for (let i = 1; i < this.count; i++) {
        const teammate = this.add.circle(MID + (i - (this.count - 1) / 2) * 38, START_Y, 12, this.humanAttacks ? 0x91d7f3 : 0xe57859).setStrokeStyle(2, 0xffe3b1).setDepth(5);
        teammate.setData("name", `Player ${i + 1}`);
        teammate.setData("direction", 1);
        teammate.setData("goal", { x: chooseOpenLane(this.world()), y: TURN_LINE });
        teammate.setData("tag", this.add.text(teammate.x - 3, teammate.y + 15, String(i + 1), { fontFamily: "Arial", fontSize: "9px", color: "#e7f8ff", fontStyle: "bold" }).setDepth(6));
        this.teammates.push(teammate);
      }
      this.runner.setData("goal", this.humanAttacks ? null : { x: chooseOpenLane(this.world()), y: TURN_LINE });
      for (const attacker of this.attackers()) { attacker.setData("prevY", attacker.y); attacker.setData("crossed", new Set<string>()); }
      this.selectedPlayer = this.humanAttacks ? this.runner : this.mainDefender;
      this.selectedPlayer.setStrokeStyle(5, 0xf7e486);
    };

    private end = (text: string, kind: "danger" | "success") => {
      this.active = false;
      emit("touch-status", { text, kind });
      emit("touch-state", { playing: false });
    };

    update(_time: number, delta: number) {
      let dt = Math.min(delta / 1000, 0.04);
      const slowMo = this.pendingEnd !== null;
      if (slowMo) {
        dt *= TOUCH.slowMoScale;
        if (this.time.now >= this.slowMoUntil) {
          const finish = this.pendingEnd!;
          this.pendingEnd = null;
          finish();
        }
      }
      this.drawOrders();
      this.drawPlayers(dt);
      if (!this.active) return;
      let dx = 0; let dy = 0;
      if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
      if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
      if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
      dx += input.current.x; dy += input.current.y;
      this.updateSprint(dt, Math.hypot(dx, dy) > 0.1 && !slowMo);
      const humanStep = TOUCH.humanSpeed * (this.sprinting ? TOUCH.sprintMultiplier : 1) * dt;
      const world = this.world();
      const controlled = this.selectedPlayer;
      const before = controlled ? { x: controlled.x, y: controlled.y } : null;
      if (this.humanAttacks) {
        moveComputerDefenders(world, dt);
        moveComputerAttackers(world, dt, controlled ?? undefined);
      } else {
        moveComputerDefenders(world, dt, controlled ?? undefined);
        moveComputerAttackers(world, dt);
      }
      if (controlled && before) {
        this.moveControlled(controlled, humanStep, dx, dy);
        this.footsteps(Phaser.Math.Distance.Between(before.x, before.y, controlled.x, controlled.y));
      }
      this.runnerLabel.setPosition(this.runner.x - 3, this.runner.y + 16);
      this.teammates.forEach((player) => (player.getData("tag") as Text).setPosition(player.x - 3, player.y + 15));
      if (!slowMo) this.checkAttackers();
    }

    private checkAttackers() {
      for (const attacker of this.attackers()) {
        if (attacker.y <= TURN_LINE) attacker.setData("direction", -1);
        const toucher = this.defenders.find((defender) => Phaser.Math.Distance.Between(attacker.x, attacker.y, defender.x, defender.y) < TOUCH_RADIUS);
        if (toucher) { this.onTouch(attacker, toucher); return; }
        const direction = attacker.getData("direction") as number;
        const crossed = attacker.getData("crossed") as Set<string>;
        for (const lineY of linesCrossed(attacker.getData("prevY") as number, attacker.y, direction)) {
          const key = `${lineY}:${direction}`;
          if (crossed.has(key)) continue;
          crossed.add(key);
          this.award(TOUCH.linePoints, attacker.x, lineY);
        }
        attacker.setData("prevY", attacker.y);
        if (direction === -1 && attacker.y >= HOME_LINE) { this.onHome(attacker); return; }
      }
    }

    private onTouch(attacker: Arc, defender: Arc) {
      sound.touch();
      ripple(this, (attacker.x + defender.x) / 2, (attacker.y + defender.y) / 2, 0xffd166);
      this.cameras.main.shake(260, 0.006);
      this.cameras.main.flash(160, 255, 140, 110);
      emit("touch-status", { text: `Touch! The ${defender.getData("name")} caught ${attacker.getData("name")}.`, kind: "danger" });
      this.slowMoUntil = this.time.now + TOUCH.slowMoMs;
      this.pendingEnd = () => {
        if (this.turn >= TOTAL_TURNS) {
          this.over = true;
          this.publishMatch();
          const result = this.scoreYou > this.scoreThem ? "You win" : this.scoreYou < this.scoreThem ? "The CPU wins" : "It's a draw";
          this.end(`Full time! ${result}, ${this.scoreYou}–${this.scoreThem}.`, this.scoreYou > this.scoreThem ? "success" : "danger");
          return;
        }
        this.turn++;
        this.humanAttacks = !this.humanAttacks;
        this.publishMatch();
        this.end(`${attacker.getData("name")} was touched. ${this.humanAttacks ? "Your team attacks next." : "Your team defends next."}`, "danger");
      };
    }

    private onHome(attacker: Arc) {
      if (this.humanAttacks) { sound.cheer(); this.cameras.main.flash(220, 120, 220, 140); }
      else { sound.lose(); this.cameras.main.flash(220, 240, 150, 110); }
      burst(this, attacker.x, attacker.y);
      this.award(TOUCH.homePoints, attacker.x, attacker.y - 12);
      this.end(this.humanAttacks
        ? `${attacker.getData("name")} made it home! +${TOUCH.homePoints} for your team. Attack again.`
        : `An opposing player made it home. +${TOUCH.homePoints} to the CPU. They attack again.`, this.humanAttacks ? "success" : "danger");
    }

    private award(points: number, x: number, y: number) {
      if (this.humanAttacks) { this.scoreYou += points; sound.point(); } else this.scoreThem += points;
      this.publishMatch();
      floatText(this, `+${points}`, x, y, this.humanAttacks ? "#d7ec83" : "#ffb59e");
    }

    private updateSprint(dt: number, moving: boolean) {
      const wants = moving && (this.keys.SHIFT.isDown || input.current.sprint);
      const canSprint = this.sprinting ? this.stamina > 0 : this.stamina >= TOUCH.sprintMinimum;
      this.sprinting = wants && canSprint;
      this.stamina = this.sprinting ? Math.max(0, this.stamina - TOUCH.sprintDrain * dt) : Math.min(1, this.stamina + TOUCH.sprintRegen * dt);
    }

    private footsteps(distance: number) {
      this.stepDistance += distance;
      if (this.stepDistance >= (this.sprinting ? 26 : 34)) { this.stepDistance = 0; sound.step(); }
    }

    private moveControlled(player: Arc, step: number, axisX: number, axisY: number) {
      const goal = player.getData("goal") as Point | null;
      const lineY = player.getData("lineY") as number | undefined;
      if (goal) {
        const dx = goal.x - player.x; const dy = goal.y - player.y; const distance = Math.hypot(dx, dy);
        if (distance <= step + 2) { player.setPosition(goal.x, goal.y); player.setData("goal", null); }
        else player.setPosition(player.x + dx / distance * step, player.y + dy / distance * step);
      } else if (lineY !== undefined) player.x = clamp(player.x + clamp(axisX, -1, 1) * step, 42, FIELD_W - 42);
      else if (player.getData("main")) player.y = clamp(player.y + clamp(axisY, -1, 1) * step, 52, 518);
      else {
        // Joystick input is analog (a partial push moves slower); keys and combined input are capped at full speed.
        const length = Math.hypot(axisX, axisY);
        const scale = length > 1 ? 1 / length : 1;
        player.setData("vel", length > 0 ? { x: axisX / length, y: axisY / length } : { x: 0, y: 0 });
        if (length > 0) player.setPosition(clamp(player.x + axisX * scale * step, 44, FIELD_W - 44), clamp(player.y + axisY * scale * step, 44, 556));
      }
    }

    // Facing wedges, sprint trails and the stamina bar.
    private drawPlayers(dt: number) {
      this.trailGraphics.clear();
      this.playerGraphics.clear();
      const attackers = this.attackers();
      for (const player of [...attackers, ...this.defenders]) {
        const last = (player.getData("lastPos") as Point | null) ?? { x: player.x, y: player.y };
        const moved = Phaser.Math.Distance.Between(last.x, last.y, player.x, player.y);
        let heading = (player.getData("heading") as Point | null) ?? (attackers.includes(player) ? { x: 0, y: -1 } : { x: 0, y: 1 });
        if (moved > 0.3) {
          const blend = { x: heading.x * 0.7 + (player.x - last.x) / moved * 0.3, y: heading.y * 0.7 + (player.y - last.y) / moved * 0.3 };
          const length = Math.hypot(blend.x, blend.y) || 1;
          heading = { x: blend.x / length, y: blend.y / length };
        }
        player.setData("lastPos", { x: player.x, y: player.y });
        player.setData("heading", heading);
        const base = player.radius + 2; const tip = base + 7;
        const side = { x: -heading.y * 5, y: heading.x * 5 };
        this.playerGraphics.fillStyle(0xffffff, 0.85).fillTriangle(
          player.x + heading.x * tip, player.y + heading.y * tip,
          player.x + heading.x * base + side.x, player.y + heading.y * base + side.y,
          player.x + heading.x * base - side.x, player.y + heading.y * base - side.y,
        );
        const trail = (player.getData("trail") as Point[] | null) ?? [];
        if (dt > 0 && moved / dt > TOUCH.attackerSpeed * 1.15) trail.push({ x: player.x, y: player.y });
        else trail.shift();
        if (trail.length > 10) trail.shift();
        player.setData("trail", trail);
        for (let i = 1; i < trail.length; i++) {
          this.trailGraphics.lineStyle(player.radius * 1.2 * i / trail.length, player.fillColor, 0.35 * i / trail.length).lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
        }
      }
      const player = this.selectedPlayer;
      if (player && this.active && (this.sprinting || this.stamina < 1)) {
        const width = 30; const x = player.x - width / 2; const y = player.y - player.radius - 14;
        this.playerGraphics.fillStyle(0x0d2f24, 0.85).fillRect(x - 1, y - 1, width + 2, 6);
        this.playerGraphics.fillStyle(this.stamina >= TOUCH.sprintMinimum || this.sprinting ? 0xd7ec83 : 0xe9906c, 1).fillRect(x, y, width * this.stamina, 4);
      }
    }

    private drawOrders() {
      this.orderGraphics.clear();
      const world = this.world();
      if (this.humanAttacks) {
        const signature = this.attackers().map((player) => {
          const goal = goalOf(world, player);
          if (!goal) return "";
          const nextLine = nextTrapLine(world, player) ?? "clear";
          const fieldSide = player.y < HOME_LINE ? "field" : "start-side";
          return `${player.getData("name")}:${Math.round(goal.x / 80)},${goal.y.toFixed(0)}:${nextLine}:${fieldSide}`;
        }).join("|");
        if (signature !== this.aiOrderSignature) {
          this.aiOrderSignature = signature;
          // Keep the marked attacker unless another is clearly more dangerous, so the Main Line does not flip targets every step.
          const next = chooseComputerTarget(world) as Arc | null;
          const current = this.aiTarget;
          const keep = current && next && current !== next && current.active && goalOf(world, current) && threatScore(world, current) >= threatScore(world, next) - 0.3;
          this.aiTarget = keep ? current : next;
        }
      } else {
        this.aiOrderSignature = "";
        this.aiTarget = null;
      }
      if (this.active && !this.pendingEnd && this.aiTarget !== this.lastAnnouncedTarget) {
        this.lastAnnouncedTarget = this.aiTarget;
        if (this.aiTarget) {
          const trapLine = nextTrapLine(world, this.aiTarget);
          const plan = trapLine === null
            ? "The Main Line defender is holding the centre and reading the next move."
            : `Line ${LINES.indexOf(trapLine) + 1} is closing the gap.`;
          emit("touch-status", { text: `Main Line marks ${this.aiTarget.getData("name")}. ${plan}`, kind: "ready" });
        }
      }
      // Routes and the marked attacker only mean something once the run is under way.
      if (this.active && this.aiTarget) this.aiMarker.setPosition(this.aiTarget.x - 22, this.aiTarget.y - 31).setVisible(true);
      else this.aiMarker.setVisible(false);
      if (this.active && this.humanAttacks) {
        // Planned routes of your computer teammates.
        for (const player of this.attackers()) {
          const goal = player.getData("goal") as Point | null;
          if (!goal) continue;
          this.orderGraphics.lineStyle(2, 0xa9dbef, 0.6).lineBetween(player.x, player.y, goal.x, goal.y);
          this.orderGraphics.fillStyle(0xa9dbef, 0.8).fillCircle(goal.x, goal.y, 4);
        }
        if (this.aiTarget) {
          this.orderGraphics.lineStyle(2, 0xffc56f, 0.62).strokeCircle(this.aiTarget.x, this.aiTarget.y, 21);
          const lineY = nextTrapLine(world, this.aiTarget);
          if (lineY !== null) {
            const trapX = projectedX(world, this.aiTarget, lineY);
            this.orderGraphics.lineStyle(2, 0xf2a354, 0.7).lineBetween(trapX, lineY - 15, trapX, lineY + 15);
          }
        }
      }
      this.drawIntents();
    }

    // What each computer defender is about to do: guard a spot (orange), lunge at a runner (red) or fake a gap (yellow).
    private drawIntents() {
      for (const defender of this.defenders) {
        const label = this.intentLabels.get(defender)!;
        const humanControlled = !this.humanAttacks && defender === this.selectedPlayer;
        const intent = humanControlled || !this.active ? null : defender.getData("intent") as DefenderIntent | null;
        if (intent && intent !== "home") {
          const color = intent === "lunge" ? 0xff5a4f : intent === "bait" ? 0xf7e486 : 0xf2a354;
          if (defender.getData("main")) {
            const guardY = defender.getData("guardY") as number;
            this.orderGraphics.lineStyle(1, color, 0.45).lineBetween(defender.x, defender.y, defender.x, guardY);
            this.orderGraphics.lineStyle(3, color, 0.9).lineBetween(defender.x - 11, guardY, defender.x + 11, guardY);
          } else {
            const guardX = defender.getData("guardX") as number;
            this.orderGraphics.lineStyle(intent === "lunge" ? 3 : 1, color, intent === "lunge" ? 0.9 : 0.45).lineBetween(defender.x, defender.y, guardX, defender.y);
            this.orderGraphics.lineStyle(3, color, 0.9).lineBetween(guardX, defender.y - 10, guardX, defender.y + 10);
          }
        }
        const text = intent === "lunge" ? "LUNGE!" : intent === "bait" ? "FAKE" : "";
        label.setVisible(text !== "");
        if (text) label.setText(text).setBackgroundColor(intent === "lunge" ? "#ff5a4f" : "#f7e486").setPosition(defender.x, defender.y - 26);
      }
    }
  };
}
