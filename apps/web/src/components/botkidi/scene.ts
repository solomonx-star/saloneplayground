import type PhaserNamespace from "phaser";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import { chooseShot, clampLineX } from "./ai";
import { atRest, cloneLids, hitVelocity, step, type Lid } from "./physics";
import { lidToPlay, matchOver, newMatch, newRound, places, resolveShot, scoreRound, type Match, type Outcome, type Round } from "./rules";
import { FIELD, LID_R, LINE_X, LINE_Y, MAX_DRAG, PHYSICS, PLAYER_COLORS, PLAYER_NAMES, SQUARE, SQUARE_CENTER, WALL_Y, type Level } from "./settings";

type Graphics = PhaserNamespace.GameObjects.Graphics;

export type Notice = { text: string; kind: "ready" | "danger" | "success" };
export type Mode = "cpu" | "friends";
export type Start = { mode: Mode; level: Level; players: number; rounds: number; flatSide: boolean };
// What the screen around the yard shows.
export type BotkidiState = {
  names: string[];
  scores: number[];
  round: number;
  rounds: number;
  hitter: number | null;
  finished: number[];
  current: number | null;
  // "playing" while a round is on; "between" after a round with more to come; "over" when the match is done.
  status: "idle" | "playing" | "between" | "over";
};

const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const CPU_THINK_MS = 700;
const NEXT_MS = 1100;
// A crown cap's crimped edge: 21 teeth round the rim.
const CRIMP = Array.from({ length: 42 }, (_, i) => {
  const a = (i / 42) * Math.PI * 2;
  const r = i % 2 ? LID_R : LID_R - 2.4;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});

// Builds the Phaser scene class. Phaser is passed in because it is only loaded in the browser.
// The React screen sends botkidi-start (a Start) or botkidi-next (the next round), and listens for botkidi-status
// (a Notice) and botkidi-state (a BotkidiState).
export function createBotkidiScene(Phaser: typeof PhaserNamespace, sound: GameSound) {
  return class BotkidiYard extends Phaser.Scene {
    private settings: Start = { mode: "cpu", level: "normal", players: 3, rounds: 3, flatSide: false };
    private match: Match = newMatch(3, 3);
    private round: Round = newRound(3, { flatSide: false });
    private lids: Lid[] = [];
    private before: Lid[] = [];
    private phase: "idle" | "aim" | "rolling" | "cpu" | "between" | "over" = "idle";
    private lineX = SQUARE_CENTER.x;
    private dragging: "aim" | "slide" | null = null;
    // Where the pull started (the lid, or wherever on the yard it was pressed).
    private pullFrom: { x: number; y: number } | null = null;
    private aim: { angle: number; power: number } | null = null;
    private yard!: Graphics;
    private guide!: Graphics;
    private lastClack = 0;
    // The crimped edge's points, reused for every lid drawn.
    private crimp = CRIMP.map(() => new Phaser.Math.Vector2());
    private accumulator = 0;

    constructor() { super("BotkidiYard"); }

    create() {
      this.drawGround();
      this.yard = this.add.graphics().setDepth(3);
      this.guide = this.add.graphics().setDepth(4);
      this.input.on("pointerdown", this.pointerDown);
      this.input.on("pointermove", this.pointerMove);
      this.input.on("pointerup", this.pointerUp);
      this.input.on("pointerupoutside", this.pointerUp);
      window.addEventListener("botkidi-start", this.start);
      window.addEventListener("botkidi-next", this.nextRound);
      window.addEventListener("pointermove", this.windowMove);
      window.addEventListener("pointerup", this.pointerUp);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        window.removeEventListener("botkidi-start", this.start);
        window.removeEventListener("botkidi-next", this.nextRound);
        window.removeEventListener("pointermove", this.windowMove);
        window.removeEventListener("pointerup", this.pointerUp);
      });
      this.draw();
    }

    // ---- Flow ----

    private start = (event: Event) => {
      this.settings = (event as CustomEvent<Start>).detail;
      this.match = newMatch(this.settings.players, this.settings.rounds);
      sound.unlock();
      this.beginRound();
    };

    private nextRound = () => { if (this.phase === "between") { sound.unlock(); this.beginRound(); } };

    private beginRound() {
      this.round = newRound(this.settings.players, { flatSide: this.settings.flatSide });
      this.lids = cloneLids(this.round.lids);
      sound.whistle();
      emit("botkidi-status", { text: `Round ${this.match.played + 1}: everyone throws their lid from the line. Land in the square to be the Hitter.`, kind: "ready" });
      this.publish("playing");
      this.time.delayedCall(NEXT_MS, () => this.beginTurn());
    }

    private human(player: number) { return this.settings.mode === "friends" || player === 0; }
    private name(player: number) {
      if (this.settings.mode === "friends") return PLAYER_NAMES[player];
      return player === 0 ? "You" : `${PLAYER_NAMES[player]} (CPU)`;
    }
    private possessive(player: number) { return player === 0 && this.settings.mode === "cpu" ? "your" : `${this.name(player)}'s`; }

    private beginTurn() {
      const { round } = this;
      this.aim = null;
      if (round.phase === "throw") {
        this.lineX = SQUARE_CENTER.x;
        this.lids[round.target] = lidToPlay(round, this.lineX);
      }
      this.publish("playing");
      const actor = round.current;
      if (!this.human(actor)) {
        this.phase = "cpu";
        const doing = round.phase === "throw" ? "is lining up a throw" : round.phase === "hit" ? "is lining up a shot" : `is about to hit ${this.possessive(round.target)} lid away`;
        emit("botkidi-status", { text: `${this.name(actor)} ${doing}…`, kind: "ready" });
        this.time.delayedCall(CPU_THINK_MS, () => this.cpuShoot());
        return;
      }
      this.phase = "aim";
      const you = this.settings.mode === "cpu" ? "Your" : `${this.name(actor)}:`;
      const text = round.phase === "throw"
        ? `${you} throw. Slide your lid along the line, then pull back and let go.`
        : round.phase === "hit"
          ? `${you} shot. Pull back and let go to hit your lid towards the square.`
          : `${this.settings.mode === "cpu" ? "You are" : `${this.name(actor)} is`} the Hitter: pull back and let go to hit ${this.possessive(round.target)} lid far away.`;
      const tip = " Near the edge? Press anywhere on the yard and pull from there.";
      const edge = this.target();
      emit("botkidi-status", { text: edge.y > FIELD - 150 || edge.x < 100 || edge.x > FIELD - 100 ? text + tip : text, kind: "ready" });
    }

    private cpuShoot() {
      if (this.phase !== "cpu") return;
      const shot = chooseShot({ ...this.round, lids: this.lids }, this.settings.level);
      const lid = this.lids[this.round.target];
      const go = () => {
        this.aim = { angle: shot.angle, power: shot.power };
        this.time.delayedCall(500, () => this.shoot(shot.angle, shot.power));
      };
      if (this.round.phase !== "throw") { go(); return; }
      // Walk along the line to the spot it chose, then throw.
      this.lineX = shot.lineX;
      this.tweens.add({ targets: lid, x: shot.lineX, duration: 350, ease: "Sine.easeInOut", onComplete: go });
    }

    private shoot(angle: number, power: number) {
      const lid = this.lids[this.round.target];
      this.before = cloneLids(this.round.lids);
      Object.assign(lid, hitVelocity(lid, angle, power), { out: false });
      this.aim = null;
      this.phase = "rolling";
      if (this.round.phase === "throw") sound.whoosh(); else sound.clack(0.6 + power);
    }

    update(_time: number, delta: number) {
      if (this.phase === "rolling") {
        // Fixed physics steps keep the game the same speed on fast and slow screens.
        this.accumulator += Math.min(delta / 1000, 0.05);
        while (this.accumulator >= PHYSICS.step) {
          this.accumulator -= PHYSICS.step;
          for (const contact of step(this.lids)) this.onContact(contact.x, contact.y, contact.strength);
        }
        if (atRest(this.lids)) { this.accumulator = 0; this.finishShot(); }
      }
      this.draw();
    }

    private onContact(x: number, y: number, strength: number) {
      if (this.time.now - this.lastClack < 35) return;
      this.lastClack = this.time.now;
      sound.clack(strength / PHYSICS.maxSpeed * 1.6);
      if (strength > 300) ripple(this, x, y, 0xfff4dd, 1.4);
    }

    private finishShot() {
      const { round, outcomes } = resolveShot(this.round, this.before, this.lids);
      this.round = round;
      this.lids = cloneLids(round.lids);
      this.say(outcomes);
      this.publish("playing");
      if (round.phase === "done") { this.endRound(); return; }
      this.phase = "idle";
      this.time.delayedCall(NEXT_MS, () => this.beginTurn());
    }

    private say(outcomes: Outcome[]) {
      const lines: string[] = [];
      let kind: Notice["kind"] = "ready";
      for (const o of outcomes) {
        if (o.kind === "threw") lines.push(o.inSquare ? `${this.name(o.player)} threw into the square!` : `${this.name(o.player)} missed the square.`);
        if (o.kind === "throw-off") {
          if (o.result === "hitter") {
            const h = o.players[0];
            lines.push(`${this.name(h)} ${h === 0 && this.settings.mode === "cpu" ? "are" : "is"} the Hitter!`);
            floatText(this, "HITTER", SQUARE_CENTER.x, SQUARE.y1 + 24, "#d7ec83");
            sound.point();
            kind = this.human(h) ? "success" : "danger";
          } else if (o.result === "tie") lines.push(`${o.players.map((p) => this.name(p)).join(" and ")} all landed in — throw again!`);
          else lines.push("Nobody got in — everyone throws again.");
        }
        if (o.kind === "whacked") lines.push(`${this.name(o.player)} hit ${this.possessive(o.victim)} lid away.`);
        if (o.kind === "hit") {
          if (o.inSquare) {
            lines.push(`${this.name(o.player)} got in the square!`);
            const lid = this.round.lids[o.player];
            floatText(this, "IN!", lid.x, lid.y - 18, "#d7ec83");
            sound.point();
            kind = this.human(o.player) ? "success" : "ready";
          } else {
            lines.push(`${this.name(o.player)} missed — the Hitter gets to hit it away.`);
            if (this.human(o.player)) kind = "danger";
          }
        }
        if (o.kind === "lucky") lines.push(`${this.possessive(o.player).replace(/^your/, "Your")} lid was knocked into the square!`);
      }
      if (lines.length) emit("botkidi-status", { text: lines.join(" "), kind });
    }

    private endRound() {
      this.match = scoreRound(this.match, this.round);
      const order = places(this.round);
      const last = order[order.length - 1];
      const over = matchOver(this.match);
      if (over) {
        const top = Math.max(...this.match.scores);
        const winners = this.match.scores.flatMap((s, p) => (s === top ? [p] : []));
        const youWin = winners.some((p) => this.human(p));
        if (youWin) { sound.cheer(); burst(this, SQUARE_CENTER.x, SQUARE_CENTER.y + 60); } else sound.lose();
        const who = winners.length > 1 ? `${winners.map((p) => this.name(p)).join(" and ")} share the win` : `${this.name(winners[0])} ${winners[0] === 0 && this.settings.mode === "cpu" ? "win" : "wins"}`;
        emit("botkidi-status", { text: `Every lid is in. ${who} with ${top} point${top === 1 ? "" : "s"}!`, kind: youWin ? "success" : "danger" });
      } else {
        sound.whistle();
        emit("botkidi-status", { text: `Every lid is in. ${this.name(last)} ${last === 0 && this.settings.mode === "cpu" ? "were" : "was"} last this round.`, kind: this.human(last) && this.settings.mode === "cpu" ? "danger" : "ready" });
      }
      this.phase = over ? "over" : "between";
      this.publish(over ? "over" : "between");
    }

    private publish(status: BotkidiState["status"]) {
      const state: BotkidiState = {
        names: Array.from({ length: this.settings.players }, (_, p) => this.name(p)),
        scores: this.match.scores,
        round: Math.min(this.match.rounds, this.match.played + (status === "playing" ? 1 : 0)),
        rounds: this.match.rounds,
        hitter: this.round.hitter,
        finished: this.round.finished,
        current: status === "playing" ? this.round.current : null,
        status,
      };
      emit("botkidi-state", state);
    }

    // ---- Aiming ----

    private target() { return this.lids[this.round.target]; }

    // A pull starts on the lid, or anywhere else on the yard: the shot goes the opposite way to the drag, harder the
    // further it goes. Starting away from the lid leaves room to pull back when the lid is near the edge of the yard.
    private pointerDown = (p: PhaserNamespace.Input.Pointer) => {
      if (this.phase !== "aim") return;
      const lid = this.target();
      const near = Phaser.Math.Distance.Between(p.worldX, p.worldY, lid.x, lid.y) < 46;
      // Throwing: tap or drag along the line (away from the lid) to choose where to throw from.
      if (!near && this.round.phase === "throw" && Math.abs(p.worldY - LINE_Y) < 40) { this.dragging = "slide"; this.slideTo(p.worldX); return; }
      this.dragging = "aim";
      this.pullFrom = near ? { x: lid.x, y: lid.y } : { x: p.worldX, y: p.worldY };
    };

    private pointerMove = (p: PhaserNamespace.Input.Pointer) => { this.dragTo(p.worldX, p.worldY); };

    // Phaser stops reporting the pointer once it leaves the yard, so a pull is also followed over the whole page.
    private windowMove = (event: PointerEvent) => {
      if (this.dragging !== "aim") return;
      this.dragTo(this.scale.transformX(event.pageX), this.scale.transformY(event.pageY));
    };

    private dragTo(x: number, y: number) {
      if (this.phase !== "aim" || !this.dragging) return;
      if (this.dragging === "slide") { this.slideTo(x); return; }
      const from = this.pullFrom ?? this.target();
      const dx = from.x - x; const dy = from.y - y;
      const pull = Math.hypot(dx, dy);
      this.aim = pull < 8 ? null : { angle: Math.atan2(dy, dx), power: Math.min(1, pull / MAX_DRAG) };
    }

    private pointerUp = () => {
      if (this.phase !== "aim") return;
      const aim = this.dragging === "aim" ? this.aim : null;
      this.dragging = null;
      this.pullFrom = null;
      if (aim && aim.power > 0.05) this.shoot(aim.angle, aim.power);
      else this.aim = null;
    };

    private slideTo(x: number) {
      this.lineX = clampLineX(x);
      this.target().x = this.lineX;
    }

    // ---- Drawing ----

    private drawGround() {
      const g = this.add.graphics();
      // Laterite: the red earth of a Freetown street.
      g.fillStyle(0xb06a43).fillRect(0, 0, FIELD, FIELD);
      for (let i = 0; i < 1100; i++) {
        g.fillStyle(Math.random() < 0.5 ? 0x9a5935 : 0xc78356, 0.5).fillCircle(Math.random() * FIELD, WALL_Y + Math.random() * (FIELD - WALL_Y), 1 + Math.random() * 2.5);
      }
      // The wall: painted cement with a blue band, and its shadow on the ground.
      g.fillStyle(0xe3d8bf).fillRect(0, 0, FIELD, WALL_Y);
      g.fillStyle(0x3f7fb3).fillRect(0, WALL_Y - 18, FIELD, 18);
      g.lineStyle(1, 0xc9bb9b, 0.8);
      for (let x = 0; x < FIELD; x += 60) g.lineBetween(x, 0, x, WALL_Y - 18);
      g.fillStyle(0x5a2f18, 0.25).fillRect(0, WALL_Y, FIELD, 8);
      // Chalk: the square against the wall and the throwing line.
      g.fillStyle(0xffffff, 0.08).fillRect(SQUARE.x0, SQUARE.y0, SQUARE.x1 - SQUARE.x0, SQUARE.y1 - SQUARE.y0);
      g.lineStyle(4, 0xfdf8ec, 0.85).strokeRect(SQUARE.x0, SQUARE.y0 + 2, SQUARE.x1 - SQUARE.x0, SQUARE.y1 - SQUARE.y0 - 2);
      for (let x = LINE_X.min - 40; x < LINE_X.max + 40; x += 26) g.lineStyle(4, 0xfdf8ec, 0.7).lineBetween(x, LINE_Y + LID_R + 6, x + 16, LINE_Y + LID_R + 6);
      this.add.text(LINE_X.min - 40, LINE_Y + LID_R + 14, "THROW LINE", { fontFamily: "Arial", fontSize: "12px", color: "#fdf8ec", fontStyle: "bold" }).setAlpha(0.8);
      this.add.text(14, 8, "BOTKIDI", { fontFamily: "Arial", fontSize: "13px", color: "#4b5b4a", fontStyle: "bold" }).setAlpha(0.8);
    }

    private draw() {
      this.yard.clear();
      const { round } = this;
      // Lids already home sit in a row inside the square, the Hitter's first.
      const home = round.hitter === null ? [] : [round.hitter, ...round.finished];
      home.forEach((player, i) => {
        const x = SQUARE.x0 + 18 + (i % 3) * 30;
        const y = SQUARE.y0 + 22 + Math.floor(i / 3) * 30;
        this.drawLid(x, y, player, "up", i === 0);
      });
      for (const lid of this.lids) {
        // Lids picked up (waiting to be thrown) or already home are not on the yard.
        if (lid.out || home.includes(lid.player)) continue;
        this.drawLid(lid.x, lid.y, lid.player, lid.face, false);
      }
      this.drawGuide();
    }

    // A crown cap from above: crimped edge, and either its printed top (resting on its edge) or the cork liner inside
    // (lying on its flat side, which is hard to hit).
    private drawLid(x: number, y: number, player: number, face: Lid["face"], hitter: boolean) {
      const g = this.yard;
      const color = PLAYER_COLORS[player];
      g.fillStyle(0x2a160b, 0.3).fillEllipse(x + 3, y + 4, LID_R * 2.2, LID_R * 1.6);
      CRIMP.forEach((c, i) => this.crimp[i].set(x + c.x, y + c.y));
      g.fillStyle(0xd8d2c4).fillPoints(this.crimp, true);
      if (face === "up") {
        g.fillStyle(color).fillCircle(x, y, LID_R - 3);
        g.lineStyle(1.5, 0xffffff, 0.8).strokeCircle(x, y, LID_R - 6);
        g.fillStyle(0xffffff, 0.45).fillCircle(x - 3, y - 3, 2.6);
      } else {
        g.fillStyle(color).fillCircle(x, y, LID_R - 3);
        g.fillStyle(0xe9dfc2).fillCircle(x, y, LID_R - 6);
        g.lineStyle(1, 0x9b8a62, 0.8).strokeCircle(x, y, LID_R - 6);
      }
      if (hitter) g.lineStyle(2, 0xd7ec83, 1).strokeCircle(x, y, LID_R + 4);
    }

    // The ring on the lid to play, the stick pulled back behind it, the direction of the shot and a power meter.
    private drawGuide() {
      this.guide.clear();
      if (this.phase !== "aim" && this.phase !== "cpu") return;
      const lid = this.target();
      const color = PLAYER_COLORS[this.round.current];
      const pulse = 0.5 + Math.sin(this.time.now / 180) * 0.25;
      this.guide.lineStyle(2, 0xfff4dd, pulse).strokeCircle(lid.x, lid.y, LID_R + 9);
      if (this.round.phase === "throw" && this.phase === "aim" && !this.aim) {
        this.guide.lineStyle(2, 0xfff4dd, 0.3).lineBetween(LINE_X.min, LINE_Y, LINE_X.max, LINE_Y);
      }
      if (!this.aim) return;
      const { angle, power } = this.aim;
      const back = LID_R + 6 + power * 60;
      // A thrown lid has no stick: show the hand's pull instead.
      const stick = this.round.phase !== "throw";
      const bx = lid.x - Math.cos(angle) * back; const by = lid.y - Math.sin(angle) * back;
      if (stick) {
        this.guide.lineStyle(7, 0x5b3a1c, 1).lineBetween(bx, by, bx - Math.cos(angle) * 70, by - Math.sin(angle) * 70);
        this.guide.lineStyle(3, 0x8a5d33, 1).lineBetween(bx, by, bx - Math.cos(angle) * 70, by - Math.sin(angle) * 70);
      } else this.guide.lineStyle(3, 0x2a160b, 0.5).lineBetween(lid.x, lid.y, bx, by);
      const length = 60 + power * 170;
      for (let d = LID_R + 6; d < length; d += 14) {
        this.guide.fillStyle(color, 0.85 * (1 - d / length) + 0.15).fillCircle(lid.x + Math.cos(angle) * d, lid.y + Math.sin(angle) * d, 2.4);
      }
      this.guide.fillStyle(0x2a160b, 0.55).fillRoundedRect(lid.x - 26, lid.y + 20, 52, 7, 3);
      this.guide.fillStyle(power > 0.85 ? 0xff9b7a : 0xd7ec83, 1).fillRoundedRect(lid.x - 26, lid.y + 20, 52 * power, 7, 3);
    }
  };
}
