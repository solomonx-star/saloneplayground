import "reflect-metadata";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";

// Starts the game server. Settings come from apps/server/.env when it exists, otherwise from the environment.
async function main() {
  try { process.loadEnvFile(join(__dirname, "..", ".env")); } catch { /* No .env file: use the environment as it is. */ }
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config), { cors: { origin: true } });
  app.enableShutdownHooks();
  await app.listen(config.port, "0.0.0.0");
  console.log(`Game server listening on port ${config.port} (database "${config.dbName}")`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
