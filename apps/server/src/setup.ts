import type { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import type { Config } from "./config";

// Socket.IO with the allowed web addresses from the settings (the gateway decorator cannot read settings).
class GameIoAdapter extends IoAdapter {
  constructor(app: INestApplication, private readonly origins: string[] | true) { super(app); }
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.origins } });
  }
}

// Lets in only the web app's addresses, for plain HTTP requests and for the game's Socket.IO connections.
export function allowOrigins(app: INestApplication, config: Config) {
  app.enableCors({ origin: config.webOrigins });
  app.useWebSocketAdapter(new GameIoAdapter(app, config.webOrigins));
}
