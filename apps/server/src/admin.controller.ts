import { Controller, Get, Headers, HttpCode, Inject, NotFoundException, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import type { ChatReportView } from "@salone/games/online/chat";
import type { LiveView, StatsView } from "@salone/games/online/admin";
import { AdminService } from "./admin.service";
import { ChatService } from "./chat.service";

export const ADMIN_OFF = "The admin dashboard is off: set ADMIN_TOKEN on the game server.";
export const ADMIN_WRONG = "That admin token is not right.";

// The admin dashboard over HTTP. Every request must carry the ADMIN_TOKEN secret as "Authorization: Bearer <token>".
// The dashboard reads statistics here; the live view is also pushed over Socket.IO as it changes.
@Controller("admin")
export class AdminController {
  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(@Inject(AdminService) private readonly admin: AdminService, @Inject(ChatService) private readonly chat: ChatService) {}

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

  // Chat reports waiting for an admin, newest first.
  @Get("reports")
  reports(@Headers("authorization") auth?: string): Promise<ChatReportView[]> {
    this.check(auth);
    return this.chat.openReports();
  }

  // An admin has dealt with a report: it leaves the list (it is still deleted on its own after REPORT_DAYS).
  @Post("reports/:id/dismiss")
  @HttpCode(200)
  async dismiss(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    this.check(auth);
    if (!(await this.chat.dismiss(id))) throw new NotFoundException("That report is not open.");
    return { ok: true };
  }

  private check(auth: string | undefined) {
    const problem = this.admin.tokenProblem(/^Bearer (.+)$/.exec(auth ?? "")?.[1] ?? "");
    if (problem === "off") throw new NotFoundException(ADMIN_OFF);
    if (problem === "wrong") throw new UnauthorizedException(ADMIN_WRONG);
  }
}
