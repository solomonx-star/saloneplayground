import { Inject, Injectable, type OnApplicationShutdown, type Provider } from "@nestjs/common";
import mongoose, { Schema, type Connection, type Model } from "mongoose";
import { REPORT_DAYS, type ReportReason } from "@salone/games/online/chat";
import type { GameId, RoomStatus } from "@salone/games/online/protocol";
import { CONFIG, type Config } from "./config";

// The MongoDB collections:
// - players: guests, by id, with a hash of the secret token that lets them come back as themselves.
// - rooms: every open room, by its code, with its seats and the live match (saved after every change so a server
//   restart can carry on). MongoDB deletes a room on its own once `expiresAt` passes.
// - matches: a record of every finished round, kept for history and stats.
// - sessions: one record each time a device plays a game (from start to leaving it), for the admin dashboard.
// - visitors: every device seen, by the random id it keeps, with when it was first and last seen.
// - reports: chat reports for the admins, each with the reported player's recent messages. MongoDB deletes them on
//   its own REPORT_DAYS after they were made. This is the only place chat is ever saved.

export type PlayerDoc = { _id: string; name: string; tokenHash: string; createdAt: Date; lastSeenAt: Date };
export type SeatDoc = { guestId: string | null; name: string; cpu: boolean; level: string };
export type RoomDoc = {
  _id: string;
  game: GameId;
  hostId: string;
  seats: SeatDoc[];
  status: RoomStatus;
  // Party play: the host is a shared screen with no seat.
  party: boolean;
  // Quick match: a public room strangers are matched into.
  public: boolean;
  // The settings the host chose in the lobby (for Ludo: the number of players and the house rules).
  options: unknown;
  match: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};
export type MatchDoc = { room: string; game: GameId; seats: SeatDoc[]; match: unknown; finishedAt: Date };

// `pingMs`: the device's typical round trip to the game server during the session (null when not measured).
export type SessionDoc = { visitorId: string; name: string; game: string; mode: string | null; startedAt: Date; endedAt: Date; seconds: number; pingMs: number | null };
export type VisitorDoc = { _id: string; name: string; firstSeenAt: Date; lastSeenAt: Date };

export type ReportDoc = {
  room: string;
  game: GameId;
  reportedId: string;
  reportedName: string;
  reporterId: string;
  reporterName: string;
  reason: ReportReason;
  messages: { text: string; at: Date }[];
  blocked: boolean;
  // "dismissed" once an admin has dealt with it.
  status: "open" | "dismissed";
  at: Date;
};

export type Models = { players: Model<PlayerDoc>; rooms: Model<RoomDoc>; matches: Model<MatchDoc>; sessions: Model<SessionDoc>; visitors: Model<VisitorDoc>; reports: Model<ReportDoc> };

export const CONNECTION = Symbol("connection");
export const MODELS = Symbol("models");

const seat = new Schema<SeatDoc>({ guestId: { type: String, default: null }, name: String, cpu: Boolean, level: String }, { _id: false });

const players = new Schema<PlayerDoc>({ _id: String, name: String, tokenHash: String, createdAt: Date, lastSeenAt: Date }, { versionKey: false });

const rooms = new Schema<RoomDoc>({
  _id: String,
  game: String,
  hostId: String,
  seats: [seat],
  status: String,
  party: { type: Boolean, default: false },
  public: { type: Boolean, default: false },
  options: { type: Schema.Types.Mixed, default: {} },
  match: { type: Schema.Types.Mixed, default: null },
  version: Number,
  createdAt: Date,
  updatedAt: Date,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
}, { versionKey: false, minimize: false });

const matches = new Schema<MatchDoc>({
  room: { type: String, index: true },
  game: String,
  seats: [seat],
  match: Schema.Types.Mixed,
  finishedAt: Date,
}, { versionKey: false, minimize: false });

const sessions = new Schema<SessionDoc>({
  visitorId: { type: String, index: true },
  name: String,
  game: String,
  mode: { type: String, default: null },
  pingMs: { type: Number, default: null },
  startedAt: Date,
  endedAt: { type: Date, index: true },
  seconds: Number,
}, { versionKey: false });

const visitors = new Schema<VisitorDoc>({ _id: String, name: String, firstSeenAt: { type: Date, index: true }, lastSeenAt: Date }, { versionKey: false });

const reports = new Schema<ReportDoc>({
  room: String,
  game: String,
  reportedId: String,
  reportedName: String,
  reporterId: String,
  reporterName: String,
  reason: String,
  messages: [{ _id: false, text: String, at: Date }],
  blocked: Boolean,
  status: { type: String, default: "open", index: true },
  at: { type: Date, index: { expireAfterSeconds: REPORT_DAYS * 24 * 3600 } },
}, { versionKey: false });

export const databaseProviders: Provider[] = [
  {
    provide: CONNECTION,
    inject: [CONFIG],
    useFactory: (config: Config) => mongoose.createConnection(config.mongoUri, { dbName: config.dbName }).asPromise(),
  },
  {
    provide: MODELS,
    inject: [CONNECTION],
    useFactory: async (connection: Connection): Promise<Models> => {
      const models = {
        players: connection.model<PlayerDoc>("Player", players, "players"),
        rooms: connection.model<RoomDoc>("Room", rooms, "rooms"),
        matches: connection.model<MatchDoc>("Match", matches, "matches"),
        sessions: connection.model<SessionDoc>("Session", sessions, "sessions"),
        visitors: connection.model<VisitorDoc>("Visitor", visitors, "visitors"),
        reports: connection.model<ReportDoc>("Report", reports, "reports"),
      };
      await Promise.all(Object.values(models).map((model) => model.init()));
      return models;
    },
  },
];

// Closes the MongoDB connection when the server shuts down.
@Injectable()
export class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(CONNECTION) private readonly connection: Connection) {}
  async onApplicationShutdown() { await this.connection.close(); }
}
