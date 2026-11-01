import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { LiveView, StatsView } from "@salone/games/online/admin";
import { CONFIG, type Config } from "./config";
import { MODELS, type Models } from "./database";
import { PresenceService } from "./presence.service";

const sha = (text: string) => createHash("sha256").update(text).digest();
// Rooms changed this recently are shown as open on the dashboard (older ones are waiting to expire).
const LIVE_ROOM_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The admin dashboard's data: who is online now, and play statistics over a number of days. Read over HTTP
// (admin.controller.ts) and pushed live over Socket.IO (game.gateway.ts); both check the ADMIN_TOKEN secret here.
@Injectable()
export class AdminService {
  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(MODELS) private readonly models: Models,
    @Inject(PresenceService) private readonly presence: PresenceService,
  ) {}

  // Why a token does not open the dashboard: it is off (no ADMIN_TOKEN set) or the token is wrong; null when it opens.
  tokenProblem(token: string): "off" | "wrong" | null {
    const secret = this.config.adminToken;
    if (!secret) return "off";
    return timingSafeEqual(sha(token), sha(secret)) ? null : "wrong";
  }

  async live(): Promise<LiveView> {
    const people = this.presence.live();
    const rooms = await this.models.rooms
      .find({ status: { $ne: "closed" }, updatedAt: { $gte: new Date(Date.now() - LIVE_ROOM_MS) } }, { game: 1, status: 1, party: 1, seats: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 }).limit(50).lean();
    return {
      at: new Date().toISOString(),
      online: people.length,
      playing: people.filter((p) => p.playing).length,
      people,
      rooms: rooms.map((r) => ({
        code: r._id,
        game: r.game,
        status: r.status,
        party: !!r.party,
        people: r.seats.filter((s) => !s.cpu && s.guestId).length,
        computers: r.seats.filter((s) => s.cpu).length,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async stats(daysWanted: unknown): Promise<StatsView> {
    const days = Math.min(365, Math.max(1, Math.round(Number(daysWanted) || 7)));
    // Whole days in UTC (Sierra Leone's time), counting today: "1 day" is today so far.
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const since = new Date(today.getTime() - (days - 1) * DAY_MS);
    const match = { endedAt: { $gte: since } };
    const { sessions, matches, visitors } = this.models;

    const [totals, games, daily, modes, topPlayers, recent, gameMatches, newPlayers, allTimePlayers] = await Promise.all([
      sessions.aggregate<{ sessions: number; seconds: number; players: string[] }>([
        { $match: match },
        { $group: { _id: null, sessions: { $sum: 1 }, seconds: { $sum: "$seconds" }, players: { $addToSet: "$visitorId" } } },
      ]),
      sessions.aggregate<{ _id: string; sessions: number; seconds: number; players: string[] }>([
        { $match: match },
        { $group: { _id: "$game", sessions: { $sum: 1 }, seconds: { $sum: "$seconds" }, players: { $addToSet: "$visitorId" } } },
        { $sort: { seconds: -1 } },
      ]),
      sessions.aggregate<{ _id: string; sessions: number; seconds: number; players: string[] }>([
        { $match: match },
        { $group: { _id: { $dateToString: { date: "$endedAt", format: "%Y-%m-%d" } }, sessions: { $sum: 1 }, seconds: { $sum: "$seconds" }, players: { $addToSet: "$visitorId" } } },
      ]),
      sessions.aggregate<{ _id: string | null; sessions: number; seconds: number }>([
        { $match: match },
        { $group: { _id: "$mode", sessions: { $sum: 1 }, seconds: { $sum: "$seconds" } } },
        { $sort: { seconds: -1 } },
      ]),
      sessions.aggregate<{ _id: string; name: string; sessions: number; seconds: number; games: string[]; lastPlayed: Date }>([
        { $match: match },
        { $sort: { endedAt: 1 } },
        { $group: { _id: "$visitorId", name: { $last: "$name" }, sessions: { $sum: 1 }, seconds: { $sum: "$seconds" }, games: { $addToSet: "$game" }, lastPlayed: { $last: "$endedAt" } } },
        { $sort: { seconds: -1 } },
        { $limit: 10 },
      ]),
      sessions.find(match).sort({ endedAt: -1 }).limit(25).lean(),
      matches.aggregate<{ _id: string; matches: number }>([
        { $match: { finishedAt: { $gte: since } } },
        { $group: { _id: "$game", matches: { $sum: 1 } } },
      ]),
      visitors.countDocuments({ firstSeenAt: { $gte: since } }),
      visitors.estimatedDocumentCount(),
    ]);

    // Online matches are stored under the server's game ids; the dashboard uses the web app's page names.
    const pageOf: Record<string, string> = { tintanto: "tin-tan-to" };
    const matchCount = new Map(gameMatches.map((m) => [pageOf[m._id] ?? m._id, m.matches]));
    const byDay = new Map(daily.map((d) => [d._id, d]));
    const total = totals[0];
    return {
      days,
      since: since.toISOString(),
      totals: {
        sessions: total?.sessions ?? 0,
        players: total?.players.length ?? 0,
        seconds: total?.seconds ?? 0,
        newPlayers,
        allTimePlayers,
        matches: gameMatches.reduce((sum, m) => sum + m.matches, 0),
      },
      games: games.map((g) => ({ game: g._id, sessions: g.sessions, players: g.players.length, seconds: g.seconds, matches: matchCount.get(g._id) ?? 0 })),
      // Every day in the range, including days with no play.
      daily: Array.from({ length: days }, (_, i) => {
        const day = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        const d = byDay.get(day);
        return { day, sessions: d?.sessions ?? 0, players: d?.players.length ?? 0, seconds: d?.seconds ?? 0 };
      }),
      modes: modes.map((m) => ({ mode: m._id ?? "unknown", sessions: m.sessions, seconds: m.seconds })),
      topPlayers: topPlayers.map((p) => ({ visitorId: p._id, name: p.name, sessions: p.sessions, seconds: p.seconds, games: p.games, lastPlayed: p.lastPlayed.toISOString() })),
      recent: recent.map((r) => ({ visitorId: r.visitorId, name: r.name, game: r.game, mode: r.mode, startedAt: r.startedAt.toISOString(), endedAt: r.endedAt.toISOString(), seconds: r.seconds })),
    };
  }
}
