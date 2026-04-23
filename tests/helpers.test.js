const { describe, expect, it } = require("vitest");
const {
  clamp,
  createStatusSnapshot,
  formatTime,
  getErrorMessage,
  normalizeArtworkUrl,
} = require("../helpers.js");

describe("helpers", () => {
  it("clamps numeric values within the given range", () => {
    expect(clamp(10, 0, 5)).toBe(5);
    expect(clamp(-2, 0, 5)).toBe(0);
    expect(clamp(3, 0, 5)).toBe(3);
  });

  it("formats seconds as mm:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(61)).toBe("1:01");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("normalizes YouTube artwork URLs to a larger thumbnail", () => {
    expect(
      normalizeArtworkUrl("https://lh3.googleusercontent.com/abc=w60-h60-l90-rj"),
    ).toContain("w226-h226");
  });

  it("returns the configured fallback error message", () => {
    expect(getErrorMessage({ code: "player-not-ready" })).toContain("플레이어");
  });

  it("creates a status snapshot with defaults", () => {
    expect(createStatusSnapshot({ pipMode: "video" })).toEqual({
      canUseDocumentPip: false,
      canUseVideoPip: false,
      isReady: false,
      lastError: null,
      pipMode: "video",
    });
  });
});
