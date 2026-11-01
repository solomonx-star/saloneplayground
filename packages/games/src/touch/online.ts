import type { DefenderIntent } from "./defenders";
import type { Point } from "./field";
import { TouchMatch, type Phase, type Player, type Team, type TouchEvent } from "./match";
import { LEVELS, type Level } from "./settings";

// Touch for online and party play. The game server runs the match on its own clock and sends every screen in the
// room a frame many times a second; people send their stick and buttons. Seats alternate between the teams: even
// seats play for Blue (team 0, attacks first), odd seats for Orange (team 1). The computer plays everyone else.

export const TEAMS = ["Blue", "Orange"] as const;
// A team has at most five people: there are five defenders to control when it defends.
export const MAX_PEOPLE = 5;
export const TEAM_SIZES = [3, 4, 5, 6];
// Online runs have a time limit, so a careful team (or one person standing still) cannot hold up the match.
export const RUN_SECONDS = 90;
// The server steps the match every TICK_MS and sends a frame after each step.
export const TICK_MS = 40;

export type TouchOptions = { count: number; level: Level };
export type TouchAction = { type: "begin" } | { type: "switch"; to?: string } | { type: "rematch" };
export type TouchInputMessage = { x: number; y: number; sprint: boolean };

// What is saved between runs (and shown in the room's view): enough to carry the match on after a server restart.
export type TouchSummary = { count: number; level: Level; score: [number, number]; turn: number; totalTurns: number; attacking: Team; over: boolean };

export type WireEvent =
  | { type: "line"; team: Team; x: number; y: number }
  | { type: "home"; team: Team; attacker: string }
  | { type: "touch"; attacker: string; defender: string }
  | { type: "turnOver"; reason: "touch" | "time"; attacker: string | null; defender: string | null; over: boolean }
  | { type: "mark"; attacker: string };

export type TouchFrame = {
  tick: number;
  phase: Phase;
  attacking: Team;
  score: [number, number];
  turn: number;
  totalTurns: number;
  // Milliseconds left in the run, when it has a time limit and is on.
  clock: number | null;
  // Positions as [x, y]: the attackers in order, then Line 1 to Line 4 defenders and the Main Line defender.
  attackers: [number, number][];
  defenders: [number, number][];
  // Where each computer attacker is heading, for drawing their routes.
  goals: ([number, number] | null)[];
  // What each computer defender is doing and where it is going (x for line defenders, y for the Main Line).
  intents: ([DefenderIntent, number] | null)[];
  // The attacker the Main Line has marked, by index.
  marked: number | null;
  // Each person playing, by guest id: the player they control (its id), their team and stamina.
  people: Record<string, { player: string | null; team: Team; stamina: number; sprinting: boolean }>;
  events: WireEvent[];
};

export const teamOfSeat = (seat: number): Team => (seat % 2) as Team;
export const seatsFor = (count: number) => 2 * Math.min(count, MAX_PEOPLE);

export function readOptions(requested: unknown, current: TouchOptions): TouchOptions {
  const asked = (requested ?? {}) as Partial<TouchOptions>;
  return {
    count: TEAM_SIZES.includes(asked.count as number) ? (asked.count as number) : current.count,
    level: typeof asked.level === "string" && asked.level in LEVELS ? asked.level : current.level,
  };
}

export function newSummary(options: TouchOptions): TouchSummary {
  return { level: options.level, ...summarize(buildMatch(options)) };
}

// A match as the server runs it: both teams' computer players at the room's level, with a time limit on each run.
export function buildMatch(options: TouchOptions, random?: () => number) {
  const tuning = LEVELS[options.level] ?? LEVELS.normal;
  return new TouchMatch({ count: options.count, tuning: [tuning, tuning], random, runSeconds: RUN_SECONDS });
}

export function summarize(match: TouchMatch): Omit<TouchSummary, "level"> {
  return { count: match.count, score: [...match.score], turn: match.turn, totalTurns: match.totalTurns, attacking: match.attacking, over: match.phase === "over" };
}

const round = (value: number) => Math.round(value * 10) / 10;
const pair = (point: Point): [number, number] => [round(point.x), round(point.y)];

export function wireEvent(event: TouchEvent): WireEvent {
  switch (event.type) {
    case "line": return event;
    case "home": return { type: "home", team: event.team, attacker: event.attacker.id };
    case "touch": return { type: "touch", attacker: event.attacker.id, defender: event.defender.id };
    case "turnOver": return { type: "turnOver", reason: event.reason, attacker: event.attacker?.id ?? null, defender: event.defender?.id ?? null, over: event.over };
    case "mark": return { type: "mark", attacker: event.attacker.id };
  }
}

export function frameOf(match: TouchMatch, tick: number, events: TouchEvent[]): TouchFrame {
  const people: TouchFrame["people"] = {};
  for (const [id, c] of match.controllers) people[id] = { player: c.body?.id ?? null, team: c.team, stamina: round(c.stamina), sprinting: c.sprinting };
  const computer = (player: Player) => !match.controllerOf(player);
  return {
    tick,
    phase: match.phase,
    attacking: match.attacking,
    score: [...match.score],
    turn: match.turn,
    totalTurns: match.totalTurns,
    clock: match.runEndsAt !== null && match.active ? Math.max(0, Math.round(match.runEndsAt - match.now)) : null,
    attackers: match.attackers.map(pair),
    defenders: match.defenders.map(pair),
    goals: match.attackers.map((a) => {
      const goal = a.getData("goal") as Point | null | undefined;
      return goal && computer(a) ? pair(goal) : null;
    }),
    intents: match.defenders.map((d) => {
      const intent = d.getData("intent") as DefenderIntent | null | undefined;
      if (!intent || !computer(d)) return null;
      return [intent, round(d.getData(d.role === "main" ? "guardY" : "guardX") as number)];
    }),
    marked: match.aiTarget ? match.attackers.indexOf(match.aiTarget) : null,
    people,
    events: events.map(wireEvent),
  };
}
