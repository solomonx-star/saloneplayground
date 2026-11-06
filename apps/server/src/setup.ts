import type { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import type { Config } from "./config";

// How Socket.IO talks to screens on slow, costly mobile data:
// - Each WebSocket connection is compressed as a stream (permessage-deflate with context takeover), so a message that
//   repeats much of the one before (a Touch frame, a room update) costs a fraction of its size: about 60 bytes for a
//   576-byte Touch frame. A small window keeps the memory per connection to about 16 KB.
// - Heartbeats every 10 seconds notice a dead connection (a phone that lost signal) within about 20 seconds, so the
//   others see that player as away sooner; each heartbeat is a couple of bytes.
export const SOCKET_OPTIONS: Partial<ServerOptions> = {
  perMessageDeflate: {
    threshold: 64,
    serverMaxWindowBits: 11,
    clientMaxWindowBits: 11,
    zlibDeflateOptions: { memLevel: 4, level: 6 },
    concurrencyLimit: 10,
  },
  pingInterval: 10_000,
  pingTimeout: 10_000,
};

// Socket.IO with the allowed web addresses from the settings (the gateway decorator cannot read settings).
class GameIoAdapter extends IoAdapter {
  constructor(app: INestApplication, private readonly origins: string[] | true) { super(app); }
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, ...SOCKET_OPTIONS, cors: { origin: this.origins } });
  }
}

// Lets in only the web app's addresses, for plain HTTP requests and for the game's Socket.IO connections.
export function allowOrigins(app: INestApplication, config: Config) {
  app.enableCors({ origin: config.webOrigins });
  app.useWebSocketAdapter(new GameIoAdapter(app, config.webOrigins));
}
