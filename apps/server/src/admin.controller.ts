import { Controller, Get, Headers, Inject, NotFoundException, Query, UnauthorizedException } from "@nestjs/common";
import type { LiveView, StatsView } from "@salone/games/online/admin";
import { AdminService } from "./admin.service";

export const ADMIN_OFF = "The admin dashboard is off: set ADMIN_TOKEN on the game server.";
export const ADMIN_WRONG = "That admin token is not right.";

// The admin dashboard over HTTP. Every request must carry the ADMIN_TOKEN secret as "Authorization: Bearer <token>".
// The dashboard reads statistics here; the live view is also pushed over Socket.IO as it changes.
@Controller("admin")
export class AdminController {
  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("live")
  live(@Headers("authorization") auth?: string): Promise<LiveView> {
    this.check(auth);
    return this.admin.live();
  }

  @Get("stats")
  stats(@Headers("authorization") auth?: string, @Query("days") days?: string): Promise<StatsView> {
    this.check(auth);
    return this.admin.stats(days);
  }

  private check(auth: string | undefined) {
    const problem = this.admin.tokenProblem(/^Bearer (.+)$/.exec(auth ?? "")?.[1] ?? "");
    if (problem === "off") throw new NotFoundException(ADMIN_OFF);
    if (problem === "wrong") throw new UnauthorizedException(ADMIN_WRONG);
  }
}
