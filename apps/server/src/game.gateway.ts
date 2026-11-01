import { Inject } from "@nestjs/common";
import { ConnectedSocket, MessageBody, type OnGatewayDisconnect, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { cleanPresence } from "@salone/games/online/admin";
import { EVENTS, type Reply } from "@salone/games/online/protocol";
import { GuestsService } from "./guests.service";
import { PresenceService } from "./presence.service";
import { RoomError, RoomsService, type GuestRef } from "./rooms.service";

// What the server remembers about each connection: who the guest is and which room they have open.
type SocketData = { guest?: GuestRef; code?: string };
type Body = Record<string, unknown> | undefined;

// Runs a request and turns the outcome into a reply for the screen: the value, or a message it can show.
async function reply<T>(work: () => Promise<T>): Promise<Reply<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof RoomError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong on the game server. Try again." };
  }
}

// The Socket.IO entry point. A screen says hello first (to become a guest), then creates or joins a room and sends
// requests; each request gets a Reply, and everyone in the room gets the room's new state as an update. Which web
// addresses may connect is set in setup.ts from WEB_ORIGIN.
@WebSocketGateway()
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;

  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(
    @Inject(GuestsService) private readonly guests: GuestsService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(PresenceService) private readonly presence: PresenceService,
  ) {}

  afterInit() {
    this.rooms.onChange((view) => this.server.to(view.code).emit(EVENTS.update, view));
    // Frames are sent many times a second: a screen that falls behind skips to the next rather than queueing them.
    this.rooms.onFrame((code, frame) => this.server.to(code).volatile.emit(EVENTS.frame, frame));
  }

  @SubscribeMessage(EVENTS.hello)
  hello(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(async () => {
      const guest = await this.guests.hello(body ?? {});
      this.data(socket).guest = { guestId: guest.guestId, name: guest.name };
      return guest;
    });
  }

  @SubscribeMessage(EVENTS.create)
  create(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(async () => {
      const guest = this.guest(socket);
      await this.leaveRoom(socket);
      const view = await this.rooms.create(guest, body?.game, body?.options, body?.party, socket.id);
      await this.enter(socket, view.code);
      return view;
    });
  }

  @SubscribeMessage(EVENTS.join)
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(async () => {
      const guest = this.guest(socket);
      const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
      if (this.data(socket).code !== code) await this.leaveRoom(socket);
      const view = await this.rooms.join(guest, code, socket.id);
      await this.enter(socket, view.code);
      // A real-time match only sends frames while it moves, so a screen joining between runs needs the current one.
      const frame = this.rooms.frame(view.code);
      if (frame) socket.emit(EVENTS.frame, frame);
      return view;
    });
  }

  @SubscribeMessage(EVENTS.leave)
  leave(@ConnectedSocket() socket: Socket) {
    return reply(async () => {
      const { code } = this.data(socket);
      if (code) await this.rooms.leave(this.guest(socket), code);
      if (code) await socket.leave(code);
      this.data(socket).code = undefined;
      return true;
    });
  }

  @SubscribeMessage(EVENTS.options)
  options(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(() => this.rooms.setOptions(this.guest(socket), this.data(socket).code, body?.options));
  }

  @SubscribeMessage(EVENTS.addCpu)
  addCpu(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(() => this.rooms.addCpu(this.guest(socket), this.data(socket).code, body?.seat, body?.level));
  }

  @SubscribeMessage(EVENTS.removeCpu)
  removeCpu(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(() => this.rooms.removeCpu(this.guest(socket), this.data(socket).code, body?.seat));
  }

  @SubscribeMessage(EVENTS.seat)
  seat(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(() => this.rooms.takeSeat(this.guest(socket), this.data(socket).code, body?.seat));
  }

  @SubscribeMessage(EVENTS.start)
  start(@ConnectedSocket() socket: Socket) {
    return reply(() => this.rooms.start(this.guest(socket), this.data(socket).code));
  }

  @SubscribeMessage(EVENTS.act)
  act(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    return reply(() => this.rooms.act(this.guest(socket), this.data(socket).code, body?.action));
  }

  // A stick or button change in a real-time game. No reply: the next frame shows the result.
  @SubscribeMessage(EVENTS.input)
  input(@ConnectedSocket() socket: Socket, @MessageBody() body: Body) {
    const { guest, code } = this.data(socket);
    if (guest) this.rooms.input(guest.guestId, code, body?.input);
  }

  // What a screen is showing, for the admin dashboard. No reply; reports that do not make sense are ignored.
  @SubscribeMessage(EVENTS.presence)
  async reportPresence(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const report = cleanPresence(body);
    if (!report) return;
    try { await this.presence.report(socket.id, report); } catch (error) { console.error(error); }
  }

  async handleDisconnect(socket: Socket) {
    try { await this.presence.disconnected(socket.id); } catch (error) { console.error(error); }
    const { guest, code } = this.data(socket);
    if (guest && code) await this.rooms.disconnected(guest.guestId, code, socket.id);
  }

  // ---- Inside ----

  private data(socket: Socket): SocketData { return socket.data as SocketData; }

  private guest(socket: Socket): GuestRef {
    const { guest } = this.data(socket);
    if (!guest) throw new RoomError("Say hello first: the screen has not finished connecting.");
    return guest;
  }

  private async enter(socket: Socket, code: string) {
    await socket.join(code);
    this.data(socket).code = code;
  }

  // Moving to another room: the old room sees this connection go (the guest keeps their seat there).
  private async leaveRoom(socket: Socket) {
    const { guest, code } = this.data(socket);
    if (!guest || !code) return;
    await this.rooms.disconnected(guest.guestId, code, socket.id);
    await socket.leave(code);
    this.data(socket).code = undefined;
  }
}
