// Settings for the game server, from environment variables. At start-up apps/server/.env is read when it exists
// (it holds MONGODB_URI and is never committed); see .env.example.

export type Config = {
  port: number;
  mongoUri: string;
  // The database inside the MongoDB cluster: keep development and live games apart.
  dbName: string;
  // How long a room is kept after its last change before MongoDB deletes it.
  roomHours: number;
  // How long a computer player waits before moving, so people can follow the game.
  cpuDelayMs: number;
  // How long to wait for a player who is away (disconnected) on their turn before playing for them, in games that
  // play on (Ludo).
  awaySeconds: number;
  // Multiplies every turn and away time limit; 1 in real play (tests make it small so timers run out quickly).
  timeScale: number;
  // The web app addresses allowed to connect (from WEB_ORIGIN, comma-separated), or true to allow any: fine on this
  // computer and the local network while developing, but set it when the server is public.
  webOrigins: string[] | true;
  // The secret that opens the admin dashboard (ADMIN_TOKEN). Empty turns the dashboard off.
  adminToken: string;
};

export const CONFIG = Symbol("config");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mongoUri = env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error("MONGODB_URI is not set. Put it in apps/server/.env (see apps/server/.env.example).");
  return {
    port: Number(env.PORT ?? 4000),
    mongoUri,
    dbName: env.MONGODB_DB?.trim() || "salone_dev",
    roomHours: Number(env.ROOM_HOURS ?? 12),
    cpuDelayMs: Number(env.CPU_DELAY_MS ?? 700),
    awaySeconds: Number(env.AWAY_SECONDS ?? 30),
    timeScale: 1,
    webOrigins: parseOrigins(env.WEB_ORIGIN),
    adminToken: env.ADMIN_TOKEN?.trim() ?? "",
  };
}

// "https://play.example.com, https://example.up.railway.app/" → ["https://play.example.com", "https://example.up.railway.app"].
export function parseOrigins(value: string | undefined): string[] | true {
  const origins = (value ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  return origins.length ? origins : true;
}
