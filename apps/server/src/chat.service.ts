import { Inject, Injectable } from "@nestjs/common";
import {
  CHAT_BURST, CHAT_HISTORY, CHAT_WINDOW_MS, cleanChat, filterChat, isReportReason, REPORT_MESSAGES, reportsToBlock,
  type ChatMessage, type ChatReportView, type ChatState,
} from "@salone/games/online/chat";
import type { GameId } from "@salone/games/online/protocol";
import { MODELS, type Models } from "./database";
import { RoomError, type GuestRef } from "./rooms.service";

// A room's chat while it is open: recent messages, who has reported whom, and who is blocked from chatting.
type RoomChat = { messages: ChatMessage[]; reports: Map<string, Set<string>>; blocked: Set<string> };

// What the chat needs to know about a room to take a report: its game and the people seated in it.
export type ChatRoomInfo = { game: GameId; people: GuestRef[] };

export type ReportOutcome = { blockedNow: boolean; notice: ChatMessage | null };

// Room chat. Messages are tidied and filtered here, never trusted from the screen, and only the last CHAT_HISTORY
// per room are kept, in memory, until the room closes. Reports are the exception: each is saved to MongoDB with the
// reported player's recent messages, for the admin dashboard, and expires on its own (see database.ts).
@Injectable()
export class ChatService {
  private readonly rooms = new Map<string, RoomChat>();
  // When each person (by room and guest) last sent messages, for the rate limit.
  private readonly sent = new Map<string, number[]>();
  private nextId = 1;
  private readonly reportListeners: (() => void)[] = [];

  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(@Inject(MODELS) private readonly models: Models) {}

  // Called when a report comes in or is dismissed, so watching admin dashboards can read the reports again.
  onReports(listener: () => void) { this.reportListeners.push(listener); }

  post(code: string, sender: GuestRef, text: unknown, now = Date.now()): ChatMessage {
    const chat = this.room(code);
    if (chat.blocked.has(sender.guestId)) throw new RoomError("You can no longer chat in this room: other players reported your messages.");
    const clean = cleanChat(text);
    if (!clean) throw new RoomError("Type a message first.");
    const key = `${code}:${sender.guestId}`;
    const recent = (this.sent.get(key) ?? []).filter((at) => now - at < CHAT_WINDOW_MS);
    if (recent.length >= CHAT_BURST) throw new RoomError("Slow down — wait a few seconds before sending another message.");
    this.sent.set(key, [...recent, now]);
    return this.add(chat, { id: this.nextId++, guestId: sender.guestId, name: sender.name, text: filterChat(clean), at: now });
  }

  // A seated player reports another seated player. It is saved for the admins (once per reporter and player in a
  // room) and, when enough different people have reported the same player, blocks them from this room's chat.
  async report(code: string, reporter: GuestRef, reportedId: unknown, reason: unknown, room: ChatRoomInfo): Promise<ReportOutcome> {
    if (!isReportReason(reason)) throw new RoomError("Choose why you are reporting this player.");
    const reported = room.people.find((p) => p.guestId === reportedId);
    if (!reported) throw new RoomError("That player is not in this room.");
    if (reported.guestId === reporter.guestId) throw new RoomError("You cannot report yourself.");
    const chat = this.room(code);
    const reporters = chat.reports.get(reported.guestId) ?? new Set<string>();
    if (reporters.has(reporter.guestId)) throw new RoomError(`You have already reported ${reported.name}. The admins will look at it.`);
    reporters.add(reporter.guestId);
    chat.reports.set(reported.guestId, reporters);

    const blockedNow = !chat.blocked.has(reported.guestId) && reporters.size >= reportsToBlock(room.people.length);
    if (blockedNow) chat.blocked.add(reported.guestId);
    const messages = chat.messages.filter((m) => m.guestId === reported.guestId).slice(-REPORT_MESSAGES).map((m) => ({ text: m.text, at: new Date(m.at) }));
    await this.models.reports.create({
      room: code, game: room.game, reportedId: reported.guestId, reportedName: reported.name, reporterId: reporter.guestId, reporterName: reporter.name,
      reason, messages, blocked: chat.blocked.has(reported.guestId), status: "open", at: new Date(),
    });
    const notice = blockedNow
      ? this.add(chat, { id: this.nextId++, guestId: "", name: "", text: `${reported.name} can no longer chat in this room after being reported.`, at: Date.now(), system: true })
      : null;
    for (const listener of this.reportListeners) listener();
    return { blockedNow, notice };
  }

  state(code: string): ChatState {
    const chat = this.rooms.get(code);
    return { messages: chat?.messages ?? [], blocked: [...(chat?.blocked ?? [])] };
  }

  // The room has closed: its chat goes with it (saved reports stay for the admins).
  clear(code: string) {
    this.rooms.delete(code);
    for (const key of this.sent.keys()) if (key.startsWith(`${code}:`)) this.sent.delete(key);
  }

  // ---- For the admin dashboard ----

  async openReports(): Promise<ChatReportView[]> {
    const docs = await this.models.reports.find({ status: "open" }).sort({ at: -1 }).limit(100).lean();
    return docs.map((d) => ({
      id: String(d._id),
      room: d.room,
      game: d.game,
      reported: { guestId: d.reportedId, name: d.reportedName },
      reporter: { guestId: d.reporterId, name: d.reporterName },
      reason: d.reason,
      messages: d.messages.map((m) => ({ text: m.text, at: m.at.toISOString() })),
      at: d.at.toISOString(),
      blocked: d.blocked,
    }));
  }

  // Marks a report as dealt with. False when there is no such open report.
  async dismiss(id: string): Promise<boolean> {
    if (!/^[a-f0-9]{24}$/.test(id)) return false;
    const result = await this.models.reports.updateOne({ _id: id, status: "open" }, { status: "dismissed" });
    if (result.modifiedCount !== 1) return false;
    for (const listener of this.reportListeners) listener();
    return true;
  }

  // ---- Inside ----

  private room(code: string): RoomChat {
    let chat = this.rooms.get(code);
    if (!chat) { chat = { messages: [], reports: new Map(), blocked: new Set() }; this.rooms.set(code, chat); }
    return chat;
  }

  private add(chat: RoomChat, message: ChatMessage) {
    chat.messages.push(message);
    if (chat.messages.length > CHAT_HISTORY) chat.messages.splice(0, chat.messages.length - CHAT_HISTORY);
    return message;
  }
}
