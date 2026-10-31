import "reflect-metadata";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";
import { allowOrigins } from "./setup";

// Starts the game server. Settings come from apps/server/.env when it exists, otherwise from the environment.
async function main() {
  try { process.loadEnvFile(join(__dirname, "..", ".env")); } catch { /* No .env file: use the environment as it is. */ }
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config));
  allowOrigins(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port, "0.0.0.0");
  const origins = config.webOrigins === true ? "any web address (set WEB_ORIGIN on a public server)" : config.webOrigins.join(", ");
  console.log(`Game server listening on port ${config.port} (database "${config.dbName}"), accepting ${origins}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
