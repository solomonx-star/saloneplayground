import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { cleanName, type Guest } from "@salone/games/online/protocol";
import { MODELS, type Models } from "./database";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// Guests: players who pick a name and play without an account. Each gets an id and a secret token, which their
// device keeps and shows again when it reconnects. Only a hash of the token is stored.
@Injectable()
export class GuestsService {
  // Explicit @Inject because the server runs with tsx, which does not emit the type metadata Nest would otherwise use.
  constructor(@Inject(MODELS) private readonly models: Models) {}

  // Returns the guest a device already has (when its id and token match), or a new guest. The name is updated
  // either way.
  async hello(input: { guestId?: unknown; token?: unknown; name?: unknown }): Promise<Guest> {
    const name = cleanName(input.name);
    const now = new Date();
    if (typeof input.guestId === "string" && typeof input.token === "string") {
      const known = await this.models.players.findById(input.guestId).lean();
      if (known && this.matches(input.token, known.tokenHash)) {
        await this.models.players.updateOne({ _id: known._id }, { $set: { name, lastSeenAt: now } });
        return { guestId: known._id, token: input.token, name };
      }
    }
    const guestId = randomUUID();
    const token = randomBytes(24).toString("base64url");
    await this.models.players.create({ _id: guestId, name, tokenHash: hash(token), createdAt: now, lastSeenAt: now });
    return { guestId, token, name };
  }

  private matches(token: string, stored: string) {
    const given = Buffer.from(hash(token), "hex");
    const expected = Buffer.from(stored, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
