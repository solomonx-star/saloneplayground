import { chooseOpenLane, moveComputerAttackers } from "./attackers";
import { chooseComputerTarget, goalOf, moveComputerDefenders, nextTrapLine, threatScore } from "./defenders";
import { clamp, FIELD_W, HOME_LINE, LINES, MID, START_Y, TOUCH_RADIUS, TURN_LINE, linesCrossed, type Body } from "./field";
import { TOUCH, type SideTuning } from "./settings";
import type { World } from "./world";

// A Touch match without any drawing: the same rules run in the browser for one-device play and on the game server for
// online play. The screen calls step() every frame and draws the players; step() returns what happened for sounds and effects.

export type Team = 0 | 1;
export type Role = "attacker" | "line" | "main";
export type TouchInput = { x: number; y: number; sprint: boolean };
// ready: lined up for the next turn. playing: the run is on. slowmo: a touch is playing out before the sides change.
// stopped: the turn has ended and the players stay where they were. over: full time.
export type Phase = "ready" | "playing" | "slowmo" | "stopped" | "over";

export type TouchEvent =
  | { type: "line"; team: Team; x: number; y: number }
  | { type: "home"; team: Team; attacker: Player }
  | { type: "touch"; attacker: Player; defender: Player }
  // The sides change (or the match ends) after a touch, or when the run's time is up.
  | { type: "turnOver"; reason: "touch" | "time"; attacker: Player | null; defender: Player | null; over: boolean }
  | { type: "mark"; attacker: Player };

// One player on the field, with the scratch data the computer players keep on it.
export class Player implements Body {
  active = true;
  private readonly data = new Map<string, unknown>();
  constructor(readonly id: string, readonly role: Role, readonly name: string, public x: number, public y: number) {}
  getData(key: string) { return this.data.get(key); }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
}

// A person playing: the player they control now, their stick and sprint button, and their stamina.
export type Controller = { team: Team; body: Player | null; input: TouchInput; stamina: number; sprinting: boolean };

export type MatchOptions = {
  // Attackers on each team.
  count: number;
  // How each team's computer players play.
  tuning: [SideTuning, SideTuning];
  random?: () => number;
  // A time limit on each run, after which the sides change as if the runner were touched. None on one device.
  runSeconds?: number | null;
};

const ATTACKER_KEYS = ["goal", "mode", "think", "targetX", "holdTime", "courage", "crossLine"];
const DEFENDER_KEYS = ["goal", "guardX", "guardY", "baitUntil", "intent"];

export class TouchMatch {
  attackers: Player[] = [];
  // Line 1 to Line 4 defenders, then the Main Line defender.
  readonly defenders: Player[];
  readonly mainDefender: Player;
  readonly controllers = new Map<string, Controller>();
  readonly totalTurns = TOUCH.turnsPerTeam * 2;
  count: number;
  tuning: [SideTuning, SideTuning];
  readonly runSeconds: number | null;
  // When the current run's time is up, on the match clock, if runs have a time limit.
  runEndsAt: number | null = null;
  attacking: Team = 0;
  score: [number, number] = [0, 0];
  turn = 1;
  phase: Phase = "ready";
  // The attacker the Main Line has marked as the biggest threat.
  aiTarget: Player | null = null;
  // Match clock in milliseconds. It runs at normal speed through the slow motion.
  now = 0;
  private readonly random: () => number;
  private orderSignature = "";
  private announced: Player | null = null;
  private slowMoUntil = 0;
  private touched: { attacker: Player; defender: Player } | null = null;

  constructor(options: MatchOptions) {
    this.count = options.count;
    this.tuning = options.tuning;
    this.random = options.random ?? Math.random;
    this.runSeconds = options.runSeconds ?? null;
    this.defenders = LINES.map((lineY, i) => new Player(`line${i + 1}`, "line", `Line ${i + 1} defender`, i % 2 ? FIELD_W - 130 : 130, lineY).setData("lineY", lineY));
    this.mainDefender = new Player("main", "main", "Main Line defender", MID, 300).setData("main", true);
    this.defenders.push(this.mainDefender);
    this.newMatch();
  }

  get active() { return this.phase === "playing" || this.phase === "slowmo"; }

  // Adds a person to a team. They take the first free player on their side straight away (or none, when every
  // player is taken; they get one at the next line-up if there is room).
  join(id: string, team: Team) {
    if (this.controllers.get(id)?.team === team) return;
    this.leave(id);
    const controller: Controller = { team, body: null, input: { x: 0, y: 0, sprint: false }, stamina: 1, sprinting: false };
    this.controllers.set(id, controller);
    const free = this.side(team).find((player) => !this.controllerOf(player));
    if (free) this.take(controller, free);
  }

  leave(id: string) {
    const controller = this.controllers.get(id);
    if (controller?.body && controller.team === this.attacking) controller.body.setData("mode", null);
    this.controllers.delete(id);
  }

  setInput(id: string, input: TouchInput) {
    const controller = this.controllers.get(id);
    if (controller) controller.input = input;
  }

  newMatch() {
    this.restore({ score: [0, 0], turn: 1, attacking: 0, over: false });
  }

  // Carries on a saved match from the line-up of its current turn.
  restore(saved: { score: [number, number]; turn: number; attacking: Team; over: boolean }) {
    this.score = [...saved.score]; this.turn = saved.turn; this.attacking = saved.attacking;
    this.reset();
    if (saved.over) this.phase = "over";
  }

  // Lines everyone up and starts the run. Returns false at full time.
  begin() {
    if (this.phase === "over") return false;
    this.reset();
    this.phase = "playing";
    this.runEndsAt = this.runSeconds ? this.now + this.runSeconds * 1000 : null;
    return true;
  }

  world(): World {
    return {
      attackers: this.attackers,
      defenders: this.defenders,
      mainDefender: this.mainDefender,
      humans: this.humanBodies(),
      aiTarget: this.aiTarget,
      attack: this.tuning[this.attacking],
      defense: this.tuning[1 - this.attacking],
      now: this.now,
      random: this.random,
    };
  }

  // The players a team can control right now: its attackers, or its defenders with the Main Line first.
  side(team: Team) {
    return team === this.attacking ? this.attackers : [this.mainDefender, ...this.defenders.filter((d) => d !== this.mainDefender)];
  }

  controllerOf(body: Player) {
    for (const controller of this.controllers.values()) if (controller.body === body) return controller;
    return null;
  }

  // Hands a person another player on their side who nobody else controls. Only while the run is on.
  control(id: string, body: Player | null | undefined) {
    const controller = this.controllers.get(id);
    if (!this.active || !controller || !body || body === controller.body) return false;
    if (!this.side(controller.team).includes(body) || this.controllerOf(body)) return false;
    this.take(controller, body);
    return true;
  }

  private take(controller: Controller, body: Player) {
    const attacking = controller.team === this.attacking;
    // The player let go picks a fresh plan; the one taken over drops its computer route.
    if (attacking) controller.body?.setData("mode", null);
    controller.body = body;
    if (attacking) body.setData("goal", null);
  }

  // The next free player on the person's side, in field order (Space or the SWITCH button).
  switchNext(id: string) {
    const controller = this.controllers.get(id);
    if (!controller) return false;
    const own = controller.team === this.attacking ? this.attackers : this.defenders;
    const index = controller.body ? own.indexOf(controller.body) : -1;
    for (let i = 1; i <= own.length; i++) {
      const next = own[(index + i) % own.length];
      if (!this.controllerOf(next)) return this.control(id, next);
    }
    return false;
  }

  step(deltaMs: number): TouchEvent[] {
    const events: TouchEvent[] = [];
    this.now += deltaMs;
    let dt = Math.min(deltaMs / 1000, 0.04);
    const slowMo = this.phase === "slowmo";
    if (slowMo) {
      dt *= TOUCH.slowMoScale;
      if (this.now >= this.slowMoUntil) {
        const { attacker, defender } = this.touched!;
        this.finishTurn(events, "touch", attacker, defender);
      }
    } else if (this.phase === "playing" && this.runEndsAt !== null && this.now >= this.runEndsAt) this.finishTurn(events, "time", null, null);
    this.updateMarking(events);
    if (!this.active) return events;
    const humanSteps = new Map<Controller, number>();
    for (const controller of this.controllers.values()) {
      if (!controller.body) continue;
      const { x, y } = controller.input;
      this.updateSprint(controller, dt, Math.hypot(x, y) > 0.1 && !slowMo);
      humanSteps.set(controller, TOUCH.humanSpeed * (controller.sprinting ? TOUCH.sprintMultiplier : 1) * dt);
    }
    const world = this.world();
    moveComputerDefenders(world, dt);
    moveComputerAttackers(world, dt);
    for (const [controller, step] of humanSteps) moveControlled(controller.body!, step, controller.input.x, controller.input.y);
    if (!slowMo) this.checkAttackers(events);
    return events;
  }

  private humanBodies() {
    const bodies = new Set<Body>();
    for (const controller of this.controllers.values()) if (controller.body) bodies.add(controller.body);
    return bodies;
  }

  private reset() {
    this.phase = "ready";
    this.touched = null;
    this.runEndsAt = null;
    this.aiTarget = null;
    this.announced = null;
    this.orderSignature = "";
    this.defenders.forEach((defender, i) => {
      for (const key of DEFENDER_KEYS) defender.setData(key, null);
      const lineY = defender.getData("lineY") as number | undefined;
      const homeX = lineY === undefined ? MID : i % 2 ? FIELD_W - 130 : 130;
      defender.x = homeX; defender.y = lineY ?? 300;
      defender.setData("homeX", homeX);
    });
    this.attackers = [];
    for (let i = 0; i < this.count; i++) {
      const attacker = new Player(`attacker${i + 1}`, "attacker", `Player ${i + 1}`, MID + (i - (this.count - 1) / 2) * 38, START_Y);
      for (const key of ATTACKER_KEYS) attacker.setData(key, null);
      attacker.setData("direction", 1);
      attacker.setData("goal", { x: chooseOpenLane(this.world()), y: TURN_LINE });
      attacker.setData("prevY", attacker.y);
      attacker.setData("crossed", new Set<string>());
      this.attackers.push(attacker);
    }
    // Each person takes the next player on their side: attackers in order, defenders from the Main Line out.
    for (const team of [0, 1] as Team[]) {
      const own = this.side(team);
      let next = 0;
      for (const controller of this.controllers.values()) {
        if (controller.team !== team) continue;
        Object.assign(controller, { body: own[next++] ?? null, input: { x: 0, y: 0, sprint: false }, stamina: 1, sprinting: false });
        if (controller.body && team === this.attacking) controller.body.setData("goal", null);
      }
    }
  }

  // The Main Line keeps marking the most dangerous attacker while people attack.
  private updateMarking(events: TouchEvent[]) {
    const peopleAttack = [...this.controllers.values()].some((controller) => controller.team === this.attacking && controller.body);
    if (peopleAttack) {
      const world = this.world();
      const signature = this.attackers.map((player) => {
        const goal = goalOf(world, player);
        if (!goal) return "";
        const nextLine = nextTrapLine(world, player) ?? "clear";
        const fieldSide = player.y < HOME_LINE ? "field" : "start-side";
        return `${player.name}:${Math.round(goal.x / 80)},${goal.y.toFixed(0)}:${nextLine}:${fieldSide}`;
      }).join("|");
      if (signature !== this.orderSignature) {
        this.orderSignature = signature;
        // Keep the marked attacker unless another is clearly more dangerous, so the Main Line does not flip targets every step.
        const next = chooseComputerTarget(world) as Player | null;
        const current = this.aiTarget;
        const keep = current && next && current !== next && current.active && goalOf(world, current) && threatScore(world, current) >= threatScore(world, next) - 0.3;
        this.aiTarget = keep ? current : next;
      }
    } else {
      this.orderSignature = "";
      this.aiTarget = null;
    }
    if (this.phase === "playing" && this.aiTarget !== this.announced) {
      this.announced = this.aiTarget;
      if (this.aiTarget) events.push({ type: "mark", attacker: this.aiTarget });
    }
  }

  private checkAttackers(events: TouchEvent[]) {
    for (const attacker of this.attackers) {
      if (attacker.y <= TURN_LINE) attacker.setData("direction", -1);
      const toucher = this.defenders.find((defender) => Math.hypot(attacker.x - defender.x, attacker.y - defender.y) < TOUCH_RADIUS);
      if (toucher) {
        this.phase = "slowmo";
        this.slowMoUntil = this.now + TOUCH.slowMoMs;
        this.touched = { attacker, defender: toucher };
        events.push({ type: "touch", attacker, defender: toucher });
        return;
      }
      const direction = attacker.getData("direction") as number;
      const crossed = attacker.getData("crossed") as Set<string>;
      for (const lineY of linesCrossed(attacker.getData("prevY") as number, attacker.y, direction)) {
        const key = `${lineY}:${direction}`;
        if (crossed.has(key)) continue;
        crossed.add(key);
        this.score[this.attacking] += TOUCH.linePoints;
        events.push({ type: "line", team: this.attacking, x: attacker.x, y: lineY });
      }
      attacker.setData("prevY", attacker.y);
      if (direction === -1 && attacker.y >= HOME_LINE) {
        // Home safe: the same team attacks again.
        this.score[this.attacking] += TOUCH.homePoints;
        this.phase = "stopped";
        this.runEndsAt = null;
        events.push({ type: "home", team: this.attacking, attacker });
        return;
      }
    }
  }

  // After a touch's slow motion, or when the run's time is up: the sides change, or the match ends after the last turn.
  private finishTurn(events: TouchEvent[], reason: "touch" | "time", attacker: Player | null, defender: Player | null) {
    this.touched = null;
    this.runEndsAt = null;
    const over = this.turn >= this.totalTurns;
    if (over) this.phase = "over";
    else {
      this.phase = "stopped";
      this.turn++;
      this.attacking = (1 - this.attacking) as Team;
    }
    events.push({ type: "turnOver", reason, attacker, defender, over });
  }

  private updateSprint(controller: Controller, dt: number, moving: boolean) {
    const wants = moving && controller.input.sprint;
    const canSprint = controller.sprinting ? controller.stamina > 0 : controller.stamina >= TOUCH.sprintMinimum;
    controller.sprinting = wants && canSprint;
    controller.stamina = controller.sprinting
      ? Math.max(0, controller.stamina - TOUCH.sprintDrain * dt)
      : Math.min(1, controller.stamina + TOUCH.sprintRegen * dt);
  }
}

// Line defenders only run along their line and the Main Line defender only along the Main Line; attackers go anywhere.
export function moveControlled(player: Player, step: number, axisX: number, axisY: number) {
  if (player.role === "line") player.x = clamp(player.x + clamp(axisX, -1, 1) * step, 42, FIELD_W - 42);
  else if (player.role === "main") player.y = clamp(player.y + clamp(axisY, -1, 1) * step, 52, 518);
  else {
    // Stick input is analog (a partial push moves slower); keys and combined input are capped at full speed.
    const length = Math.hypot(axisX, axisY);
    const scale = length > 1 ? 1 / length : 1;
    player.setData("vel", length > 0 ? { x: axisX / length, y: axisY / length } : { x: 0, y: 0 });
    if (length > 0) {
      player.x = clamp(player.x + axisX * scale * step, 44, FIELD_W - 44);
      player.y = clamp(player.y + axisY * scale * step, 44, 556);
    }
  }
}
