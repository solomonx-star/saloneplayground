"use client";

import { useEffect, useRef, useState } from "react";
import type PhaserNamespace from "phaser";

type Notice = { text: string; kind: "ready" | "danger" | "success" };

export default function TouchGame({ startDirectly = false, onBack }: { startDirectly?: boolean; onBack?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Your team is attacking. Reach the far line and return!", kind: "ready" });
  const [players, setPlayers] = useState(4);
  const [round, setRound] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [view, setView] = useState<"library" | "touch">(startDirectly ? "touch" : "library");
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null);
  const inputRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (view !== "touch") return;
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;

    void import("phaser").then((module) => {
      if (disposed || !hostRef.current) return;
      const Phaser = module.default;

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

        constructor() { super("TouchField"); }

        create() {
          const w = 960;
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
            const defender = this.add.circle(170 + (i % 2) * 620, y, 13, 0xf2a354).setStrokeStyle(3, 0xffe3b1);
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
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener("touch-start", this.start as EventListener);
            window.removeEventListener("touch-count", this.setCount as EventListener);
            window.removeEventListener("touch-move", this.moveBy as EventListener);
            window.removeEventListener("touch-reset", this.reset as EventListener);
          });
          this.reset();
        }

        private start = () => { this.reset(); this.active = true; window.dispatchEvent(new CustomEvent("touch-state", { detail: { playing: true } })); };
        private setCount = (event: Event) => { this.count = (event as CustomEvent<number>).detail; this.reset(); };
        private selectPlayer(x: number, y: number) {
          if (!this.active) return;
          const ownPlayers = this.humanAttacks ? [this.runner, ...this.teammates] : this.defenders;
          const hit = ownPlayers.find((player) => Phaser.Math.Distance.Between(x, y, player.x, player.y) < 25);
          if (hit) {
            this.selectedPlayer?.setStrokeStyle(2, 0xe7f8ff);
            this.selectedPlayer = hit;
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
          this.runner.setPosition(480 - (this.count - 1) / 2 * 38, 544);
          this.runner.setData("goal", null);
          this.runner.setData("direction", 1);
          this.defenders.forEach((defender, i) => {
            const friendly = !this.humanAttacks;
            defender.setFillStyle(friendly ? 0x69b8d8 : 0xf2a354);
            defender.setStrokeStyle(3, friendly ? 0xe7f8ff : 0xffe3b1);
            defender.setData("goal", null);
            const lineY = defender.getData("lineY") as number | undefined;
            const homeX = lineY === undefined ? 480 : i % 2 ? 790 : 170;
            defender.setPosition(homeX, lineY ?? 300);
            defender.setData("homeX", homeX);
          });
          this.runner.setPosition(480 - (this.count - 1) / 2 * 38, 544);
          this.runner.setFillStyle(this.humanAttacks ? 0x69c6ef : 0xe57859);
          this.runnerLabel.setText("1").setPosition(this.runner.x - 3, this.runner.y + 16);
          this.mainDefender.setFillStyle(this.humanAttacks ? 0xf2a354 : 0x69b8d8);
          const text = this.humanAttacks
            ? "Choose an attacker to control. Your teammates run on their own."
            : "You control the Main Line defender. Your team covers the other lines.";
          window.dispatchEvent(new CustomEvent("touch-status", { detail: { text, kind: "ready" } }));
          window.dispatchEvent(new CustomEvent("touch-state", { detail: { playing: false } }));
          for (let i = 1; i < this.count; i++) {
            const teammate = this.add.circle(480 + (i - (this.count - 1) / 2) * 38, 544, 12, this.humanAttacks ? 0x91d7f3 : 0xe57859).setStrokeStyle(2, 0xffe3b1).setDepth(5);
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
          const t = _time / 1000;
          this.drawOrders();
          if (!this.active) return;
          let dx = 0; let dy = 0;
          if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
          if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
          if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
          if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
          dx += inputRef.current.x; dy += inputRef.current.y;
          if (this.humanAttacks) {
            this.moveComputerDefenders(118 * dt);
            this.moveComputerAttackers(120 * dt, t, this.selectedPlayer ?? undefined);
            if (this.selectedPlayer) this.moveOrderedPlayer(this.selectedPlayer, 205 * dt, dx, dy);
          } else {
            this.moveComputerSupportDefenders(118 * dt, t);
            if (this.selectedPlayer) this.moveOrderedPlayer(this.selectedPlayer, 205 * dt, dx, dy);
            this.moveComputerAttackers(120 * dt, t);
          }

          this.runnerLabel.setPosition(this.runner.x - 3, this.runner.y + 16);
          this.teammates.forEach((player) => (player.getData("tag") as PhaserNamespace.GameObjects.Text).setPosition(player.x - 3, player.y + 15));
          for (const attacker of [this.runner, ...this.teammates]) {
            if (attacker.y <= 72) attacker.setData("direction", -1);
            if (attacker.getData("direction") === -1 && attacker.y >= 492) {
              window.dispatchEvent(new CustomEvent("touch-round", { detail: { won: true } }));
              this.end(this.humanAttacks ? `${attacker.getData("name")} made it home! Your team attacks again.` : "An opposing player made it home. Their team attacks again.", this.humanAttacks ? "success" : "danger");
              return;
            }
            const touched = this.defenders.some((defender) => Phaser.Math.Distance.Between(attacker.x, attacker.y, defender.x, defender.y) < 26);
            if (touched) {
              this.humanAttacks = !this.humanAttacks;
              window.dispatchEvent(new CustomEvent("touch-round", { detail: { won: false } }));
              this.end(this.humanAttacks ? "Touch! The other team is out. Your team attacks next." : "Touched! Your team defends next; the other team attacks.", "danger");
              return;
            }
          }
        }

        private drawOrders() {
          this.orderGraphics.clear();
          if (this.humanAttacks) {
            const signature = [this.runner, ...this.teammates].map((player) => {
              const goal = player.getData("goal") as { x: number; y: number } | null;
              if (!goal) return "";
              const nextLine = this.nextTrapLine(player) ?? "clear";
              const fieldSide = player.y < 492 ? "field" : "start-side";
              return `${player.getData("name")}:${goal.x.toFixed(0)},${goal.y.toFixed(0)}:${nextLine}:${fieldSide}`;
            }).join("|");
            if (signature !== this.aiOrderSignature) {
              this.aiOrderSignature = signature;
              this.aiTarget = this.chooseComputerTarget();
            }
          } else {
            this.aiOrderSignature = "";
            this.aiTarget = null;
          }
          if (this.aiTarget !== this.lastAnnouncedTarget) {
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
            for (const defender of this.defenders) {
              if (defender.getData("main")) {
                const threat = this.aiTarget;
                if (threat) {
                  const goal = threat.getData("goal") as { x: number; y: number };
                  if ((threat.x - 480) * (goal.x - 480) <= 0) {
                    const ratio = Math.abs(goal.x - threat.x) < 1 ? 0 : Phaser.Math.Clamp((480 - threat.x) / (goal.x - threat.x), 0, 1);
                    const y = threat.y + (goal.y - threat.y) * ratio;
                    this.orderGraphics.lineStyle(2, 0xf2a354, 0.58).lineBetween(defender.x, defender.y, 480, y);
                  }
                }
              } else {
                const lineY = defender.getData("lineY") as number;
                const threat = this.aiTarget;
                const trapLine = threat ? this.nextTrapLine(threat) : null;
                const supportLine = trapLine === null ? null : (threat?.y ?? 0) < ((threat?.getData("goal") as { y: number } | null)?.y ?? 0) ? trapLine + 90 : trapLine - 90;
                if (threat && (lineY === trapLine || lineY === supportLine)) {
                  const trapX = this.projectedX(threat, lineY);
                  this.orderGraphics.lineStyle(1, 0xf2a354, 0.36).lineBetween(defender.x, defender.y, trapX, lineY);
                }
              }
            }
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
          } else if (lineY !== undefined) player.x = Phaser.Math.Clamp(player.x + axisX * step, 42, 918);
          else if (player.getData("main")) player.y = Phaser.Math.Clamp(player.y + axisY * step, 52, 518);
          else {
            const length = Math.hypot(axisX, axisY);
            if (length > 0) player.setPosition(Phaser.Math.Clamp(player.x + axisX / length * step, 44, 916), Phaser.Math.Clamp(player.y + axisY / length * step, 44, 556));
          }
        }

        private moveComputerDefenders(step: number) {
          const threat = this.aiTarget;
          if (!threat) return;
          const trapLine = this.nextTrapLine(threat);
          const returnRun = ((threat.getData("goal") as { y: number }).y) > threat.y;
          const supportLine = trapLine === null ? null : returnRun ? trapLine + 90 : trapLine - 90;
          for (const defender of this.defenders) {
            if (defender.getData("main")) {
              const goal = threat.getData("goal") as { x: number; y: number };
              let targetY = 300;
              if ((threat.x - 480) * (goal.x - 480) <= 0) {
                const crossing = Math.abs(goal.x - threat.x) > 1 ? Phaser.Math.Clamp((480 - threat.x) / (goal.x - threat.x), 0, 1) : 0;
                targetY = threat.y + (goal.y - threat.y) * crossing;
              }
              defender.y += Phaser.Math.Clamp(targetY - defender.y, -step * 1.25, step * 1.25);
            } else {
              const lineY = defender.getData("lineY") as number;
              const targetX = lineY === trapLine || lineY === supportLine ? this.projectedX(threat, lineY) : defender.getData("homeX") as number;
              defender.x += Phaser.Math.Clamp(targetX - defender.x, -step, step);
            }
          }
        }

        private moveComputerSupportDefenders(step: number, _time: number) {
          const threat = this.chooseComputerTarget();
          if (!threat) return;
          const trapLine = this.nextTrapLine(threat);
          const returning = ((threat.getData("goal") as { y: number }).y) > threat.y;
          const supportLine = trapLine === null ? null : returning ? trapLine + 90 : trapLine - 90;
          for (const defender of this.defenders) {
            if (defender === this.selectedPlayer) continue;
            if (defender.getData("main")) {
              const crossingY = this.projectedXAtMain(threat);
              const goal = threat.getData("goal") as { x: number; y: number };
              const intersects = (threat.x - 480) * (goal.x - 480) <= 0;
              const targetY = intersects ? crossingY : 300;
              defender.y += Phaser.Math.Clamp(targetY - defender.y, -step, step);
            } else {
              const lineY = defender.getData("lineY") as number;
              const targetX = lineY === trapLine || lineY === supportLine ? this.projectedX(threat, lineY) : defender.getData("homeX") as number;
              defender.x += Phaser.Math.Clamp(targetX - defender.x, -step, step);
            }
          }
        }

        private chooseComputerTarget() {
          const moving = [this.runner, ...this.teammates].filter((player) => {
            const goal = player.getData("goal") as { x: number; y: number } | null;
            return Boolean(player?.active && goal && Number.isFinite(goal.y) && goal.y !== player.y);
          });
          return moving.sort((a, b) => this.threatScore(b) - this.threatScore(a))[0] ?? null;
        }

        private threatScore(player: PhaserNamespace.GameObjects.Arc) {
          const goal = player.getData("goal") as { x: number; y: number };
          const returning = goal.y > player.y;
          const progress = Phaser.Math.Clamp(returning ? (player.y - 72) / 420 : (492 - player.y) / 420, 0, 1);
          const trapLine = this.nextTrapLine(player);
          let lineExposure = 0.5;
          if (trapLine !== null) {
            const projected = this.projectedX(player, trapLine);
            const lineDefender = this.defenders.find((defender) => defender.getData("lineY") === trapLine);
            if (lineDefender) lineExposure = Phaser.Math.Clamp(Math.abs(projected - lineDefender.x) / 360, 0, 1);
          }
          const crossesMain = (player.x - 480) * (goal.x - 480) <= 0;
          let mainExposure = 0.65;
          if (crossesMain) {
            const crossingY = this.projectedXAtMain(player);
            mainExposure = Phaser.Math.Clamp(Math.abs(crossingY - this.mainDefender.y) / 260, 0, 1);
          }
          const approachingLine = trapLine === null ? 0 : 1 - Phaser.Math.Clamp(Math.abs(player.y - trapLine) / 170, 0, 1);
          return progress * 1.6 + lineExposure * 1.15 + mainExposure * 0.9 + approachingLine * 0.35;
        }

        private projectedXAtMain(player: PhaserNamespace.GameObjects.Arc) {
          const goal = player.getData("goal") as { x: number; y: number };
          if (Math.abs(goal.x - player.x) < 1) return player.y;
          const ratio = Phaser.Math.Clamp((480 - player.x) / (goal.x - player.x), 0, 1);
          return player.y + (goal.y - player.y) * ratio;
        }

        private nextTrapLine(player: PhaserNamespace.GameObjects.Arc) {
          const goal = player.getData("goal") as { x: number; y: number } | null;
          if (!goal) return null;
          const returning = goal.y > player.y;
          const lines = returning ? [132, 222, 312, 402] : [402, 312, 222, 132];
          return lines.find((lineY) => returning ? player.y < lineY && goal.y > lineY : player.y > lineY && goal.y < lineY) ?? null;
        }

        private projectedX(player: PhaserNamespace.GameObjects.Arc, lineY: number) {
          const goal = player.getData("goal") as { x: number; y: number } | null;
          if (!goal || Math.abs(goal.y - player.y) < 1) return player.x;
          const ratio = Phaser.Math.Clamp((lineY - player.y) / (goal.y - player.y), 0, 1);
          return Phaser.Math.Clamp(player.x + (goal.x - player.x) * ratio, 42, 918);
        }

        private chooseOpenLane() {
          const options = [110, 230, 350, 610, 730, 850];
          return options.sort((a, b) => this.clearance(b) - this.clearance(a))[0];
        }

        private clearance(x: number) {
          return Math.min(...this.defenders.map((defender) => defender.getData("main") ? Math.abs(x - 480) : Math.abs(x - defender.x)));
        }

        private moveComputerAttackers(step: number, time: number, excluded?: PhaserNamespace.GameObjects.Arc) {
          for (const attacker of [this.runner, ...this.teammates]) {
            if (attacker === excluded) continue;
            let goal = attacker.getData("goal") as { x: number; y: number } | null;
            if (!goal) {
              const y = attacker.getData("direction") === -1 ? 492 : 72;
              goal = { x: this.chooseOpenLane(), y };
              attacker.setData("goal", goal);
            }
            const dx = goal.x - attacker.x; const dy = goal.y - attacker.y; const distance = Math.hypot(dx, dy);
            if (distance <= step + 2) {
              attacker.setPosition(goal.x, goal.y);
              if (goal.y <= 72) { attacker.setData("direction", -1); attacker.setData("goal", { x: this.chooseOpenLane(), y: 492 }); }
              else attacker.setData("goal", { x: goal.x + Math.sin(time + goal.x) * 28, y: 492 });
            } else attacker.setPosition(attacker.x + dx / distance * step, attacker.y + dy / distance * step);
          }
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: 960,
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
    const roundResult = () => setRound((r) => r + 1);
    window.addEventListener("touch-status", status);
    window.addEventListener("touch-state", state);
    window.addEventListener("touch-round", roundResult);
    return () => {
      disposed = true;
      window.removeEventListener("touch-status", status);
      window.removeEventListener("touch-state", state);
      window.removeEventListener("touch-round", roundResult);
      game?.destroy(true);
      gameRef.current = null;
    };
  }, [view]);

  function startGame() { window.dispatchEvent(new Event("touch-start")); }
  function openTouch() {
    const request = document.documentElement.requestFullscreen?.();
    request?.catch(() => undefined);
    setView("touch");
  }
  function backToGames() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onBack?.();
    setView("library");
  }
  function setPlayerCount(value: number) { setPlayers(value); window.dispatchEvent(new CustomEvent("touch-count", { detail: value })); }
  function move(x: number, y: number) {
    inputRef.current = { x, y };
    window.dispatchEvent(new CustomEvent("touch-move", { detail: { x, y } }));
  }

  return view === "library" ? (
    <main className="shell library-screen">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Salone Playground home"><span className="brand-mark">S</span><span>SALONE<span className="brand-light">PLAYGROUND</span></span></a>
        <div className="topbar-right"><span className="online-dot" /> SIERRA LEONE · CHILDHOOD GAMES</div>
      </header>
      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow">THE PLAYGROUND IS OPEN</p><h1>Old-school games.<br /><em>New memories.</em></h1><p className="intro">A home for the games we grew up playing. Start with Touch — quick feet, sharp turns, and a safe run back home.</p>
          <div className="hero-tags"><span>🏃 TOUCH</span><span>🇸🇱 SALONE ROOTS</span><span>🎮 PLAY NOW</span></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="sun" /><div className="hill hill-back" /><div className="hill hill-front" /><div className="art-player player-one">✦</div><div className="art-player player-two">✦</div><div className="art-player player-three">✦</div><div className="art-stamp">FREETOWN<br /><small>PLAYGROUND</small></div></div>
      </section>
      <section className="game-section" aria-labelledby="games-heading">
        <div className="section-heading"><div><p className="eyebrow">PICK UP AND PLAY</p><h2 id="games-heading">The games shelf</h2><p className="section-sub">Familiar playground games, ready for a new round.</p></div></div>
        <div className="library-grid">
          <button className="game-card touch-card" onClick={openTouch}><span className="game-card-icon">↗</span><span className="game-card-meta">GAME 01 · PLAY NOW</span><strong>Touch</strong><span className="game-card-desc">Run the lines, turn back, and make it home without getting touched.</span><span className="game-card-cta">PLAY TOUCH <b>→</b></span></button>
          {["Skipping Rope", "Hide and Seek", "Six Cup", "Balance Ball"].map((name, i) => <article className="game-card coming-card" key={name}><span className="game-card-icon">{["〰", "◉", "♧", "◌"][i]}</span><span className="game-card-meta">GAME 0{i + 2} · COMING SOON</span><strong>{name}</strong><span className="game-card-desc">A childhood favourite from the Salone playground.</span><span className="game-card-cta">COMING SOON</span></article>)}
        </div>
      </section>
      <footer><span>MADE FOR THE GAMES WE GREW UP WITH.</span><span>MORE GAMES COMING SOON <b>✳</b></span></footer>
    </main>
  ) : (
    <main className="game-screen">
      <header className="game-topbar"><button className="back-button" onClick={backToGames}>← <span>GAMES</span></button><div className="game-title"><span className="brand-mark">S</span><strong>TOUCH</strong><small>ROUND {String(round).padStart(2, "0")}</small></div><label className="player-select">TEAM <select value={players} onChange={(e) => setPlayerCount(Number(e.target.value))}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label></header>
      <div className="game-stage"><div className="game-frame"><div className="game-host" ref={hostRef} /><div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "success" ? "✓" : notice.kind === "danger" ? "!" : "↗"}</span>{notice.text}</div>{!isPlaying && <button className="start-overlay" onClick={startGame}><span>▶</span>{notice.kind === "success" ? "NEXT RUN" : notice.kind === "danger" ? "NEXT ROUND" : "START GAME"}</button>}</div></div>
      <div className="game-bottom"><span className="game-help">Select a teammate on the field, then move with WASD / arrow keys.</span><div className="mobile-controls" aria-label="Mobile movement controls"><button onPointerDown={() => move(-1, 0)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)} aria-label="Move left">←</button><div><button onPointerDown={() => move(0, -1)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)} aria-label="Move up">↑</button><button onPointerDown={() => move(0, 1)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)} aria-label="Move down">↓</button></div><button onPointerDown={() => move(1, 0)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)} aria-label="Move right">→</button></div><span className="game-help">Touch any attacker to end the attempt · one safe return wins.</span></div>
    </main>
  );
}
