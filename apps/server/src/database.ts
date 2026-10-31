import { Inject, Injectable, type OnApplicationShutdown, type Provider } from "@nestjs/common";
import mongoose, { Schema, type Connection, type Model } from "mongoose";
import type { GameId, RoomStatus } from "@salone/games/online/protocol";
import { CONFIG, type Config } from "./config";

// The MongoDB collections:
// - players: guests, by id, with a hash of the secret token that lets them come back as themselves.
// - rooms: every open room, by its code, with its seats and the live match (saved after every change so a server
//   restart can carry on). MongoDB deletes a room on its own once `expiresAt` passes.
// - matches: a record of every finished round, kept for history and stats.

export type PlayerDoc = { _id: string; name: string; tokenHash: string; createdAt: Date; lastSeenAt: Date };
export type SeatDoc = { guestId: string | null; name: string; cpu: boolean; level: string };
export type RoomDoc = {
  _id: string;
  game: GameId;
  hostId: string;
  seats: SeatDoc[];
  status: RoomStatus;
  // The settings the host chose in the lobby (for Ludo: the number of players and the house rules).
  options: unknown;
  match: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};
export type MatchDoc = { room: string; game: GameId; seats: SeatDoc[]; match: unknown; finishedAt: Date };

export type Models = { players: Model<PlayerDoc>; rooms: Model<RoomDoc>; matches: Model<MatchDoc> };

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
