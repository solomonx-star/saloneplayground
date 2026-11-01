import { networkInterfaces } from "node:os";
import { Controller, Get, Module, Req, type DynamicModule } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { CONFIG, type Config } from "./config";
import { databaseProviders, DatabaseShutdown } from "./database";
import { GameGateway } from "./game.gateway";
import { GuestsService } from "./guests.service";
import { PresenceService } from "./presence.service";
import { RoomsService } from "./rooms.service";

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const LOOPBACK = /^(::1|127\.|::ffff:127\.)/;

@Controller()
class HealthController {
  // A plain HTTP check that the server is up, for hosting health checks.
  @Get("health")
  health() { return { ok: true }; }

  // This computer's addresses on the local network, so a party screen opened at "localhost" can show phones an
  // address they can reach. Only answered to requests from this same computer.
  @Get("network")
  network(@Req() request: { socket: { remoteAddress?: string } }) {
    if (!LOOPBACK.test(request.socket.remoteAddress ?? "")) return { addresses: [] };
    const addresses = Object.values(networkInterfaces()).flat()
      .filter((a) => a && a.family === "IPv4" && !a.internal && PRIVATE.test(a.address))
      .map((a) => a!.address);
    return { addresses };
  }
}

// The game server, built from its settings (so tests can point it at their own database).
@Module({})
export class AppModule {
  static register(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AdminController],
      providers: [{ provide: CONFIG, useValue: config }, ...databaseProviders, DatabaseShutdown, GuestsService, RoomsService, PresenceService, AdminService, GameGateway],
    };
  }
}
