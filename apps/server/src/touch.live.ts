import type { TouchEvent, TouchMatch } from "@salone/games/touch/match";
import { buildMatch, frameOf, summarize, teamOfSeat, TICK_MS, type TouchAction, type TouchFrame, type TouchOptions, type TouchSummary } from "@salone/games/touch/online";

type Live = { match: TouchMatch; options: TouchOptions; tick: number; timer?: NodeJS.Timeout; last: number };

export type TouchHooks = {
  // A frame for everyone in the room.
  frame(code: string, frame: TouchFrame): void;
  // A run has ended (home, touch or time): the score and turn should be saved.
  runEnded(code: string): void;
};

// The live Touch matches, one per playing room. While a run is on the match steps every TICK_MS and each step is
// sent to the room as a frame; between runs nothing ticks. RoomsService owns the rooms and calls in here.
export class TouchLive {
  private readonly rooms = new Map<string, Live>();

  constructor(private readonly hooks: TouchHooks, private readonly random: () => number) {}

  // Starts a room's match, or carries a saved one on from the line-up of its current turn (after a server restart).
  open(code: string, options: TouchOptions, saved: TouchSummary | null) {
    this.close(code);
    const match = buildMatch(options, this.random);
    if (saved) match.restore(saved);
    this.rooms.set(code, { match, options, tick: 0, last: 0 });
  }

  close(code: string) {
    clearInterval(this.rooms.get(code)?.timer);
    this.rooms.delete(code);
  }

  closeAll() { for (const code of [...this.rooms.keys()]) this.close(code); }

  // The match as it is now, for a screen that has just opened the room.
  frame(code: string): TouchFrame | null {
    const live = this.rooms.get(code);
    return live ? frameOf(live.match, live.tick, []) : null;
  }

  summary(code: string): TouchSummary | null {
    const live = this.rooms.get(code);
    return live ? { level: live.options.level, ...summarize(live.match) } : null;
  }

  // The people playing now: guests in a seat with the room open. Anyone else's player goes back to the computer.
  people(code: string, people: { guestId: string; seat: number }[]) {
    const live = this.rooms.get(code);
    if (!live) return;
    const seated = new Set(people.map((p) => p.guestId));
    for (const id of [...live.match.controllers.keys()]) if (!seated.has(id)) live.match.leave(id);
    for (const { guestId, seat } of [...people].sort((a, b) => a.seat - b.seat)) live.match.join(guestId, teamOfSeat(seat));
    this.send(code, live, []);
  }

  // An action from a guest (null for a party room's shared screen). Returns why it was refused, or whether the
  // saved summary changed.
  act(code: string, guestId: string | null, action: TouchAction): { changed: boolean } | string {
    const live = this.rooms.get(code);
    if (!live) return "The game has not started yet.";
    const { match } = live;
    switch (action?.type) {
      case "begin":
        if (match.active) return "The run is already on.";
        if (!match.begin()) return "It is full time. Start a rematch to play again.";
        live.last = performance.now();
        this.send(code, live, []);
        live.timer = setInterval(() => this.tick(code, live), TICK_MS);
        return { changed: false };
      case "rematch":
        if (match.phase !== "over") return "The match is not over yet.";
        match.newMatch();
        this.send(code, live, []);
        return { changed: true };
      case "switch": {
        if (!guestId || !match.controllers.has(guestId)) return "You are not playing in this match.";
        if (!match.active) return "Wait for the run to start.";
        if (match.controllers.get(guestId)!.team === match.attacking) return "Runners keep their player for the whole run.";
        const target = typeof action.to === "string" ? [...match.attackers, ...match.defenders].find((p) => p.id === action.to) : null;
        const switched = action.to === undefined ? match.switchNext(guestId) : match.control(guestId, target);
        if (!switched) return "Nobody free to switch to.";
        this.send(code, live, []);
        return { changed: false };
      }
      default:
        return "Unknown action.";
    }
  }

  // A person's stick and sprint button. Each axis runs from -1 to 1.
  input(code: string, guestId: string, input: unknown) {
    const live = this.rooms.get(code);
    if (!live) return;
    const { x, y, sprint } = (input ?? {}) as Record<string, unknown>;
    const axis = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);
    live.match.setInput(guestId, { x: axis(x), y: axis(y), sprint: sprint === true });
  }

  // Steps the match by the time that has really passed (in whole ticks, so a late timer catches up), then sends a frame.
  private tick(code: string, live: Live) {
    const now = performance.now();
    const steps = Math.min(5, Math.max(1, Math.round((now - live.last) / TICK_MS)));
    live.last += steps * TICK_MS;
    if (now - live.last > TICK_MS * 5) live.last = now;
    const events: TouchEvent[] = [];
    for (let i = 0; i < steps && live.match.active; i++) events.push(...live.match.step(TICK_MS));
    this.send(code, live, events);
    if (events.some((event) => event.type === "home" || event.type === "turnOver")) this.hooks.runEnded(code);
    if (!live.match.active) { clearInterval(live.timer); live.timer = undefined; }
  }

  private send(code: string, live: Live, events: TouchEvent[]) {
    live.tick += 1;
    this.hooks.frame(code, frameOf(live.match, live.tick, events));
  }
}
