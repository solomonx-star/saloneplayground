"use client";

import { useEffect, useRef, useState } from "react";
import type PhaserNamespace from "phaser";
import Joystick from "@/components/Joystick";
import { LEVELS, TOUCH, type Level } from "@/components/touchSettings";

type Notice = { text: string; kind: "ready" | "danger" | "success" };
type MatchState = { you: number; them: number; turn: number; totalTurns: number; over: boolean };

export default function TouchGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Your team is attacking. Reach the far line and return!", kind: "ready" });
  const [players, setPlayers] = useState(4);
  const [level, setLevel] = useState<Level>("normal");
  const [match, setMatch] = useState<MatchState>({ you: 0, them: 0, turn: 1, totalTurns: TOUCH.turnsPerTeam * 2, over: false });
  const [isPlaying, setIsPlaying] = useState(false);
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null);
  const inputRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;

    void import("phaser").then((module) => {
      if (disposed || !hostRef.current) return;
      const Phaser = module.default;
      // Field width in game pixels; every horizontal position below is derived from it.
      const FIELD_W = TOUCH.fieldWidth;
      const TOTAL_TURNS = TOUCH.turnsPerTeam * 2;
      const MID = FIELD_W / 2;

      class TouchField extends Phaser.Scene {
        private runner!: PhaserNamespace.GameObjects.Arc;
        private runnerLabel!: PhaserNamespace.GameObjects.Text;
        private teammates: PhaserNamespace.GameObjects.Arc[] = [];
        private selectedPlayer: PhaserNamespace.GameObjects.Arc | null = null;
        private defenders: PhaserNamespace.GameObjects.Arc[] = [];
        private mainDefender!: PhaserNamespace.GameObjects.Arc;
        private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
        private active = false;
        private humanAttacks = true;
        private count = 4;
        private orderGraphics!: PhaserNamespace.GameObjects.Graphics;
        private aiMarker!: PhaserNamespace.GameObjects.Text;
        private aiTarget: PhaserNamespace.GameObjects.Arc | null = null;
        private lastAnnouncedTarget: PhaserNamespace.GameObjects.Arc | null = null;
        private aiOrderSignature = "";
        private level: Level = "normal";
        private scoreYou = 0;
        private scoreThem = 0;
        private turn = 1;
        private over = false;

        constructor() { super("TouchField"); }

        create() {
          const w = FIELD_W;
          const h = 600;
          const g = this.add.graphics();
          g.fillGradientStyle(0x226b4d, 0x226b4d, 0x1d6045, 0x1d6045, 1);
          g.fillRoundedRect(12, 12, w - 24, h - 24, 20);
          g.lineStyle(2, 0x9bc5a1, 0.75).strokeRoundedRect(28, 28, w - 56, h - 56, 12);
          g.lineStyle(2, 0xd1e3cb, 0.48);
          const lanes = [132, 222, 312, 402];
          lanes.forEach((y, i) => {
            g.lineBetween(32, y, w - 32, y);
            this.add.text(40, y - 22, `LINE ${i + 1}`, { fontFamily: "Arial", fontSize: "10px", color: "#d9ead6", fontStyle: "bold" }).setAlpha(0.8);
          });
          g.lineStyle(3, 0xf0d77a, 0.85).lineBetween(32, 492, w - 32, 492);
          g.lineStyle(3, 0xf0d77a, 0.85).lineBetween(32, 72, w - 32, 72);
          g.lineStyle(2, 0xf6dda0, 0.8).lineBetween(w / 2, 46, w / 2, 524);
          this.add.text(42, 501, "START", { fontFamily: "Arial", fontSize: "11px", color: "#fff4c6", fontStyle: "bold" });
          this.add.text(42, 52, "LAST LINE · TURN BACK", { fontFamily: "Arial", fontSize: "11px", color: "#fff4c6", fontStyle: "bold" });
          this.add.text(w / 2 + 8, 270, "MAIN LINE", { fontFamily: "Arial", fontSize: "10px", color: "#ffe8ad", fontStyle: "bold" }).setAngle(-90).setAlpha(0.9);
          this.orderGraphics = this.add.graphics().setDepth(4);
          this.aiMarker = this.add.text(0, 0, "MARKED", { fontFamily: "Arial", fontSize: "9px", color: "#ffe5a0", backgroundColor: "#593a20", padding: { x: 4, y: 2 }, fontStyle: "bold" }).setDepth(7).setVisible(false);

          // Four line defenders and one Main Line defender.
          lanes.forEach((y, i) => {
            const defender = this.add.circle((i % 2 ? FIELD_W - 130 : 130), y, 13, 0xf2a354).setStrokeStyle(3, 0xffe3b1);
            defender.setData("lineY", y);
            defender.setData("phase", i * 1.6);
            defender.setData("name", `Line ${i + 1} defender`);
            this.defenders.push(defender);
          });
          this.mainDefender = this.add.circle(w / 2, 300, 14, 0xe57859).setStrokeStyle(3, 0xffd2c4);
          this.mainDefender.setData("main", true);
          this.mainDefender.setData("name", "Main Line defender");
          this.defenders.push(this.mainDefender);
          this.add.text(w / 2 + 18, 284, "MAIN", { fontFamily: "Arial", fontSize: "9px", color: "#fff0e9", fontStyle: "bold" });

          this.runner = this.add.circle(w / 2 - 120, 544, 14, 0x69c6ef).setStrokeStyle(3, 0xe7f8ff).setDepth(5);
          this.runner.setData("name", "Player 1");
          this.runner.setData("direction", 1);
          this.runnerLabel = this.add.text(this.runner.x - 15, this.runner.y + 18, "YOU", { fontFamily: "Arial", fontSize: "9px", color: "#e7f8ff", fontStyle: "bold" }).setDepth(5);
          this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE") as typeof this.keys;
          this.input.on("pointerdown", (pointer: PhaserNamespace.Input.Pointer) => this.selectPlayer(pointer.worldX, pointer.worldY));
          window.addEventListener("touch-start", this.start as EventListener);
          window.addEventListener("touch-count", this.setCount as EventListener);
          window.addEventListener("touch-move", this.moveBy as EventListener);
          window.addEventListener("touch-reset", this.reset as EventListener);
          window.addEventListener("touch-level", this.setLevel as EventListener);
          window.addEventListener("touch-new-match", this.newMatch as EventListener);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener("touch-start", this.start as EventListener);
            window.removeEventListener("touch-count", this.setCount as EventListener);
            window.removeEventListener("touch-move", this.moveBy as EventListener);
            window.removeEventListener("touch-reset", this.reset as EventListener);
            window.removeEventListener("touch-level", this.setLevel as EventListener);
            window.removeEventListener("touch-new-match", this.newMatch as EventListener);
          });
          this.newMatch();
        }

        private start = () => { if (this.over) return; this.reset(); this.active = true; window.dispatchEvent(new CustomEvent("touch-state", { detail: { playing: true } })); };
        private setCount = (event: Event) => { this.count = (event as CustomEvent<number>).detail; this.newMatch(); };
        private setLevel = (event: Event) => { this.level = (event as CustomEvent<Level>).detail; this.newMatch(); };
        private newMatch = () => {
          this.scoreYou = 0; this.scoreThem = 0; this.turn = 1; this.over = false; this.humanAttacks = true;
          this.reset();
          this.publishMatch();
        };
        private publishMatch() {
          window.dispatchEvent(new CustomEvent("touch-match", { detail: { you: this.scoreYou, them: this.scoreThem, turn: this.turn, totalTurns: TOTAL_TURNS, over: this.over } }));
        }
        // The level sets the opposing team; the player's own computer teammates always play at normal.
        private defense() { return this.humanAttacks ? LEVELS[this.level] : LEVELS.normal; }
        private attack() { return this.humanAttacks ? LEVELS.normal : LEVELS[this.level]; }
        private selectPlayer(x: number, y: number) {
          if (!this.active) return;
          const ownPlayers = this.humanAttacks ? [this.runner, ...this.teammates] : this.defenders;
          const hit = ownPlayers.find((player) => Phaser.Math.Distance.Between(x, y, player.x, player.y) < 25);
          if (hit) {
            this.selectedPlayer?.setStrokeStyle(2, 0xe7f8ff);
            if (this.humanAttacks) this.selectedPlayer?.setData("mode", null);
            this.selectedPlayer = hit;
            if (this.humanAttacks) hit.setData("goal", null);
            hit.setStrokeStyle(5, 0xf7e486);
          }
        }
        private moveBy = (event: Event) => {
          const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
          inputRef.current = { x, y };
        };
        private reset = () => {
          this.active = false;
          inputRef.current = { x: 0, y: 0 };
          this.teammates.forEach((player) => {
            (player.getData("tag") as PhaserNamespace.GameObjects.Text | undefined)?.destroy();
            player.destroy();
          });
          this.teammates = [];
          this.selectedPlayer = null;
          this.aiOrderSignature = "";
          this.aiTarget = null;
          this.runner.setPosition(MID - (this.count - 1) / 2 * 38, 544);
          this.runner.setData("goal", null);
          this.runner.setData("direction", 1);
          for (const key of ["mode", "think", "targetX", "holdTime", "courage"]) this.runner.setData(key, null);
          this.defenders.forEach((defender, i) => {
            const friendly = !this.humanAttacks;
            defender.setFillStyle(friendly ? 0x69b8d8 : 0xf2a354);
            defender.setStrokeStyle(3, friendly ? 0xe7f8ff : 0xffe3b1);
            defender.setData("goal", null);
            for (const key of ["guardX", "guardY", "baitUntil"]) defender.setData(key, null);
            const lineY = defender.getData("lineY") as number | undefined;
            const homeX = lineY === undefined ? MID : i % 2 ? FIELD_W - 130 : 130;
            defender.setPosition(homeX, lineY ?? 300);
            defender.setData("homeX", homeX);
          });
          this.runner.setPosition(MID - (this.count - 1) / 2 * 38, 544);
          this.runner.setFillStyle(this.humanAttacks ? 0x69c6ef : 0xe57859);
          this.runnerLabel.setText("1").setPosition(this.runner.x - 3, this.runner.y + 16);
          this.mainDefender.setFillStyle(this.humanAttacks ? 0xf2a354 : 0x69b8d8);
          const text = this.humanAttacks
            ? `Turn ${this.turn} of ${TOTAL_TURNS}: your team attacks. Tap an attacker to control them; your teammates run on their own.`
            : `Turn ${this.turn} of ${TOTAL_TURNS}: your team defends. You control the Main Line defender; tap another defender to switch.`;
          window.dispatchEvent(new CustomEvent("touch-status", { detail: { text, kind: "ready" } }));
          window.dispatchEvent(new CustomEvent("touch-state", { detail: { playing: false } }));
          for (let i = 1; i < this.count; i++) {
            const teammate = this.add.circle(MID + (i - (this.count - 1) / 2) * 38, 544, 12, this.humanAttacks ? 0x91d7f3 : 0xe57859).setStrokeStyle(2, 0xffe3b1).setDepth(5);
            teammate.setData("name", `Player ${i + 1}`);
            teammate.setData("direction", 1);
            teammate.setData("goal", { x: this.chooseOpenLane(), y: 72 });
            teammate.setData("tag", this.add.text(teammate.x - 3, teammate.y + 15, String(i + 1), { fontFamily: "Arial", fontSize: "9px", color: "#e7f8ff", fontStyle: "bold" }).setDepth(6));
            this.teammates.push(teammate);
          }
          this.runner.setData("direction", 1);
          this.runner.setData("goal", this.humanAttacks ? null : { x: this.chooseOpenLane(), y: 72 });
          this.selectedPlayer = this.humanAttacks ? this.runner : this.mainDefender;
          this.selectedPlayer.setStrokeStyle(5, 0xf7e486);
        };

        private end = (text: string, kind: "danger" | "success") => {
          this.active = false;
          window.dispatchEvent(new CustomEvent("touch-status", { detail: { text, kind } }));
          window.dispatchEvent(new CustomEvent("touch-state", { detail: { playing: false } }));
        };

        update(_time: number, delta: number) {
          const dt = Math.min(delta / 1000, 0.04);
          this.drawOrders();
          if (!this.active) return;
          let dx = 0; let dy = 0;
          if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
          if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
          if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
          if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
          dx += inputRef.current.x; dy += inputRef.current.y;
          if (this.humanAttacks) {
            this.moveComputerDefenders(dt);
            this.moveComputerAttackers(dt, this.selectedPlayer ?? undefined);
            if (this.selectedPlayer) this.moveOrderedPlayer(this.selectedPlayer, TOUCH.humanSpeed * dt, dx, dy);
          } else {
            this.moveComputerDefenders(dt, this.selectedPlayer ?? undefined);
            if (this.selectedPlayer) this.moveOrderedPlayer(this.selectedPlayer, TOUCH.humanSpeed * dt, dx, dy);
            this.moveComputerAttackers(dt);
          }

          this.runnerLabel.setPosition(this.runner.x - 3, this.runner.y + 16);
          this.teammates.forEach((player) => (player.getData("tag") as PhaserNamespace.GameObjects.Text).setPosition(player.x - 3, player.y + 15));
          for (const attacker of [this.runner, ...this.teammates]) {
            if (attacker.y <= 72) attacker.setData("direction", -1);
            if (attacker.getData("direction") === -1 && attacker.y >= 492) {
              if (this.humanAttacks) this.scoreYou++; else this.scoreThem++;
              this.publishMatch();
              this.end(this.humanAttacks ? `${attacker.getData("name")} made it home! +1 for your team. Attack again.` : "An opposing player made it home. +1 to the CPU. They attack again.", this.humanAttacks ? "success" : "danger");
              return;
            }
            const touched = this.defenders.some((defender) => Phaser.Math.Distance.Between(attacker.x, attacker.y, defender.x, defender.y) < 26);
            if (touched) {
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
              this.end(this.humanAttacks ? "Touch! The other team is out. Your team attacks next." : "Touched! Your team defends next; the other team attacks.", "danger");
              return;
            }
          }
        }

        private drawOrders() {
          this.orderGraphics.clear();
          if (this.humanAttacks) {
            const signature = [this.runner, ...this.teammates].map((player) => {
              const goal = this.goalOf(player) as { x: number; y: number } | null;
              if (!goal) return "";
              const nextLine = this.nextTrapLine(player) ?? "clear";
              const fieldSide = player.y < 492 ? "field" : "start-side";
              return `${player.getData("name")}:${Math.round(goal.x / 80)},${goal.y.toFixed(0)}:${nextLine}:${fieldSide}`;
            }).join("|");
            if (signature !== this.aiOrderSignature) {
              this.aiOrderSignature = signature;
              const next = this.chooseComputerTarget();
              const current = this.aiTarget;
              const keep = current && next && current !== next && current.active && this.goalOf(current) && this.threatScore(current) >= this.threatScore(next) - 0.3;
              this.aiTarget = keep ? current : next;
            }
          } else {
            this.aiOrderSignature = "";
            this.aiTarget = null;
          }
          if (this.active && this.aiTarget !== this.lastAnnouncedTarget) {
            this.lastAnnouncedTarget = this.aiTarget;
            if (this.aiTarget) {
              const trapLine = this.nextTrapLine(this.aiTarget);
              const plan = trapLine === null
                ? "The Main Line defender is holding the center and reading the next move."
                : `Main Line directs Line ${[132, 222, 312, 402].indexOf(trapLine) + 1} and its support line to set a trap.`;
              window.dispatchEvent(new CustomEvent("touch-status", { detail: { text: `Main Line marks ${this.aiTarget.getData("name")}. ${plan}`, kind: "ready" } }));
            }
          }
          if (this.aiTarget) {
            this.aiMarker.setPosition(this.aiTarget.x - 22, this.aiTarget.y - 31).setVisible(true);
          } else this.aiMarker.setVisible(false);
          const players = this.humanAttacks ? [this.runner, ...this.teammates] : this.defenders;
          for (const player of players) {
            const goal = player.getData("goal") as { x: number; y: number } | null;
            if (!goal) continue;
            const color = this.humanAttacks ? 0xa9dbef : 0xd6e98a;
            this.orderGraphics.lineStyle(2, color, 0.75).lineBetween(player.x, player.y, goal.x, goal.y);
            this.orderGraphics.fillStyle(color, 0.9).fillCircle(goal.x, goal.y, 5);
          }
          if (this.humanAttacks) {
            if (this.aiTarget) {
              this.orderGraphics.lineStyle(2, 0xffc56f, 0.62).strokeCircle(this.aiTarget.x, this.aiTarget.y, 21);
              const lineY = this.nextTrapLine(this.aiTarget);
              if (lineY !== null) {
                const trapX = this.projectedX(this.aiTarget, lineY);
                this.orderGraphics.lineStyle(2, 0xf2a354, 0.7).lineBetween(trapX, lineY - 15, trapX, lineY + 15);
              }
            }
            // Show where each computer defender is moving to guard its line.
            for (const defender of this.defenders) {
              const guardX = defender.getData("guardX") as number | null;
              const guardY = defender.getData("guardY") as number | null;
              if (guardX != null && Math.abs(guardX - defender.x) > 8) this.orderGraphics.lineStyle(1, 0xf2a354, 0.4).lineBetween(defender.x, defender.y, guardX, defender.y);
              if (guardY != null && Math.abs(guardY - defender.y) > 8) this.orderGraphics.lineStyle(2, 0xf2a354, 0.5).lineBetween(defender.x, defender.y, defender.x, guardY);
            }
          }
        }

        private moveOrderedPlayer(player: PhaserNamespace.GameObjects.Arc, step: number, axisX = 0, axisY = 0) {
          const goal = player.getData("goal") as { x: number; y: number } | null;
          const lineY = player.getData("lineY") as number | undefined;
          if (goal) {
            const dx = goal.x - player.x; const dy = goal.y - player.y; const distance = Math.hypot(dx, dy);
            if (distance <= step + 2) { player.setPosition(goal.x, goal.y); player.setData("goal", null); }
            else player.setPosition(player.x + dx / distance * step, player.y + dy / distance * step);
          } else if (lineY !== undefined) player.x = Phaser.Math.Clamp(player.x + Phaser.Math.Clamp(axisX, -1, 1) * step, 42, FIELD_W - 42);
          else if (player.getData("main")) player.y = Phaser.Math.Clamp(player.y + Phaser.Math.Clamp(axisY, -1, 1) * step, 52, 518);
          else {
            // Joystick input is analog (a partial push moves slower); keys and combined input are capped at full speed.
            const length = Math.hypot(axisX, axisY);
            const scale = length > 1 ? 1 / length : 1;
            player.setData("vel", length > 0 ? { x: axisX / length, y: axisY / length } : { x: 0, y: 0 });
            if (length > 0) player.setPosition(Phaser.Math.Clamp(player.x + axisX * scale * step, 44, FIELD_W - 44), Phaser.Math.Clamp(player.y + axisY * scale * step, 44, 556));
          }
        }

        // Every computer defender guards its own line against every attacker heading for it, instead of all following one target.
        private moveComputerDefenders(dt: number, excluded?: PhaserNamespace.GameObjects.Arc) {
          const attackers = [this.runner, ...this.teammates];
          for (const defender of this.defenders) {
            if (defender === excluded) continue;
            if (defender.getData("main")) this.guardMainLine(defender, attackers, dt);
            else this.guardLine(defender, attackers, dt);
          }
        }

        // The line an attacker will cross next, whether they are already committed to the run, and where they are lining up.
        private attackerIntent(a: PhaserNamespace.GameObjects.Arc): { line: number | null; dashing: boolean; aimX: number } {
          if (this.humanAttacks && a === this.selectedPlayer) {
            const line = this.nextLineFor(a);
            const vel = (a.getData("vel") as { x: number; y: number } | undefined) ?? { x: 0, y: 0 };
            const towardLine = line !== null && vel.y !== 0 && Math.sign(vel.y) === Math.sign(line - a.y);
            return { line, dashing: towardLine && Math.abs(a.y - (line as number)) < 90, aimX: a.x };
          }
          const crossLine = a.getData("crossLine") as number | null;
          const before = crossLine != null && (a.getData("direction") !== -1 ? a.y > crossLine + 10 : a.y < crossLine - 10);
          const dashing = a.getData("mode") === "cross" && before;
          return { line: dashing ? crossLine : this.nextLineFor(a), dashing, aimX: (a.getData("targetX") as number | null) ?? a.x };
        }

        private guardLine(d: PhaserNamespace.GameObjects.Arc, attackers: PhaserNamespace.GameObjects.Arc[], dt: number) {
          const lineY = d.getData("lineY") as number;
          let lunge: { x: number; dist: number } | null = null;
          const watch: { x: number; w: number }[] = [];
          for (const a of attackers) {
            const { line, dashing, aimX } = this.attackerIntent(a);
            if (line === lineY) {
              const dist = Math.abs(a.y - lineY);
              if (dashing) { if (!lunge || dist < lunge.dist) lunge = { x: this.projectedX(a, lineY), dist }; }
              else watch.push({ x: a.x * 0.6 + aimX * 0.4, w: (a === this.aiTarget ? 1.6 : 1) * (2 - Math.min(dist, 150) / 150) });
            } else if (line !== null && Math.abs(line - lineY) === 90 && (a.getData("direction") !== -1) === (lineY < line)) {
              // Attackers one line away: get into position before they arrive.
              watch.push({ x: a.x, w: 0.35 });
            }
          }
          let targetX = d.getData("homeX") as number;
          const tuning = this.defense();
          let speed = TOUCH.defenderSpeed * tuning.speed;
          if (lunge) { targetX = lunge.x; speed *= tuning.lunge; }
          else if (watch.length) {
            const xs = watch.map((w) => w.x);
            const spread = Math.max(...xs) - Math.min(...xs);
            const weighted = watch.reduce((sum, w) => sum + w.x * w.w, 0) / watch.reduce((sum, w) => sum + w.w, 0);
            // Attackers far apart: stand between them so none gets an easy gap. Close together: shadow the group.
            targetX = spread < 160 ? weighted : (Math.min(...xs) + Math.max(...xs)) / 2 * 0.6 + weighted * 0.4;
            // Now and then step off a lone attacker to tempt a crossing, then lunge when they commit.
            const now = this.time.now;
            const baitUntil = (d.getData("baitUntil") as number | null) ?? 0;
            if (watch.length === 1 && now > baitUntil + TOUCH.baitCooldownMs && Math.abs(d.x - watch[0].x) < 50 && Math.random() < dt * tuning.baitRate) {
              d.setData("baitUntil", now + TOUCH.baitLengthMs); d.setData("baitSide", watch[0].x < MID ? 1 : -1);
            }
            if (now < ((d.getData("baitUntil") as number | null) ?? 0)) targetX = watch[0].x + (d.getData("baitSide") as number) * TOUCH.baitDistance;
          }
          d.setData("guardX", targetX);
          d.x = Phaser.Math.Clamp(d.x + Phaser.Math.Clamp(targetX - d.x, -speed * dt, speed * dt), 42, FIELD_W - 42);
        }

        // The Main Line defender patrols the centre: it hunts attackers who must pass the middle and pressures anyone waiting near it.
        private guardMainLine(d: PhaserNamespace.GameObjects.Arc, attackers: PhaserNamespace.GameObjects.Arc[], dt: number) {
          let targetY = attackers.reduce((sum, a) => sum + a.y, 0) / attackers.length;
          let best = 0.25;
          for (const a of attackers) {
            const { aimX } = this.attackerIntent(a);
            const passing = (a.x - MID) * (aimX - MID) <= 0;
            let score = passing ? 1.6 : Math.max(0, 1 - Math.abs(a.x - MID) / 220) * 1.4;
            score -= Math.abs(a.y - d.y) / 450;
            if (a === this.aiTarget) score += 0.4;
            if (score > best) { best = score; targetY = a.y; }
          }
          d.setData("guardY", targetY);
          const speed = TOUCH.defenderSpeed * this.defense().speed * TOUCH.mainDefenderMultiplier;
          d.y = Phaser.Math.Clamp(d.y + Phaser.Math.Clamp(targetY - d.y, -speed * dt, speed * dt), 52, 518);
        }

        private chooseComputerTarget() {
          const moving = [this.runner, ...this.teammates].filter((player) => {
            const goal = this.goalOf(player) as { x: number; y: number } | null;
            return Boolean(player?.active && goal && Number.isFinite(goal.y) && goal.y !== player.y);
          });
          return moving.sort((a, b) => this.threatScore(b) - this.threatScore(a))[0] ?? null;
        }

        private threatScore(player: PhaserNamespace.GameObjects.Arc) {
          const goal = this.goalOf(player) as { x: number; y: number };
          const returning = goal.y > player.y;
          const progress = Phaser.Math.Clamp(returning ? (player.y - 72) / 420 : (492 - player.y) / 420, 0, 1);
          const trapLine = this.nextTrapLine(player);
          let lineExposure = 0.5;
          if (trapLine !== null) {
            const projected = this.projectedX(player, trapLine);
            const lineDefender = this.defenders.find((defender) => defender.getData("lineY") === trapLine);
            if (lineDefender) lineExposure = Phaser.Math.Clamp(Math.abs(projected - lineDefender.x) / 360, 0, 1);
          }
          const crossesMain = (player.x - MID) * (goal.x - MID) <= 0;
          let mainExposure = 0.65;
          if (crossesMain) {
            const crossingY = this.projectedXAtMain(player);
            mainExposure = Phaser.Math.Clamp(Math.abs(crossingY - this.mainDefender.y) / 260, 0, 1);
          }
          const approachingLine = trapLine === null ? 0 : 1 - Phaser.Math.Clamp(Math.abs(player.y - trapLine) / 170, 0, 1);
          return progress * 1.6 + lineExposure * 1.15 + mainExposure * 0.9 + approachingLine * 0.35;
        }

        private projectedXAtMain(player: PhaserNamespace.GameObjects.Arc) {
          const goal = this.goalOf(player) as { x: number; y: number };
          if (Math.abs(goal.x - player.x) < 1) return player.y;
          const ratio = Phaser.Math.Clamp((MID - player.x) / (goal.x - player.x), 0, 1);
          return player.y + (goal.y - player.y) * ratio;
        }

        private nextTrapLine(player: PhaserNamespace.GameObjects.Arc) {
          const goal = this.goalOf(player) as { x: number; y: number } | null;
          if (!goal) return null;
          const returning = goal.y > player.y;
          const lines = returning ? [132, 222, 312, 402] : [402, 312, 222, 132];
          return lines.find((lineY) => returning ? player.y < lineY && goal.y > lineY : player.y > lineY && goal.y < lineY) ?? null;
        }

        private projectedX(player: PhaserNamespace.GameObjects.Arc, lineY: number) {
          const goal = this.goalOf(player) as { x: number; y: number } | null;
          if (!goal || Math.abs(goal.y - player.y) < 1) return player.x;
          const ratio = Phaser.Math.Clamp((lineY - player.y) / (goal.y - player.y), 0, 1);
          return Phaser.Math.Clamp(player.x + (goal.x - player.x) * ratio, 42, FIELD_W - 42);
        }

        // The human-controlled attacker has no set route, so the defenders predict one from how that player is moving.
        private goalOf(player: PhaserNamespace.GameObjects.Arc) {
          const goal = player.getData("goal") as { x: number; y: number } | null;
          if (goal || !this.humanAttacks || player !== this.selectedPlayer) return goal;
          const y = player.getData("direction") === -1 ? 492 : 72;
          const vel = (player.getData("vel") as { x: number; y: number } | undefined) ?? { x: 0, y: 0 };
          const towardGoal = vel.y !== 0 && Math.sign(vel.y) === Math.sign(y - player.y);
          const x = towardGoal ? player.x + vel.x / Math.abs(vel.y) * Math.abs(y - player.y) : player.x + vel.x * 120;
          return { x: Phaser.Math.Clamp(x, 42, FIELD_W - 42), y };
        }

        private chooseOpenLane() {
          const options = [70, 140, 210, FIELD_W - 210, FIELD_W - 140, FIELD_W - 70];
          return options.sort((a, b) => this.clearance(b) - this.clearance(a))[0];
        }

        private clearance(x: number) {
          return Math.min(...this.defenders.map((defender) => defender.getData("main") ? Math.abs(x - MID) : Math.abs(x - defender.x)));
        }

        private moveComputerAttackers(dt: number, excluded?: PhaserNamespace.GameObjects.Arc) {
          for (const attacker of [this.runner, ...this.teammates]) {
            if (attacker !== excluded) this.thinkAttacker(attacker, dt, TOUCH.attackerSpeed * this.attack().speed * dt);
          }
        }

        // Each computer attacker works one line at a time: wait in the space between lines, slide sideways to find a gap, and
        // only dash across when that line's defender is too far away to make the touch. Line defenders cannot leave their line,
        // so only the Main Line defender can reach a waiting attacker.
        private thinkAttacker(a: PhaserNamespace.GameObjects.Arc, dt: number, step: number) {
          if (a.getData("courage") == null) { const [low, high] = this.attack().courage; a.setData("courage", low + Math.random() * (high - low)); a.setData("seed", Math.random() * 100); }
          const up = a.getData("direction") !== -1;
          const main = this.mainDefender;
          if (Phaser.Math.Distance.Between(a.x, a.y, main.x, main.y) < 75) {
            a.setData("mode", "hold"); a.setData("think", 0);
            this.stepAttacker(a, a.x + (a.x >= MID ? 60 : -60), a.y, step * 1.2);
            return;
          }
          if (a.getData("mode") === "cross") {
            const to = a.getData("crossTo") as { x: number; y: number };
            const crossLine = a.getData("crossLine") as number;
            const before = up ? a.y > crossLine + 10 : a.y < crossLine - 10;
            // Turn back if the defender closes the gap before the attacker reaches the line.
            if (before && !this.crossingSafe(a, crossLine, a.x, 0.85)) { a.setData("mode", "hold"); a.setData("think", 0); }
            else {
              a.setData("goal", to);
              if (this.stepAttacker(a, to.x, to.y, step * TOUCH.dashMultiplier)) { a.setData("mode", "hold"); a.setData("think", 0); }
              return;
            }
          }
          const line = this.nextLineFor(a);
          if (line === null) {
            // Only an undefended line is ahead: the turn line at the top, or home at the start line.
            const to = { x: a.x, y: up ? 66 : 500 };
            a.setData("goal", to);
            this.stepAttacker(a, to.x, to.y, step * 1.1);
            return;
          }
          const holdY = up ? line + 45 : line - 45;
          const beyondY = up ? line - 45 : line + 45;
          const holdTime = ((a.getData("holdTime") as number | null) ?? 0) + dt;
          let think = ((a.getData("think") as number | null) ?? 0) - dt;
          let targetX = (a.getData("targetX") as number | null) ?? a.x;
          if (think <= 0) { targetX = this.pickCrossing(a, line); think = 0.25 + Math.random() * 0.45; }
          a.setData("holdTime", holdTime); a.setData("think", think); a.setData("targetX", targetX); a.setData("mode", "hold");
          a.setData("goal", { x: targetX, y: beyondY });
          this.stepAttacker(a, targetX, holdY, step);
          // Waiting makes an attacker bolder, so a defender cannot freeze them forever.
          const courage = Math.max(0.75, (a.getData("courage") as number) - holdTime * this.attack().impatience);
          if (Math.abs(a.y - holdY) < 8 && this.crossingSafe(a, line, a.x, courage)) {
            a.setData("mode", "cross"); a.setData("crossLine", line); a.setData("holdTime", 0);
            a.setData("crossTo", { x: Phaser.Math.Clamp(a.x + (targetX - a.x) * 0.3, 44, FIELD_W - 44), y: beyondY });
          }
        }

        private nextLineFor(a: PhaserNamespace.GameObjects.Arc) {
          return a.getData("direction") !== -1
            ? [402, 312, 222, 132].find((lineY) => a.y > lineY + 4) ?? null
            : [132, 222, 312, 402].find((lineY) => a.y < lineY - 4) ?? null;
        }

        private crossingSafe(a: PhaserNamespace.GameObjects.Arc, line: number, x: number, courage: number) {
          if (Math.abs(x - MID) < 55 && Math.abs(this.mainDefender.y - line) < 120) return false;
          const guard = this.defenders.find((defender) => defender.getData("lineY") === line);
          if (!guard) return true;
          const gap = Math.abs(guard.x - x) - 26;
          if (gap <= 0) return false;
          const guardSpeed = !this.humanAttacks && guard === this.selectedPlayer ? TOUCH.humanSpeed * 0.8 : TOUCH.defenderSpeed * this.defense().speed;
          const attackerTime = (Math.abs(a.y - line) + 28) / (TOUCH.attackerSpeed * this.attack().speed * TOUCH.dashMultiplier);
          return gap / guardSpeed > attackerTime * courage;
        }

        private pickCrossing(a: PhaserNamespace.GameObjects.Arc, line: number) {
          const guard = this.defenders.find((defender) => defender.getData("lineY") === line);
          const seed = a.getData("seed") as number;
          const others = [this.runner, ...this.teammates].filter((other) => other !== a);
          let best = a.x; let bestScore = -Infinity;
          for (let x = 60; x <= FIELD_W - 60; x += 30) {
            if (Math.abs(x - MID) < 60) continue;
            // Prefer gaps far from the guard and close to hand, with a personal bias so attackers do not all pick the same spot.
            let score = (guard ? Math.min(Math.abs(x - guard.x), 400) : 400) - Math.abs(x - a.x) * 0.55 + Math.sin(x * 0.04 + seed) * 35;
            if ((x - MID) * (a.x - MID) < 0 && Math.abs(this.mainDefender.y - a.y) < 110) score -= 500;
            for (const other of others) if (Math.abs(other.y - a.y) < 60 && Math.abs(other.x - x) < 70) score -= 90;
            if (score > bestScore) { bestScore = score; best = x; }
          }
          return best;
        }

        // Moves an attacker toward a point without stepping onto the Main Line while its defender is close. Returns true on arrival.
        private stepAttacker(a: PhaserNamespace.GameObjects.Arc, tx: number, ty: number, step: number) {
          const dx = tx - a.x; const dy = ty - a.y; const distance = Math.hypot(dx, dy);
          if (distance < 1) return true;
          const move = Math.min(step, distance);
          let nx = a.x + dx / distance * move;
          const ny = a.y + dy / distance * move;
          if (Math.abs(nx - MID) < 40 && Math.abs(nx - MID) < Math.abs(a.x - MID) && Math.abs(this.mainDefender.y - ny) < 85) nx = a.x;
          a.setPosition(Phaser.Math.Clamp(nx, 44, FIELD_W - 44), ny);
          return distance <= step;
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: FIELD_W,
        height: 600,
        backgroundColor: "#174b38",
        scene: TouchField,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
      });
      gameRef.current = game;
    });

    const status = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    const state = (event: Event) => setIsPlaying((event as CustomEvent<{ playing: boolean }>).detail.playing);
    const matchUpdate = (event: Event) => setMatch((event as CustomEvent<MatchState>).detail);
    window.addEventListener("touch-status", status);
    window.addEventListener("touch-state", state);
    window.addEventListener("touch-match", matchUpdate);
    return () => {
      disposed = true;
      window.removeEventListener("touch-status", status);
      window.removeEventListener("touch-state", state);
      window.removeEventListener("touch-match", matchUpdate);
      game?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  function startGame() { window.dispatchEvent(new Event("touch-start")); }
  function backToGames() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onBack();
  }
  function changeLevel(value: Level) { setLevel(value); window.dispatchEvent(new CustomEvent("touch-level", { detail: value })); }
  function newMatch() { window.dispatchEvent(new Event("touch-new-match")); }
  function setPlayerCount(value: number) { setPlayers(value); window.dispatchEvent(new CustomEvent("touch-count", { detail: value })); }
  function move(x: number, y: number) {
    inputRef.current = { x, y };
    window.dispatchEvent(new CustomEvent("touch-move", { detail: { x, y } }));
  }

  const result = match.you > match.them ? "You win!" : match.you < match.them ? "The CPU wins" : "It's a draw";
  return (
    <main className="game-screen">
      <header className="game-topbar">
        <button className="back-button" onClick={backToGames}>← <span>GAMES</span></button>
        <div className="game-title"><span className="brand-mark">S</span><strong>TOUCH</strong><small>TURN {match.turn}/{match.totalTurns}</small></div>
        <div className="game-settings">
          <label className="player-select">LEVEL <select value={level} onChange={(e) => changeLevel(e.target.value as Level)}>{(Object.keys(LEVELS) as Level[]).map((key) => <option key={key} value={key}>{LEVELS[key].label}</option>)}</select></label>
          <label className="player-select">TEAM <select value={players} onChange={(e) => setPlayerCount(Number(e.target.value))}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
      </header>
      <div className="game-stage"><div className="game-frame touch-frame">
        <div className="game-host" ref={hostRef} />
        <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>
        <div className="scoreboard" aria-label={`Score: you ${match.you}, CPU ${match.them}`}><span>YOU<b>{match.you}</b></span><span>CPU<b>{match.them}</b></span><small>TURN {match.turn}/{match.totalTurns}</small></div>
        {match.over
          ? <div className="match-result" role="dialog" aria-label="Match result"><small>FULL TIME</small><strong>{result}</strong><span>{match.you} – {match.them}</span><button onClick={newMatch}>▶ PLAY AGAIN</button></div>
          : !isPlaying && <button className="start-overlay" onClick={startGame}><span>▶</span>{notice.kind === "success" ? "NEXT RUN" : notice.kind === "danger" ? "NEXT TURN" : "START GAME"}</button>}
      </div></div>
      <div className="game-bottom"><span className="game-help">Tap a player to control them. Move with WASD / arrow keys or the joystick.</span><div className="mobile-controls"><Joystick onMove={move} /></div><span className="game-help">Safe return home: +1 · a touch swaps sides · {TOUCH.turnsPerTeam} turns each.</span></div>
    </main>
  );
}
