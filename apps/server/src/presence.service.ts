import { Inject, Injectable, type BeforeApplicationShutdown } from "@nestjs/common";
import type { LivePerson, PresenceReport } from "@salone/games/online/admin";
import { CONFIG, type Config } from "./config";
import { MODELS, type Models } from "./database";

// One open screen: what it last reported, and when its current game session began.
type Screen = PresenceReport & { connectedAt: number; sessionStart: number | null };

// Sessions shorter than this (opening a game and leaving straight away) are not recorded. Scaled by timeScale.
const MIN_SESSION_SECONDS = 5;

// Who is on the site right now and what they are playing, for the admin dashboard. Every screen reports what it
// shows; the live picture is kept in memory, and each game session is saved when it ends (the screen moves on,
// disconnects, or the server shuts down).
@Injectable()
export class PresenceService implements BeforeApplicationShutdown {
  private readonly screens = new Map<string, Screen>();
  // Told when the live picture changes, and when a game session has been saved.
  private readonly changeListeners: (() => void)[] = [];
  private readonly sessionListeners: (() => void)[] = [];

  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(@Inject(MODELS) private readonly models: Models, @Inject(CONFIG) private readonly config: Config) {}

  onChange(listener: () => void) { this.changeListeners.push(listener); }
  onSession(listener: () => void) { this.sessionListeners.push(listener); }

  async report(socketId: string, report: PresenceReport, now = Date.now()) {
    const before = this.screens.get(socketId);
    const same = before && before.game === report.game && before.mode === report.mode && before.playing === report.playing;
    const sessionStart = report.playing ? (same ? before.sessionStart : now) : null;
    // The live picture changes first, so reports arriving close together are handled in order.
    this.screens.set(socketId, { ...report, connectedAt: before?.connectedAt ?? now, sessionStart });
    if (!same) this.changed();
    await Promise.all([
      before?.playing && !same ? this.endSession(before, now) : null,
      this.models.visitors.updateOne(
        { _id: report.visitorId },
        { $set: { name: report.name, lastSeenAt: new Date(now) }, $setOnInsert: { firstSeenAt: new Date(now) } },
        { upsert: true },
      ),
    ]);
  }

  async disconnected(socketId: string, now = Date.now()) {
    const screen = this.screens.get(socketId);
    if (!screen) return;
    this.screens.delete(socketId);
    this.changed();
    if (screen.playing) await this.endSession(screen, now);
  }

  // Everyone online, one row per device (a device with several tabs shows the one that is playing).
  live(now = Date.now()): LivePerson[] {
    const people = new Map<string, LivePerson>();
    for (const screen of this.screens.values()) {
      const row: LivePerson = {
        visitorId: screen.visitorId,
        name: screen.name,
        game: screen.game,
        mode: screen.mode,
        playing: screen.playing,
        onlineSeconds: Math.round((now - screen.connectedAt) / 1000),
        playingSeconds: screen.sessionStart ? Math.round((now - screen.sessionStart) / 1000) : 0,
        screens: 1,
      };
      const known = people.get(screen.visitorId);
      if (!known) { people.set(screen.visitorId, row); continue; }
      const keep = known.playing || !row.playing ? known : row;
      people.set(screen.visitorId, { ...keep, screens: known.screens + 1, onlineSeconds: Math.max(known.onlineSeconds, row.onlineSeconds) });
    }
    return [...people.values()].sort((a, b) => Number(b.playing) - Number(a.playing) || b.playingSeconds - a.playingSeconds || b.onlineSeconds - a.onlineSeconds);
  }

  // Saves the sessions still open, so a restart does not lose them.
  async beforeApplicationShutdown() {
    const now = Date.now();
    const open = [...this.screens.values()].filter((s) => s.playing);
    this.screens.clear();
    await Promise.all(open.map((s) => this.endSession(s, now)));
  }

  private changed() { for (const listener of this.changeListeners) listener(); }

  private async endSession(screen: Screen, now: number) {
    if (!screen.game || screen.sessionStart === null) return;
    const seconds = Math.round((now - screen.sessionStart) / 1000);
    if (now - screen.sessionStart < MIN_SESSION_SECONDS * 1000 * this.config.timeScale) return;
    await this.models.sessions.create({
      visitorId: screen.visitorId,
      name: screen.name,
      game: screen.game,
      mode: screen.mode,
      startedAt: new Date(screen.sessionStart),
      endedAt: new Date(now),
      seconds,
    });
    for (const listener of this.sessionListeners) listener();
  }
}
