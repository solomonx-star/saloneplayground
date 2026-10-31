import { Controller, Get, Module, type DynamicModule } from "@nestjs/common";
import { CONFIG, type Config } from "./config";
import { databaseProviders, DatabaseShutdown } from "./database";
import { GameGateway } from "./game.gateway";
import { GuestsService } from "./guests.service";
import { RoomsService } from "./rooms.service";

// A plain HTTP check that the server is up, for hosting health checks.
@Controller()
class HealthController {
  @Get("health")
  health() { return { ok: true }; }
}

// The game server, built from its settings (so tests can point it at their own database).
@Module({})
export class AppModule {
  static register(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: CONFIG, useValue: config }, ...databaseProviders, DatabaseShutdown, GuestsService, RoomsService, GameGateway],
    };
  }
}
