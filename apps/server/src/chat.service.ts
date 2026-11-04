import { Injectable } from "@nestjs/common";
import { CHAT_BURST, CHAT_HISTORY, CHAT_WINDOW_MS, cleanChat, filterChat, type ChatMessage } from "@salone/games/online/chat";
import { RoomError, type GuestRef } from "./rooms.service";

// Room chat. Messages are tidied and filtered here, never trusted from the screen, and only the last CHAT_HISTORY
// per room are kept, in memory, until the room closes: chat is never written to MongoDB.
@Injectable()
export class ChatService {
  private readonly rooms = new Map<string, ChatMessage[]>();
  // When each person (by room and guest) last sent messages, for the rate limit.
  private readonly sent = new Map<string, number[]>();
  private nextId = 1;

  post(code: string, sender: GuestRef, text: unknown, now = Date.now()): ChatMessage {
    const clean = cleanChat(text);
    if (!clean) throw new RoomError("Type a message first.");
    const key = `${code}:${sender.guestId}`;
    const recent = (this.sent.get(key) ?? []).filter((at) => now - at < CHAT_WINDOW_MS);
    if (recent.length >= CHAT_BURST) throw new RoomError("Slow down — wait a few seconds before sending another message.");
    this.sent.set(key, [...recent, now]);
    const message: ChatMessage = { id: this.nextId++, guestId: sender.guestId, name: sender.name, text: filterChat(clean), at: now };
    const list = this.rooms.get(code) ?? [];
    list.push(message);
    this.rooms.set(code, list.slice(-CHAT_HISTORY));
    return message;
  }

  history(code: string): ChatMessage[] { return this.rooms.get(code) ?? []; }

  // The room has closed: its chat goes with it.
  clear(code: string) {
    this.rooms.delete(code);
    for (const key of this.sent.keys()) if (key.startsWith(`${code}:`)) this.sent.delete(key);
  }
}
