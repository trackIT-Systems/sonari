import { describe, expect, it } from "vitest";

import { shortcutDigit } from "@/components/tags/TagSearchBar";

const key = (code: string, mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) => ({
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcutDigit", () => {
  it("picks a shortcut with a plain digit while the search is empty", () => {
    expect(shortcutDigit(key("Digit1"), "")).toBe("1");
    expect(shortcutDigit(key("Numpad0"), "")).toBe("0");
  });

  it("types digits normally once text was entered", () => {
    expect(shortcutDigit(key("Digit1"), "pass:")).toBeNull();
  });

  it("picks a shortcut with Alt+digit at any time", () => {
    expect(shortcutDigit(key("Digit7", { altKey: true }), "pass:")).toBe("7");
  });

  it("ignores letters and other modifiers", () => {
    expect(shortcutDigit(key("KeyA"), "")).toBeNull();
    expect(shortcutDigit(key("Digit1", { ctrlKey: true }), "")).toBeNull();
    expect(shortcutDigit(key("Digit1", { metaKey: true }), "")).toBeNull();
    expect(shortcutDigit(key("Digit1", { shiftKey: true }), "")).toBeNull();
  });
});
