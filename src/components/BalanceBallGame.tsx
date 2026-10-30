"use client";

import { useEffect, useRef, useState } from "react";
import type PhaserNamespace from "phaser";
import TouchGame from "@/components/touch/TouchGame";
import Joystick from "@/components/Joystick";
import { burst, floatText, ripple } from "@/components/effects";
import { MUTED_KEY, readFlag, writeFlag } from "@/components/preferences";
import { gameSound as sound } from "@/components/sound";

type Status = { text: string; kind: "ready" | "danger" | "success" };
type Point = { x: number; y: number };

const DODGER_SPEED = 210;
const HIT_RADIUS = 22;
// A ball that passes within this distance without hitting counts as a close dodge.
const CLOSE_RADIUS = 48;
const SLOW_MO_MS = 650;
const SLOW_MO_SCALE = 0.25;

export default function BalanceBallGame() {
  const host = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"library" | "game">("library");
  const [touchOpen, setTouchOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ text: "Choose Balance Ball to play.", kind: "ready" });
  const [playing, setPlaying] = useState(false);
  const [humanMiddle, setHumanMiddle] = useState(true);
  const [score, setScore] = useState(0);
  const [dodger, setDodger] = useState(1);
  // Read from storage when the game opens, so the server render and the first client render agree.
  const [muted, setMuted] = useState(false);

  useEffect(() => { sound.muted = muted; }, [muted]);

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
        // After a hit the play runs on in slow motion until slowMoUntil, then the player goes out.
        private slowMoUntil = 0;
        private pendingOut = false;
        private stepDistance = 0;
        private trail: Point[] = [];
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
        private start = () => { sound.whistle(); this.active = true; this.cooldown = 0.8; this.notice(this.playHint(), "ready"); window.dispatchEvent(new CustomEvent("balance-playing", { detail: true })); };
        private playHint() { return this.middle ? `Player ${this.turn + 1} of 3 is in the middle. Dodge the sock ball!` : `Your team is throwing at player ${this.turn + 1} of 3. Tap the field to aim and throw.`; }
        private move = (e: Event) => { (window as Window & { balanceInput?: { x: number; y: number } }).balanceInput = (e as CustomEvent<{x:number;y:number}>).detail; };
        private reset = () => { this.active = false; this.pendingOut = false; this.nextUp?.remove(); this.turn = 0; this.balls.forEach((b) => b.destroy()); this.balls = []; this.buildTeams(); this.positionTeams(); this.notice("Get ready for the next turn.", "ready"); window.dispatchEvent(new CustomEvent("balance-playing", { detail: false })); };
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
          if (!this.active || this.middle || this.pendingOut || this.cooldown > 0) return;
          const source = this.nearestThrower(x, y);
          if (source !== this.selected) { this.selected.setStrokeStyle(3, 0xffe3b1); this.selected = source; source.setStrokeStyle(5, 0xf4df79); }
          // The computer dodger only reacts to some throws, so the human team can land hits.
          this.launch(source, x, y, 340).setData("seen", Math.random() < 0.55); this.cooldown = 0.65;
        }
        update(time: number, delta: number) {
          let dt = Math.min(delta / 1000, 0.04);
          if (this.pendingOut) {
            dt *= SLOW_MO_SCALE;
            if (this.time.now >= this.slowMoUntil) { this.pendingOut = false; this.playerOut(); }
          }
          this.cooldown = Math.max(0, this.cooldown - dt); this.graphics.clear();
          if (!this.active) return;
          const dodger = this.players[this.turn];
          const before = { x: dodger.x, y: dodger.y };
          const input = (window as Window & { balanceInput?: {x:number;y:number} }).balanceInput ?? {x:0,y:0};
          if (this.pendingOut) {
            // Nobody moves on their own during the slow-motion replay of a hit; the balls finish their flight.
          } else if (this.middle) {
            let dx = input.x, dy = input.y;
            if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1; if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
            if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1; if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
            // Joystick input is analog (a partial push moves slower); keys and combined input are capped at full speed.
            const magnitude = Math.hypot(dx, dy), scale = magnitude > 1 ? 1 / magnitude : 1;
            if (magnitude) dodger.setPosition(Phaser.Math.Clamp(dodger.x + dx * scale * DODGER_SPEED * dt, 210, 750), Phaser.Math.Clamp(dodger.y + dy * scale * DODGER_SPEED * dt, 110, 540));
            this.stepDistance += Phaser.Math.Distance.Between(before.x, before.y, dodger.x, dodger.y);
            if (this.stepDistance >= 34) { this.stepDistance = 0; sound.step(); }
            if (this.cooldown <= 0) { this.launchAt(this.throwers[Math.floor(Math.random()*2)], dodger); this.cooldown = 1.45; }
          } else {
            const threat = this.balls.find((b) => b.getData("seen") && Phaser.Math.Distance.Between(b.x, b.y, dodger.x, dodger.y) < 170);
            if (threat) {
              const vx = threat.getData("vx") as number, vy = threat.getData("vy") as number, len = Math.hypot(vx, vy) || 1;
              const px = -vy / len, py = vx / len, side = Math.sign((dodger.x - threat.x) * px + (dodger.y - threat.y) * py) || 1;
              dodger.x += px * side * 150 * dt; dodger.y += py * side * 150 * dt;
            } else { dodger.x += Math.sin(time / 430 + this.turn * 2) * 60 * dt; dodger.y += Math.cos(time / 510 + this.turn) * 50 * dt; }
            dodger.setPosition(Phaser.Math.Clamp(dodger.x, 220, 740), Phaser.Math.Clamp(dodger.y, 110, 530));
          }
          this.drawTrail(dodger, before, dt);
          this.drawAim();
          this.balls = this.balls.filter((ball) => {
            if (!this.active) { ball.destroy(); return false; }
            const vx = ball.getData("vx") as number, vy = ball.getData("vy") as number;
            ball.x += vx * dt; ball.y += vy * dt;
            this.graphics.fillStyle(0x0b2a1f, 0.28).fillEllipse(ball.x + 3, ball.y + 7, 16, 7);
            this.graphics.lineStyle(2, 0xf5e7bd, 0.2).lineBetween(ball.x, ball.y, ball.x - vx * .04, ball.y - vy * .04);
            if (ball.x < 32 || ball.x > 928 || ball.y < 34 || ball.y > 566) {
              ripple(this, Phaser.Math.Clamp(ball.x, 32, 928), Phaser.Math.Clamp(ball.y, 34, 566), 0xe0e8bb, 1.8);
              ball.destroy(); return false;
            }
            if (this.pendingOut) return true;
            const distance = Phaser.Math.Distance.Between(ball.x, ball.y, dodger.x, dodger.y);
            if (distance < HIT_RADIUS) { this.hit(dodger, ball); ball.destroy(); return false; }
            this.closeCall(ball, dodger, distance);
            return true;
          });
        }
        private launch(source: PhaserNamespace.GameObjects.Arc, x: number, y: number, speed: number) {
          const ball = this.add.circle(source.x, source.y, 9, 0xf4e5bd).setStrokeStyle(2, 0x876d45).setDepth(4);
          const dx = x - source.x, dy = y - source.y, len = Math.hypot(dx, dy) || 1;
          ball.setData("vx", dx / len * speed); ball.setData("vy", dy / len * speed); this.balls.push(ball);
          // The thrower winds up with a quick pop so it is clear where the ball came from.
          this.tweens.add({ targets: source, scale: 1.3, duration: 90, yoyo: true, ease: "Quad.easeOut" });
          sound.whoosh();
          return ball;
        }
        private hit(dodger: PhaserNamespace.GameObjects.Arc, ball: PhaserNamespace.GameObjects.Arc) {
          sound.touch();
          ripple(this, ball.x, ball.y, 0xffd166);
          this.cameras.main.shake(260, 0.006);
          if (this.middle) this.cameras.main.flash(160, 255, 140, 110); else this.cameras.main.flash(160, 120, 220, 140);
          floatText(this, "OUT!", dodger.x, dodger.y - 24, this.middle ? "#ffb59e" : "#d7ec83");
          this.tweens.add({ targets: dodger, alpha: 0.35, duration: 110, yoyo: true, repeat: 2 });
          this.pendingOut = true; this.slowMoUntil = this.time.now + SLOW_MO_MS;
        }
        // Tracks how close each ball gets; once a ball that came near starts moving away, the dodge is called out.
        private closeCall(ball: PhaserNamespace.GameObjects.Arc, dodger: PhaserNamespace.GameObjects.Arc, distance: number) {
          const closest = (ball.getData("closest") as number | undefined) ?? Infinity;
          if (distance < closest) { ball.setData("closest", distance); return; }
          if (closest >= CLOSE_RADIUS || ball.getData("called") || distance < closest + 6) return;
          ball.setData("called", true);
          floatText(this, this.middle ? "CLOSE!" : "DODGED", dodger.x, dodger.y - 24, this.middle ? "#d7ec83" : "#ffe5a0");
          if (this.middle) sound.point();
        }
        private drawTrail(dodger: PhaserNamespace.GameObjects.Arc, before: Point, dt: number) {
          const moved = Phaser.Math.Distance.Between(before.x, before.y, dodger.x, dodger.y);
          if (dt > 0 && moved / dt > 120) this.trail.push({ x: dodger.x, y: dodger.y }); else this.trail.shift();
          if (this.trail.length > 10) this.trail.shift();
          for (let i = 1; i < this.trail.length; i++) {
            this.graphics.lineStyle(dodger.radius * 1.2 * i / this.trail.length, dodger.fillColor, 0.35 * i / this.trail.length).lineBetween(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
          }
        }
        // While your team throws, a faint guide runs from the nearest thrower toward the pointer.
        private drawAim() {
          if (this.middle || this.pendingOut) return;
          const p = this.input.activePointer;
          if (p.worldX < 32 || p.worldX > 928 || p.worldY < 34 || p.worldY > 566) return;
          const source = this.nearestThrower(p.worldX, p.worldY);
          this.graphics.lineStyle(2, 0xf4df79, this.cooldown > 0 ? 0.12 : 0.35).lineBetween(source.x, source.y, p.worldX, p.worldY);
          this.graphics.strokeCircle(p.worldX, p.worldY, 10);
        }
        private nearestThrower(x: number, y: number) {
          return this.throwers.reduce((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) <= Phaser.Math.Distance.Between(x, y, b.x, b.y) ? a : b);
        }
        private playerOut() {
          this.active = false; setScore((s) => s + 1);
          this.balls.forEach((b) => b.destroy()); this.balls = []; this.trail = [];
          // Stop the hit flash first, or it would finish after the player has been benched and leave them at full brightness.
          this.tweens.killTweensOf(this.players[this.turn]);
          const out = this.turn + 1; this.turn++;
          if (this.turn < this.players.length) {
            // Next dodger steps in after a short pause; the round keeps going without the start button.
            this.positionTeams();
            this.notice(this.middle ? `Player ${out} is out! Player ${this.turn + 1} steps into the middle.` : `Hit! Player ${out} is out. Their next player steps in.`, this.middle ? "danger" : "success");
            this.nextUp = this.time.delayedCall(1100, () => { this.active = true; this.cooldown = 0.8; this.notice(this.playHint(), "ready"); });
            return;
          }
          // Your throwers knocked out the whole team: celebrate. Your whole team went out: a lower tone.
          if (this.middle) sound.lose(); else { sound.cheer(); burst(this, 480, 300); }
          (window as Window & { balanceInput?: Point }).balanceInput = { x: 0, y: 0 };
          this.turn = 0; this.middle = !this.middle; this.positionTeams();
          this.notice("All three players are out! Teams swap sides for the next turn.", "success");
          window.dispatchEvent(new CustomEvent("balance-playing", { detail: false })); window.dispatchEvent(new CustomEvent("balance-role", { detail: this.middle }));
        }
        private launchAt(source: PhaserNamespace.GameObjects.Arc, target: PhaserNamespace.GameObjects.Arc) { this.launch(source, target.x, target.y, 290); }
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

  function enter() { document.documentElement.requestFullscreen?.().catch(() => undefined); setMuted(readFlag(MUTED_KEY)); setScreen("game"); }
  function exit() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); setScreen("library"); }
  function begin() { sound.unlock(); window.dispatchEvent(new Event("balance-start")); }
  function toggleMuted() { const next = !muted; setMuted(next); writeFlag(MUTED_KEY, next); if (!next) sound.unlock(); }
  function move(x: number, y: number) { (window as Window & { balanceInput?: {x:number;y:number} }).balanceInput = {x,y}; window.dispatchEvent(new CustomEvent("balance-move", { detail: {x,y} })); }

  if (touchOpen) return <TouchGame onBack={() => setTouchOpen(false)} />;
  if (screen === "library") return <main className="shell library-screen"><header className="topbar"><a className="brand" href="#top"><span className="brand-mark">S</span><span>SALONE<span className="brand-light">PLAYGROUND</span></span></a><div className="topbar-right"><span className="online-dot"/> SIERRA LEONE · CHILDHOOD GAMES</div></header><section className="hero" id="top"><div className="hero-copy"><p className="eyebrow">THE PLAYGROUND IS OPEN</p><h1>Old-school games.<br/><em>New memories.</em></h1><p className="intro">A home for the games we grew up playing. Start with Balance Ball—quick feet, teamwork, and a homemade sock ball.</p><div className="hero-tags"><span>🏐 BALANCE BALL</span><span>🇸🇱 SALONE ROOTS</span><span>🎮 PLAY NOW</span></div></div><div className="hero-art" aria-hidden="true"><div className="sun"/><div className="hill hill-back"/><div className="hill hill-front"/><div className="art-player player-one">✦</div><div className="art-player player-two">✦</div><div className="art-player player-three">✦</div><div className="art-stamp">FREETOWN<br/><small>PLAYGROUND</small></div></div></section><section className="game-section"><div className="section-heading"><div><p className="eyebrow">PICK UP AND PLAY</p><h2>The games shelf</h2><p className="section-sub">Familiar playground games, ready for a new round.</p></div></div><div className="library-grid"><button className="game-card touch-card" onClick={enter}><span className="game-card-icon">◉</span><span className="game-card-meta">GAME 01 · PLAY NOW</span><strong>Balance Ball</strong><span className="game-card-desc">Dodge the sock ball in the middle, then switch sides when a player is hit.</span><span className="game-card-cta">PLAY BALANCE BALL <b>→</b></span></button><button className="game-card touch-card" onClick={() => { document.documentElement.requestFullscreen?.().catch(() => undefined); setMuted(readFlag(MUTED_KEY)); setTouchOpen(true); }}><span className="game-card-icon">↗</span><span className="game-card-meta">GAME 02 · PLAY NOW</span><strong>Touch</strong><span className="game-card-desc">Run the lines, turn at the far side, and try to make it home.</span><span className="game-card-cta">PLAY TOUCH <b>→</b></span></button><article className="game-card coming-card"><span className="game-card-icon">〰</span><span className="game-card-meta">GAME 03 · COMING SOON</span><strong>Skipping Rope</strong><span className="game-card-desc">A playground favourite from childhood.</span><span className="game-card-cta">COMING SOON</span></article></div></section><footer><span>MADE FOR THE GAMES WE GREW UP WITH.</span><span>MORE GAMES COMING SOON <b>✳</b></span></footer></main>;
  return <main className="game-screen"><header className="game-topbar"><button className="back-button" onClick={exit}>← <span>GAMES</span></button><div className="game-title"><span className="brand-mark">S</span><strong>BALANCE BALL</strong><small>HIT {String(score).padStart(2,"0")}</small></div><div className="game-settings"><button className="icon-button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>{muted ? "🔇" : "🔊"}</button><span className="game-role">{humanMiddle ? "DODGE TEAM" : "THROWING TEAM"} · PLAYER {dodger}/3</span></div></header><div className="game-stage"><div className="game-frame"><div className="game-host" ref={host}/><div className={`notice ${status.kind}`} role="status"><span>{status.kind === "success" ? "✓" : status.kind === "danger" ? "!" : "↗"}</span>{status.text}</div>{!playing && <button className="start-overlay" onClick={begin}><span>▶</span>{status.kind === "success" ? "NEXT TURN" : "START GAME"}</button>}</div></div><div className="game-bottom touch-bottom"><div className="touch-pad">{humanMiddle ? <Joystick onMove={move}/> : <span className="tap-hint">TAP TO<br/>THROW</span>}</div><span className="game-help touch-keys">{humanMiddle ? "Dodge with WASD / arrows. One player in the middle at a time." : "Click the field to aim and throw the ball."}</span><span className="game-help touch-rules">Three hits swap the teams · close dodges are called out</span></div></main>;
}
