import type PhaserNamespace from "phaser";
import type { TouchInput } from "@salone/games/touch/match";
import type { TouchFrame } from "@salone/games/touch/online";
import { TOUCH } from "@salone/games/touch/settings";
import { burst, floatText, ripple } from "@/components/effects";
import type { GameSound } from "@/components/sound";
import { drawFacing, drawField } from "./fieldArt";

type Arc = PhaserNamespace.GameObjects.Arc;
type Text = PhaserNamespace.GameObjects.Text;
type Graphics = PhaserNamespace.GameObjects.Graphics;

// What the online scene needs from its screen: the frames of the live match, who is watching, and a way to send this
// person's stick and switch requests to the game server.
export type OnlineFeed = {
  // This guest's id, or "" on a party's shared screen (which watches without playing).
  me: string;
  // Names of the people in the room, by guest id.
  names: { current: Record<string, string> };
  onFrame(listener: (frame: TouchFrame) => void): () => void;
  // The on-screen joystick and SPRINT button; the keyboard is added in the scene.
  input: { current: TouchInput };
  sendInput(input: TouchInput): void;
  switchTo(player?: string): void;
};

// Blue (team 0) and Orange (team 1): attacker and defender colours, and the ring around each player.
const COLORS = [
  { attacker: 0x69c6ef, defender: 0x69b8d8, ring: 0xe7f8ff },
  { attacker: 0xe57859, defender: 0xf2a354, ring: 0xffe3b1 },
];
const DEFENDER_IDS = ["line1", "line2", "line3", "line4", "main"];
// Input is sent when it changes, and again this often while it is held, in case a message was dropped.
const RESEND_MS = 250;

// The Phaser scene for online and party Touch. The match runs on the game server: this scene draws the latest frame
// (easing players toward it so the movement stays smooth between frames), plays the effects and sounds for what
// happened, and sends this person's stick, sprint and switch to the server.
export function createOnlineTouchScene(Phaser: typeof PhaserNamespace, feed: OnlineFeed, sound: GameSound) {
  return class OnlineTouchField extends Phaser.Scene {
    private frame: TouchFrame | null = null;
    private views = new Map<string, Arc>();
    private shown = new Map<string, { x: number; y: number }>();
    private facing = new Map<string, Parameters<typeof drawFacing>[1]>();
    private tags = new Map<string, Text>();
    private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
    private orderGraphics!: Graphics;
    private playerGraphics!: Graphics;
    private aiMarker!: Text;
    private sent = { x: 0, y: 0, sprint: false, at: 0 };

    constructor() { super("OnlineTouchField"); }

    // This person's entry in the frame, if they are playing.
    private get mine() { return feed.me ? this.frame?.people[feed.me] ?? null : null; }
    private get defending() { const mine = this.mine; return !!mine && !!this.frame && mine.team !== this.frame.attacking; }

    create() {
      drawField(this);
      this.orderGraphics = this.add.graphics().setDepth(4);
      this.playerGraphics = this.add.graphics().setDepth(6);
      this.aiMarker = this.add.text(0, 0, "MARKED", { fontFamily: "Arial", fontSize: "9px", color: "#ffe5a0", backgroundColor: "#593a20", padding: { x: 4, y: 2 }, fontStyle: "bold" }).setDepth(7).setVisible(false);
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT") as typeof this.keys;
      this.input.keyboard!.on("keydown-SPACE", () => { if (this.defending) feed.switchTo(); });
      this.input.on("pointerdown", (pointer: PhaserNamespace.Input.Pointer) => this.tapAt(pointer.worldX, pointer.worldY));
      const stop = feed.onFrame((frame) => this.receive(frame));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    }

    // A defender taps another defender to take it over.
    private tapAt(x: number, y: number) {
      if (!this.defending || !this.frame) return;
      const index = this.frame.defenders.findIndex(([dx, dy]) => Math.hypot(dx - x, dy - y) < 25);
      if (index >= 0) feed.switchTo(DEFENDER_IDS[index]);
    }

    private receive(frame: TouchFrame) {
      const before = this.frame;
      this.frame = frame;
      if (before?.phase !== "playing" && frame.phase === "playing") sound.whistle();
      const myTeam = this.mine?.team;
      // On the shared screen every score is cheered; on a phone or computer, your own team's.
      const ours = (team: number) => myTeam === undefined || team === myTeam;
      const at = (id: string) => this.shown.get(id) ?? { x: 0, y: 0 };
      for (const event of frame.events) {
        if (event.type === "line") {
          if (ours(event.team)) sound.point();
          floatText(this, `+${TOUCH.linePoints}`, event.x, event.y, ours(event.team) ? "#d7ec83" : "#ffb59e");
        } else if (event.type === "home") {
          const { x, y } = at(event.attacker);
          if (ours(event.team)) { sound.cheer(); this.cameras.main.flash(220, 120, 220, 140); } else { sound.lose(); this.cameras.main.flash(220, 240, 150, 110); }
          burst(this, x, y);
          floatText(this, `+${TOUCH.homePoints}`, x, y - 12, ours(event.team) ? "#d7ec83" : "#ffb59e");
        } else if (event.type === "touch") {
          const a = at(event.attacker); const d = at(event.defender);
          sound.touch();
          ripple(this, (a.x + d.x) / 2, (a.y + d.y) / 2, 0xffd166);
          this.cameras.main.shake(260, 0.006);
          this.cameras.main.flash(160, 255, 140, 110);
        }
      }
    }

    update(_time: number, delta: number) {
      this.sendInput();
      const frame = this.frame;
      if (!frame) return;
      const dt = Math.min(delta / 1000, 0.1);
      this.syncViews(frame, dt);
      this.drawOrders(frame);
      this.drawPlayers(frame);
    }

    private sendInput() {
      if (!this.mine) return;
      let x = feed.input.current.x; let y = feed.input.current.y;
      if (this.keys.LEFT.isDown || this.keys.A.isDown) x -= 1;
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) x += 1;
      if (this.keys.UP.isDown || this.keys.W.isDown) y -= 1;
      if (this.keys.DOWN.isDown || this.keys.S.isDown) y += 1;
      x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
      const sprint = this.keys.SHIFT.isDown || feed.input.current.sprint;
      const changed = Math.abs(x - this.sent.x) > 0.05 || Math.abs(y - this.sent.y) > 0.05 || sprint !== this.sent.sprint;
      const held = (x !== 0 || y !== 0 || sprint) && this.time.now - this.sent.at > RESEND_MS;
      if (!changed && !held) return;
      this.sent = { x, y, sprint, at: this.time.now };
      feed.sendInput({ x, y, sprint });
    }

    // One circle per player, coloured for the team on that side, eased toward the frame (or moved straight there
    // after a line-up).
    private syncViews(frame: TouchFrame, dt: number) {
      const attacking = COLORS[frame.attacking];
      const defending = COLORS[1 - frame.attacking];
      const players = [
        ...frame.attackers.map(([x, y], i) => ({ id: `attacker${i + 1}`, x, y, radius: 13, fill: attacking.attacker, ring: attacking.ring })),
        ...frame.defenders.map(([x, y], i) => ({ id: DEFENDER_IDS[i], x, y, radius: i === 4 ? 14 : 13, fill: defending.defender, ring: defending.ring })),
      ];
      for (const [id, view] of this.views) if (!players.some((p) => p.id === id)) { view.destroy(); this.views.delete(id); this.shown.delete(id); }
      const controlled = new Map<string, string>();
      for (const [guestId, person] of Object.entries(frame.people)) if (person.player) controlled.set(person.player, guestId);
      const blend = Math.min(1, dt * 18);
      for (const p of players) {
        let view = this.views.get(p.id);
        if (!view) { view = this.add.circle(p.x, p.y, p.radius, p.fill).setDepth(5); this.views.set(p.id, view); }
        const shown = this.shown.get(p.id) ?? { x: p.x, y: p.y };
        if (Math.hypot(p.x - shown.x, p.y - shown.y) > 80) { shown.x = p.x; shown.y = p.y; }
        else { shown.x += (p.x - shown.x) * blend; shown.y += (p.y - shown.y) * blend; }
        this.shown.set(p.id, shown);
        const owner = controlled.get(p.id);
        const [width, color] = owner === feed.me && owner ? [5, 0xf7e486] : owner ? [3, 0xffffff] : [2, p.ring];
        view.setPosition(shown.x, shown.y).setFillStyle(p.fill);
        if (view.lineWidth !== width || view.strokeColor !== color) view.setStrokeStyle(width, color);
      }
      // Name tags over the players people control.
      for (const [guestId, tag] of this.tags) if (!frame.people[guestId]?.player) { tag.destroy(); this.tags.delete(guestId); }
      for (const [player, guestId] of controlled) {
        const shown = this.shown.get(player);
        if (!shown) continue;
        let tag = this.tags.get(guestId);
        const name = guestId === feed.me ? "YOU" : (feed.names.current[guestId] ?? "Player").toUpperCase();
        if (!tag) { tag = this.add.text(0, 0, name, { fontFamily: "Arial", fontSize: "9px", color: "#ffffff", fontStyle: "bold", backgroundColor: "#0d2f24cc", padding: { x: 3, y: 1 } }).setOrigin(0.5, 1).setDepth(8); this.tags.set(guestId, tag); }
        if (tag.text !== name) tag.setText(name);
        tag.setPosition(shown.x, shown.y - 18);
      }
    }

    private drawOrders(frame: TouchFrame) {
      this.orderGraphics.clear();
      const playing = frame.phase === "playing" || frame.phase === "slowmo";
      const marked = frame.marked !== null && playing ? this.shown.get(`attacker${frame.marked + 1}`) : null;
      if (marked) this.aiMarker.setPosition(marked.x - 22, marked.y - 44).setVisible(true);
      else this.aiMarker.setVisible(false);
      if (!playing) return;
      // Routes of the computer attackers, for the attacking team and the shared screen.
      const myTeam = this.mine?.team;
      if (myTeam === undefined || myTeam === frame.attacking) {
        frame.goals.forEach((goal, i) => {
          const at = this.shown.get(`attacker${i + 1}`);
          if (!goal || !at) return;
          this.orderGraphics.lineStyle(2, 0xa9dbef, 0.5).lineBetween(at.x, at.y, goal[0], goal[1]);
          this.orderGraphics.fillStyle(0xa9dbef, 0.7).fillCircle(goal[0], goal[1], 4);
        });
      }
      // What each computer defender is about to do: guard a spot (orange), lunge at a runner (red) or fake a gap (yellow).
      frame.intents.forEach((entry, i) => {
        const at = this.shown.get(DEFENDER_IDS[i]);
        if (!entry || !at || entry[0] === "home") return;
        const [intent, guard] = entry;
        const color = intent === "lunge" ? 0xff5a4f : intent === "bait" ? 0xf7e486 : 0xf2a354;
        if (i === 4) {
          this.orderGraphics.lineStyle(1, color, 0.45).lineBetween(at.x, at.y, at.x, guard);
          this.orderGraphics.lineStyle(3, color, 0.9).lineBetween(at.x - 11, guard, at.x + 11, guard);
        } else {
          this.orderGraphics.lineStyle(intent === "lunge" ? 3 : 1, color, intent === "lunge" ? 0.9 : 0.45).lineBetween(at.x, at.y, guard, at.y);
          this.orderGraphics.lineStyle(3, color, 0.9).lineBetween(guard, at.y - 10, guard, at.y + 10);
        }
      });
    }

    // Facing wedges, and the stamina bar of the player you control.
    private drawPlayers(frame: TouchFrame) {
      this.playerGraphics.clear();
      for (const [id, view] of this.views) {
        const memory = this.facing.get(id) ?? {};
        this.facing.set(id, memory);
        drawFacing(this.playerGraphics, memory, view.x, view.y, view.radius, id.startsWith("attacker") ? { x: 0, y: -1 } : { x: 0, y: 1 });
      }
      const mine = this.mine;
      const view = mine?.player ? this.views.get(mine.player) : null;
      const playing = frame.phase === "playing" || frame.phase === "slowmo";
      if (mine && view && playing && (mine.sprinting || mine.stamina < 1)) {
        const width = 30; const x = view.x - width / 2; const y = view.y + view.radius + 6;
        this.playerGraphics.fillStyle(0x0d2f24, 0.85).fillRect(x - 1, y - 1, width + 2, 6);
        this.playerGraphics.fillStyle(mine.stamina >= TOUCH.sprintMinimum || mine.sprinting ? 0xd7ec83 : 0xe9906c, 1).fillRect(x, y, width * mine.stamina, 4);
      }
    }
  };
}
