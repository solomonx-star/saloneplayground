import { describe, expect, it } from "vitest";
import { cleanChat, filterChat, MAX_CHAT } from "./chat";

describe("chat messages", () => {
  it("tidies typed text and refuses empty messages", () => {
    expect(cleanChat("  hello \n\t there  ")).toBe("hello there");
    expect(cleanChat("a\u0000b‮c")).toBe("a b c");
    expect(cleanChat("   ")).toBeNull();
    expect(cleanChat(42)).toBeNull();
    expect(Array.from(cleanChat("😂".repeat(200))!)).toHaveLength(MAX_CHAT);
  });

  it("hides rude words, including look-alike and stretched spellings, keeping the punctuation", () => {
    expect(filterChat("what the fuck!")).toBe("what the ****!");
    expect(filterChat("sh1t")).toBe("****");
    expect(filterChat("fuuuuck")).toBe("*******");
    expect(filterChat("so shitty")).toBe("so ******");
    expect(filterChat("You $lut")).toBe("You ****");
  });

  it("leaves ordinary words alone, even ones containing a rude word", () => {
    for (const text of ["Good move!", "class assessment", "Scunthorpe", "the whorl of a shell", "a cocktail", "Sussex", "Well played 3-2", "I scored 100 points"]) {
      expect(filterChat(text)).toBe(text);
    }
  });

  it("hides links, email addresses and phone numbers", () => {
    expect(filterChat("go to https://example.com/x now")).toBe("go to [link] now");
    expect(filterChat("see www.example.org")).toBe("see [link]");
    expect(filterChat("try games.sl")).toBe("try [link]");
    expect(filterChat("mail me a@b.com")).toBe("mail me [email]");
    expect(filterChat("+232 76 123456")).toBe("[number]");
  });
});
