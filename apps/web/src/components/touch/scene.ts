import type PhaserNamespace from "phaser";
import { nextTrapLine, projectedX, type DefenderIntent } from "@salone/games/touch/defenders";
import { FIELD_H, FIELD_W, HOME_LINE, LINES, MID, TURN_LINE, type Point } from "@salone/games/touch/field";
import { TouchMatch, type Player, type TouchEvent, type TouchInput } from "@salone/games/touch/match";
import { LEVELS, TOUCH, type Level } from "@salone/games/touch/settings";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";

type Arc = PhaserNamespace.GameObjects.Arc;
type Text = PhaserNamespace.GameObjects.Text;
type Graphics = PhaserNamespace.GameObjects.Graphics;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type MatchState = { you: number; them: number; turn: number; totalTurns: number; over: boolean };
export type { TouchInput };

// On one device you are team 0 and the computer is team 1.
const YOU = "you";
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The rules run in TouchMatch; the scene draws its players and turns what happens into sounds, effects and messages.
// The React screen talks to the scene through window events: it sends touch-start, touch-count, touch-level,
// touch-new-match, touch-switch and touch-move, and listens for touch-status, touch-state and touch-match.
export function createTouchScene(Phaser: typeof PhaserNamespace, input: { current: TouchInput }, sound: GameSound) {
  return class TouchField extends Phaser.Scene {
    private match = new TouchMatch({ count: 4, tuning: [LEVELS.normal, LEVELS.normal] });
    private views = new Map<Player, Arc>();
    private tags = new Map<Player, Text>();
    private shownAttackers: Player[] = [];
    private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
    private level: Level = "normal";
    private trailGraphics!: Graphics;
    private orderGraphics!: Graphics;
    private playerGraphics!: Graphics;
    private aiMarker!: Text;
    private intentLabels = new Map<Player, Text>();
    private stepDistance = 0;

    constructor() {
      super("TouchField");
      this.match.join(YOU, 0);
    }

    private get humanAttacks() { return this.match.attacking === 0; }
    private get you() { return this.match.controllers.get(YOU)!; }

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
      for (const defender of this.match.defenders) {
        this.views.set(defender, this.add.circle(defender.x, defender.y, defender.role === "main" ? 14 : 13, 0xf2a354).setDepth(3));
        this.intentLabels.set(defender, this.add.text(0, 0, "", { fontFamily: "Arial", fontSize: "9px", color: "#2b0d08", fontStyle: "bold", padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(9).setVisible(false));
      }
      this.add.text(MID + 18, 284, "MAIN", { fontFamily: "Arial", fontSize: "9px", color: "#fff0e9", fontStyle: "bold" });

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

    private start = () => {
      if (!this.match.begin()) return;
      this.lineUp();
      sound.whistle();
      emit("touch-state", { playing: true });
    };
    private setCount = (event: Event) => { this.match.count = (event as CustomEvent<number>).detail; this.newMatch(); };
    private setLevel = (event: Event) => {
      // The level sets the opposing team; your own computer teammates always play at normal.
      this.level = (event as CustomEvent<Level>).detail;
      this.match.tuning = [LEVELS.normal, LEVELS[this.level]];
      this.newMatch();
    };
    private newMatch = () => {
      this.match.newMatch();
      this.lineUp();
      this.publishMatch();
    };
    private publishMatch() {
      const { score, turn, totalTurns, phase } = this.match;
      emit("touch-match", { you: score[0], them: score[1], turn, totalTurns, over: phase === "over" });
    }
    private moveBy = (event: Event) => {
      const { x, y } = (event as CustomEvent<Point>).detail;
      input.current = { ...input.current, x, y };
    };

    private selectPlayerAt(x: number, y: number) {
      const own = this.humanAttacks ? this.match.attackers : this.match.defenders;
      this.match.control(YOU, own.find((player) => Phaser.Math.Distance.Between(x, y, player.x, player.y) < 25));
    }
    // Space (or the SWITCH button) hands control to the next player on your team.
    private switchPlayer = () => { this.match.switchNext(YOU); };

    // After the match lines everyone up: new attackers, colours for the side each team is on, and the turn message.
    private lineUp() {
      input.current = { x: 0, y: 0, sprint: false };
      this.stepDistance = 0;
      for (const player of this.shownAttackers) {
        this.views.get(player)?.destroy();
        this.tags.get(player)?.destroy();
        this.views.delete(player);
        this.tags.delete(player);
      }
      this.shownAttackers = this.match.attackers;
      this.shownAttackers.forEach((player, i) => {
        const lead = i === 0;
        const fill = this.humanAttacks ? (lead ? 0x69c6ef : 0x91d7f3) : 0xe57859;
        const view = this.add.circle(player.x, player.y, lead ? 14 : 12, fill).setDepth(5);
        view.setData("stroke", lead ? [3, 0xe7f8ff] : [2, 0xffe3b1]);
        this.views.set(player, view);
        this.tags.set(player, this.add.text(player.x - 3, player.y + (lead ? 16 : 15), String(i + 1), { fontFamily: "Arial", fontSize: "9px", color: "#e7f8ff", fontStyle: "bold" }).setDepth(lead ? 5 : 6));
      });
      const friendly = !this.humanAttacks;
      for (const defender of this.match.defenders) {
        const view = this.views.get(defender)!;
        view.setFillStyle(friendly ? 0x69b8d8 : 0xf2a354);
        view.setData("stroke", [3, friendly ? 0xe7f8ff : 0xffe3b1]);
        for (const key of ["lastPos", "trail", "heading"]) view.setData(key, null);
      }
      this.syncViews();
      const { turn, totalTurns } = this.match;
      const text = this.humanAttacks
        ? `Turn ${turn} of ${totalTurns}: your team attacks. Each line crossed scores ${TOUCH.linePoints}, getting home scores ${TOUCH.homePoints}.`
        : `Turn ${turn} of ${totalTurns}: your team defends. You control the Main Line defender; press Space or tap to switch.`;
      emit("touch-status", { text, kind: "ready" });
      emit("touch-state", { playing: false });
    }

    // Moves each circle to its player and rings the one you control.
    private syncViews() {
      for (const [player, view] of this.views) {
        view.setPosition(player.x, player.y);
        const [width, color] = this.you.body === player ? [5, 0xf7e486] : view.getData("stroke") as [number, number];
        if (view.lineWidth !== width || view.strokeColor !== color) view.setStrokeStyle(width, color);
      }
      this.shownAttackers.forEach((player, i) => this.tags.get(player)?.setPosition(player.x - 3, player.y + (i === 0 ? 16 : 15)));
    }

    private end(text: string, kind: "danger" | "success") {
      emit("touch-status", { text, kind });
      emit("touch-state", { playing: false });
    }

    update(_time: number, delta: number) {
      let dx = 0; let dy = 0;
      if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
      if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
      if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
      this.match.setInput(YOU, { x: dx + input.current.x, y: dy + input.current.y, sprint: this.keys.SHIFT.isDown || input.current.sprint });
      const dt = Math.min(delta / 1000, 0.04) * (this.match.phase === "slowmo" ? TOUCH.slowMoScale : 1);
      const controlled = this.match.active ? this.you.body : null;
      const before = controlled ? { x: controlled.x, y: controlled.y } : null;
      const events = this.match.step(delta);
      this.syncViews();
      if (controlled && before) this.footsteps(Phaser.Math.Distance.Between(before.x, before.y, controlled.x, controlled.y));
      for (const event of events) this.show(event);
      this.drawOrders();
      this.drawPlayers(dt);
    }

    private show(event: TouchEvent) {
      if (event.type === "line") {
        if (event.team === 0) sound.point();
        floatText(this, `+${TOUCH.linePoints}`, event.x, event.y, event.team === 0 ? "#d7ec83" : "#ffb59e");
        this.publishMatch();
      } else if (event.type === "home") {
        const { attacker } = event;
        const ours = event.team === 0;
        if (ours) { sound.cheer(); this.cameras.main.flash(220, 120, 220, 140); }
        else { sound.lose(); this.cameras.main.flash(220, 240, 150, 110); }
        burst(this, attacker.x, attacker.y);
        if (ours) sound.point();
        floatText(this, `+${TOUCH.homePoints}`, attacker.x, attacker.y - 12, ours ? "#d7ec83" : "#ffb59e");
        this.publishMatch();
        this.end(ours
          ? `${attacker.name} made it home! +${TOUCH.homePoints} for your team. Attack again.`
          : `An opposing player made it home. +${TOUCH.homePoints} to the CPU. They attack again.`, ours ? "success" : "danger");
      } else if (event.type === "touch") {
        const { attacker, defender } = event;
        sound.touch();
        ripple(this, (attacker.x + defender.x) / 2, (attacker.y + defender.y) / 2, 0xffd166);
        this.cameras.main.shake(260, 0.006);
        this.cameras.main.flash(160, 255, 140, 110);
        emit("touch-status", { text: `Touch! The ${defender.name} caught ${attacker.name}.`, kind: "danger" });
      } else if (event.type === "turnOver") {
        this.publishMatch();
        if (event.over) {
          const [you, them] = this.match.score;
          const result = you > them ? "You win" : you < them ? "The CPU wins" : "It's a draw";
          this.end(`Full time! ${result}, ${you}–${them}.`, you > them ? "success" : "danger");
        } else {
          this.end(`${event.attacker.name} was touched. ${this.humanAttacks ? "Your team attacks next." : "Your team defends next."}`, "danger");
        }
      } else {
        const trapLine = nextTrapLine(this.match.world(), event.attacker);
        const plan = trapLine === null
          ? "The Main Line defender is holding the centre and reading the next move."
          : `Line ${LINES.indexOf(trapLine) + 1} is closing the gap.`;
        emit("touch-status", { text: `Main Line marks ${event.attacker.name}. ${plan}`, kind: "ready" });
      }
    }

    private footsteps(distance: number) {
      this.stepDistance += distance;
      if (this.stepDistance >= (this.you.sprinting ? 26 : 34)) { this.stepDistance = 0; sound.step(); }
    }

    // Facing wedges, sprint trails and the stamina bar.
    private drawPlayers(dt: number) {
      this.trailGraphics.clear();
      this.playerGraphics.clear();
      for (const [player, view] of this.views) {
        const last = (view.getData("lastPos") as Point | null) ?? { x: player.x, y: player.y };
        const moved = Phaser.Math.Distance.Between(last.x, last.y, player.x, player.y);
        let heading = (view.getData("heading") as Point | null) ?? (player.role === "attacker" ? { x: 0, y: -1 } : { x: 0, y: 1 });
        if (moved > 0.3) {
          const blend = { x: heading.x * 0.7 + (player.x - last.x) / moved * 0.3, y: heading.y * 0.7 + (player.y - last.y) / moved * 0.3 };
          const length = Math.hypot(blend.x, blend.y) || 1;
          heading = { x: blend.x / length, y: blend.y / length };
        }
        view.setData("lastPos", { x: player.x, y: player.y });
        view.setData("heading", heading);
        const base = view.radius + 2; const tip = base + 7;
        const side = { x: -heading.y * 5, y: heading.x * 5 };
        this.playerGraphics.fillStyle(0xffffff, 0.85).fillTriangle(
          player.x + heading.x * tip, player.y + heading.y * tip,
          player.x + heading.x * base + side.x, player.y + heading.y * base + side.y,
          player.x + heading.x * base - side.x, player.y + heading.y * base - side.y,
        );
        const trail = (view.getData("trail") as Point[] | null) ?? [];
        if (dt > 0 && moved / dt > TOUCH.attackerSpeed * 1.15) trail.push({ x: player.x, y: player.y });
        else trail.shift();
        if (trail.length > 10) trail.shift();
        view.setData("trail", trail);
        for (let i = 1; i < trail.length; i++) {
          this.trailGraphics.lineStyle(view.radius * 1.2 * i / trail.length, view.fillColor, 0.35 * i / trail.length).lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
        }
      }
      const { body, stamina, sprinting } = this.you;
      const view = body && this.views.get(body);
      if (view && this.match.active && (sprinting || stamina < 1)) {
        const width = 30; const x = view.x - width / 2; const y = view.y - view.radius - 14;
        this.playerGraphics.fillStyle(0x0d2f24, 0.85).fillRect(x - 1, y - 1, width + 2, 6);
        this.playerGraphics.fillStyle(stamina >= TOUCH.sprintMinimum || sprinting ? 0xd7ec83 : 0xe9906c, 1).fillRect(x, y, width * stamina, 4);
      }
    }

    private drawOrders() {
      this.orderGraphics.clear();
      const { active, aiTarget } = this.match;
      // Routes and the marked attacker only mean something once the run is under way.
      if (active && aiTarget) this.aiMarker.setPosition(aiTarget.x - 22, aiTarget.y - 31).setVisible(true);
      else this.aiMarker.setVisible(false);
      if (active && this.humanAttacks) {
        // Planned routes of your computer teammates.
        for (const player of this.match.attackers) {
          const goal = player.getData("goal") as Point | null;
          if (!goal) continue;
          this.orderGraphics.lineStyle(2, 0xa9dbef, 0.6).lineBetween(player.x, player.y, goal.x, goal.y);
          this.orderGraphics.fillStyle(0xa9dbef, 0.8).fillCircle(goal.x, goal.y, 4);
        }
        if (aiTarget) {
          const world = this.match.world();
          this.orderGraphics.lineStyle(2, 0xffc56f, 0.62).strokeCircle(aiTarget.x, aiTarget.y, 21);
          const lineY = nextTrapLine(world, aiTarget);
          if (lineY !== null) {
            const trapX = projectedX(world, aiTarget, lineY);
            this.orderGraphics.lineStyle(2, 0xf2a354, 0.7).lineBetween(trapX, lineY - 15, trapX, lineY + 15);
          }
        }
      }
      this.drawIntents();
    }

    // What each computer defender is about to do: guard a spot (orange), lunge at a runner (red) or fake a gap (yellow).
    private drawIntents() {
      for (const defender of this.match.defenders) {
        const label = this.intentLabels.get(defender)!;
        const intent = this.match.controllerOf(defender) || !this.match.active ? null : defender.getData("intent") as DefenderIntent | null;
        if (intent && intent !== "home") {
          const color = intent === "lunge" ? 0xff5a4f : intent === "bait" ? 0xf7e486 : 0xf2a354;
          if (defender.role === "main") {
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
