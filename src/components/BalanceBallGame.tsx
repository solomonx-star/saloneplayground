"use client";

import { useEffect, useRef, useState } from "react";
import type PhaserNamespace from "phaser";
import TouchGame from "@/components/touch/TouchGame";

type Status = { text: string; kind: "ready" | "danger" | "success" };

export default function BalanceBallGame() {
  const host = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"library" | "game">("library");
  const [touchOpen, setTouchOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ text: "Choose Balance Ball to play.", kind: "ready" });
  const [playing, setPlaying] = useState(false);
  const [humanMiddle, setHumanMiddle] = useState(true);
  const [score, setScore] = useState(0);
  const [dodger, setDodger] = useState(1);

  useEffect(() => {
    if (screen !== "game") return;
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;
    void import("phaser").then((module) => {
      if (disposed || !host.current) return;
      const Phaser = module.default;
      class BalanceField extends Phaser.Scene {
        private players: PhaserNamespace.GameObjects.Arc[] = [];
        private throwers: PhaserNamespace.GameObjects.Arc[] = [];
        private balls: PhaserNamespace.GameObjects.Arc[] = [];
        private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
        private selected!: PhaserNamespace.GameObjects.Arc;
        private middle = true;
        private active = false;
        private cooldown = 0;
        // Index of the player currently in the middle; the others wait on the bench or are out.
        private turn = 0;
        private nextUp?: PhaserNamespace.Time.TimerEvent;
        private graphics!: PhaserNamespace.GameObjects.Graphics;
        constructor() { super("BalanceField"); }
        create() {
          const g = this.add.graphics();
          g.fillGradientStyle(0x236c4c, 0x236c4c, 0x1c5b40, 0x1c5b40, 1).fillRoundedRect(14, 14, 932, 572, 20);
          g.lineStyle(2, 0xe0e8bb, 0.75).strokeRoundedRect(32, 34, 896, 532, 12);
          g.lineStyle(2, 0xf4db88, 0.85).lineBetween(185, 35, 185, 565).lineBetween(775, 35, 775, 565);
          this.add.text(56, 49, "THROWING TEAM", { fontFamily: "Arial", fontSize: "12px", color: "#e5f0dc", fontStyle: "bold" });
          this.add.text(806, 49, "THROWING TEAM", { fontFamily: "Arial", fontSize: "12px", color: "#e5f0dc", fontStyle: "bold" });
          this.add.text(440, 49, "DODGE ZONE", { fontFamily: "Arial", fontSize: "12px", color: "#e5f0dc", fontStyle: "bold" });
          this.add.text(423, 550, "LIGHT SOCK BALL", { fontFamily: "Arial", fontSize: "10px", color: "#d7e8d2" }).setAlpha(0.8);
          this.graphics = this.add.graphics().setDepth(2);
          this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as typeof this.keys;
          this.input.on("pointerdown", (p: PhaserNamespace.Input.Pointer) => { if (this.active && !this.middle) this.throwBall(p.worldX, p.worldY); });
          window.addEventListener("balance-start", this.start);
          window.addEventListener("balance-move", this.move);
          window.addEventListener("balance-state-reset", this.reset);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener("balance-start", this.start);
            window.removeEventListener("balance-move", this.move);
            window.removeEventListener("balance-state-reset", this.reset);
          });
          this.buildTeams();
          this.reset();
        }
        private start = () => { this.active = true; this.cooldown = 0.8; this.notice(this.playHint(), "ready"); window.dispatchEvent(new CustomEvent("balance-playing", { detail: true })); };
        private playHint() { return this.middle ? `Player ${this.turn + 1} of 3 is in the middle. Dodge the sock ball!` : `Your team is throwing at player ${this.turn + 1} of 3. Tap the field to aim and throw.`; }
        private move = (e: Event) => { (window as Window & { balanceInput?: { x: number; y: number } }).balanceInput = (e as CustomEvent<{x:number;y:number}>).detail; };
        private reset = () => { this.active = false; this.nextUp?.remove(); this.turn = 0; this.balls.forEach((b) => b.destroy()); this.balls = []; this.buildTeams(); this.positionTeams(); this.notice("Get ready for the next turn.", "ready"); window.dispatchEvent(new CustomEvent("balance-playing", { detail: false })); };
        private buildTeams() {
          this.players.forEach((p) => p.destroy()); this.throwers.forEach((p) => p.destroy()); this.players = []; this.throwers = [];
          for (let i = 0; i < 3; i++) this.players.push(this.add.circle(480, 300, 14, 0x69c6ef).setStrokeStyle(3, 0xe7f8ff).setDepth(3));
          for (const x of [85, 875]) this.throwers.push(this.add.circle(x, 300, 15, 0xf2a354).setStrokeStyle(3, 0xffe3b1).setDepth(3));
          this.selected = this.throwers[0];
        }
        private positionTeams() {
          // The current dodger stands in the middle, players still to come wait on the bench, and players already hit leave the field.
          this.players.forEach((p, i) => {
            p.setFillStyle(this.middle ? 0x69c6ef : 0xf2a354).setStrokeStyle(3, this.middle ? 0xe7f8ff : 0xffe3b1);
            if (i < this.turn) p.setVisible(false);
            else if (i === this.turn) p.setVisible(true).setPosition(480, 300).setAlpha(1).setScale(1);
            else p.setVisible(true).setPosition(460 + (i - this.turn - 1) * 40, 86).setAlpha(0.5).setScale(0.75);
          });
          if (this.middle) this.players[this.turn].setStrokeStyle(5, 0xf4df79);
          this.throwers.forEach((p, i) => p.setPosition(i ? 875 : 85, 220 + i * 160).setFillStyle(this.middle ? 0xf2a354 : 0x69c6ef).setStrokeStyle(3, 0xffe3b1));
          this.selected = this.throwers[0];
          if (!this.middle) this.selected.setStrokeStyle(5, 0xf4df79);
          window.dispatchEvent(new CustomEvent("balance-dodger", { detail: this.turn + 1 }));
        }
        private notice(text: string, kind: Status["kind"]) { window.dispatchEvent(new CustomEvent("balance-status", { detail: { text, kind } })); }
        private throwBall(x: number, y: number) {
          if (!this.active || this.middle || this.cooldown > 0) return;
          const source = this.throwers.reduce((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) <= Phaser.Math.Distance.Between(x, y, b.x, b.y) ? a : b);
          if (source !== this.selected) { this.selected.setStrokeStyle(3, 0xffe3b1); this.selected = source; source.setStrokeStyle(5, 0xf4df79); }
          const ball = this.add.circle(source.x, source.y, 9, 0xf4e5bd).setStrokeStyle(2, 0x876d45).setDepth(4);
          const dx = x - source.x, dy = y - source.y, len = Math.hypot(dx, dy) || 1;
          // The computer dodger only reacts to some throws, so the human team can land hits.
          ball.setData("vx", dx / len * 340); ball.setData("vy", dy / len * 340); ball.setData("seen", Math.random() < 0.55); this.balls.push(ball); this.cooldown = 0.65;
        }
        update(_time: number, delta: number) {
          const dt = Math.min(delta / 1000, 0.04); this.cooldown = Math.max(0, this.cooldown - dt); this.graphics.clear();
          if (!this.active) return;
          const dodger = this.players[this.turn];
          const input = (window as Window & { balanceInput?: {x:number;y:number} }).balanceInput ?? {x:0,y:0};
          if (this.middle) {
            let dx = input.x, dy = input.y;
            if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1; if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
            if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1; if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
            const magnitude = Math.hypot(dx, dy); if (magnitude) dodger.setPosition(Phaser.Math.Clamp(dodger.x + dx / magnitude * 210 * dt, 210, 750), Phaser.Math.Clamp(dodger.y + dy / magnitude * 210 * dt, 110, 540));
            if (this.cooldown <= 0) { this.launchAt(this.throwers[Math.floor(Math.random()*2)], dodger); this.cooldown = 1.45; }
          } else {
            const threat = this.balls.find((b) => b.getData("seen") && Phaser.Math.Distance.Between(b.x, b.y, dodger.x, dodger.y) < 170);
            if (threat) {
              const vx = threat.getData("vx") as number, vy = threat.getData("vy") as number, len = Math.hypot(vx, vy) || 1;
              const px = -vy / len, py = vx / len, side = Math.sign((dodger.x - threat.x) * px + (dodger.y - threat.y) * py) || 1;
              dodger.x += px * side * 150 * dt; dodger.y += py * side * 150 * dt;
            } else { dodger.x += Math.sin(_time / 430 + this.turn * 2) * 60 * dt; dodger.y += Math.cos(_time / 510 + this.turn) * 50 * dt; }
            dodger.setPosition(Phaser.Math.Clamp(dodger.x, 220, 740), Phaser.Math.Clamp(dodger.y, 110, 530));
          }
          this.balls = this.balls.filter((ball) => {
            if (!this.active) { ball.destroy(); return false; }
            ball.x += (ball.getData("vx") as number) * dt; ball.y += (ball.getData("vy") as number) * dt;
            this.graphics.lineStyle(2, 0xf5e7bd, 0.2).lineBetween(ball.x, ball.y, ball.x - (ball.getData("vx") as number) * .04, ball.y - (ball.getData("vy") as number) * .04);
            if (ball.x < 32 || ball.x > 928 || ball.y < 34 || ball.y > 566) { ball.destroy(); return false; }
            if (Phaser.Math.Distance.Between(ball.x, ball.y, dodger.x, dodger.y) < 22) { ball.destroy(); this.playerOut(); return false; }
            return true;
          });
        }
        private playerOut() {
          this.active = false; setScore((s) => s + 1);
          const out = this.turn + 1; this.turn++;
          if (this.turn < this.players.length) {
            // Next dodger steps in after a short pause; the round keeps going without the start button.
            this.positionTeams();
            this.notice(this.middle ? `Player ${out} is out! Player ${this.turn + 1} steps into the middle.` : `Hit! Player ${out} is out. Their next player steps in.`, this.middle ? "danger" : "success");
            this.nextUp = this.time.delayedCall(1100, () => { this.active = true; this.cooldown = 0.8; this.notice(this.playHint(), "ready"); });
            return;
          }
          this.turn = 0; this.middle = !this.middle; this.positionTeams();
          this.notice("All three players are out! Teams swap sides for the next turn.", "success");
          window.dispatchEvent(new CustomEvent("balance-playing", { detail: false })); window.dispatchEvent(new CustomEvent("balance-role", { detail: this.middle }));
        }
        private launchAt(source: PhaserNamespace.GameObjects.Arc, target: PhaserNamespace.GameObjects.Arc) { const ball = this.add.circle(source.x, source.y, 9, 0xf4e5bd).setStrokeStyle(2, 0x876d45).setDepth(4); const dx = target.x - source.x, dy = target.y - source.y, len = Math.hypot(dx,dy)||1; ball.setData("vx",dx/len*290); ball.setData("vy",dy/len*290); this.balls.push(ball); }
      }
      game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, width: 960, height: 600, backgroundColor: "#174b38", scene: BalanceField, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });
    });
    const status = (e: Event) => setStatus((e as CustomEvent<Status>).detail);
    const play = (e: Event) => setPlaying((e as CustomEvent<boolean>).detail);
    const role = (e: Event) => setHumanMiddle((e as CustomEvent<boolean>).detail);
    const dodgerUp = (e: Event) => setDodger((e as CustomEvent<number>).detail);
    window.addEventListener("balance-status", status); window.addEventListener("balance-playing", play); window.addEventListener("balance-role", role); window.addEventListener("balance-dodger", dodgerUp);
    return () => { disposed = true; window.removeEventListener("balance-status", status); window.removeEventListener("balance-playing", play); window.removeEventListener("balance-role", role); window.removeEventListener("balance-dodger", dodgerUp); game?.destroy(true); };
  }, [screen]);

  function enter() { document.documentElement.requestFullscreen?.().catch(() => undefined); setScreen("game"); }
  function exit() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); setScreen("library"); }
  function begin() { window.dispatchEvent(new Event("balance-start")); }
  function move(x: number, y: number) { (window as Window & { balanceInput?: {x:number;y:number} }).balanceInput = {x,y}; window.dispatchEvent(new CustomEvent("balance-move", { detail: {x,y} })); }

  if (touchOpen) return <TouchGame onBack={() => setTouchOpen(false)} />;
  if (screen === "library") return <main className="shell library-screen"><header className="topbar"><a className="brand" href="#top"><span className="brand-mark">S</span><span>SALONE<span className="brand-light">PLAYGROUND</span></span></a><div className="topbar-right"><span className="online-dot"/> SIERRA LEONE · CHILDHOOD GAMES</div></header><section className="hero" id="top"><div className="hero-copy"><p className="eyebrow">THE PLAYGROUND IS OPEN</p><h1>Old-school games.<br/><em>New memories.</em></h1><p className="intro">A home for the games we grew up playing. Start with Balance Ball—quick feet, teamwork, and a homemade sock ball.</p><div className="hero-tags"><span>🏐 BALANCE BALL</span><span>🇸🇱 SALONE ROOTS</span><span>🎮 PLAY NOW</span></div></div><div className="hero-art" aria-hidden="true"><div className="sun"/><div className="hill hill-back"/><div className="hill hill-front"/><div className="art-player player-one">✦</div><div className="art-player player-two">✦</div><div className="art-player player-three">✦</div><div className="art-stamp">FREETOWN<br/><small>PLAYGROUND</small></div></div></section><section className="game-section"><div className="section-heading"><div><p className="eyebrow">PICK UP AND PLAY</p><h2>The games shelf</h2><p className="section-sub">Familiar playground games, ready for a new round.</p></div></div><div className="library-grid"><button className="game-card touch-card" onClick={enter}><span className="game-card-icon">◉</span><span className="game-card-meta">GAME 01 · PLAY NOW</span><strong>Balance Ball</strong><span className="game-card-desc">Dodge the sock ball in the middle, then switch sides when a player is hit.</span><span className="game-card-cta">PLAY BALANCE BALL <b>→</b></span></button><button className="game-card touch-card" onClick={() => { document.documentElement.requestFullscreen?.().catch(() => undefined); setTouchOpen(true); }}><span className="game-card-icon">↗</span><span className="game-card-meta">GAME 02 · PLAY NOW</span><strong>Touch</strong><span className="game-card-desc">Run the lines, turn at the far side, and try to make it home.</span><span className="game-card-cta">PLAY TOUCH <b>→</b></span></button><article className="game-card coming-card"><span className="game-card-icon">〰</span><span className="game-card-meta">GAME 03 · COMING SOON</span><strong>Skipping Rope</strong><span className="game-card-desc">A playground favourite from childhood.</span><span className="game-card-cta">COMING SOON</span></article></div></section><footer><span>MADE FOR THE GAMES WE GREW UP WITH.</span><span>MORE GAMES COMING SOON <b>✳</b></span></footer></main>;
  return <main className="game-screen"><header className="game-topbar"><button className="back-button" onClick={exit}>← <span>GAMES</span></button><div className="game-title"><span className="brand-mark">S</span><strong>BALANCE BALL</strong><small>HIT {String(score).padStart(2,"0")}</small></div><span className="game-role">{humanMiddle ? "DODGE TEAM" : "THROWING TEAM"} · PLAYER {dodger}/3</span></header><div className="game-stage"><div className="game-frame"><div className="game-host" ref={host}/><div className={`notice ${status.kind}`} role="status"><span>{status.kind === "success" ? "✓" : status.kind === "danger" ? "!" : "↗"}</span>{status.text}</div>{!playing && <button className="start-overlay" onClick={begin}><span>▶</span>{status.kind === "success" ? "NEXT TURN" : "START GAME"}</button>}</div></div><div className="game-bottom"><span className="game-help">{humanMiddle ? "Dodge with WASD / arrows. One player in the middle at a time." : "Tap the field to aim and throw the ball."}</span><div className="mobile-controls" aria-label="Movement controls"><button onPointerDown={() => move(-1,0)} onPointerUp={() => move(0,0)} onPointerLeave={() => move(0,0)}>←</button><div><button onPointerDown={() => move(0,-1)} onPointerUp={() => move(0,0)} onPointerLeave={() => move(0,0)}>↑</button><button onPointerDown={() => move(0,1)} onPointerUp={() => move(0,0)} onPointerLeave={() => move(0,0)}>↓</button></div><button onPointerDown={() => move(1,0)} onPointerUp={() => move(0,0)} onPointerLeave={() => move(0,0)}>→</button></div><span className="game-help">Three hits swap the teams. Use a light, soft ball.</span></div></main>;
}
