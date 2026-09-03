import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acquireModelTokens, resetRegulatoryRateLimiter } from "./regulatory-rate-limiter.js";

describe("acquireModelTokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRegulatoryRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spends immediately when the bucket has enough balance", async () => {
    await expect(acquireModelTokens("gpt-5-mini", 10_000, 100_000)).resolves.toBeUndefined();
  });

  it("waits for tokens to refill once a call would overdraw the bucket", async () => {
    let resolved = false;
    await acquireModelTokens("gpt-5-mini", 90_000, 100_000);
    const pending = acquireModelTokens("gpt-5-mini", 30_000, 100_000).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(resolved).toBe(false);
    // 20k tokens short of a 100k/min bucket refills in 12s.
    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(resolved).toBe(true);
  });

  it("tracks separate models independently", async () => {
    await acquireModelTokens("gpt-5-mini", 100_000, 100_000);
    let resolved = false;
    void acquireModelTokens("gpt-5-nano", 1_000, 100_000).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it("clamps a single oversized request to full capacity instead of waiting forever", async () => {
    let resolved = false;
    void acquireModelTokens("gpt-5-mini", 250_000, 100_000).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });
});
