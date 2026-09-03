// The processor already retries a 429 with the delay OpenAI names (see
// parseRateLimitRetryDelayMs in regulatory-analysis.processor.ts), but that is purely reactive:
// TRIAGE_CONCURRENCY / CLASSIFICATION_CONCURRENCY concurrent lanes can still all dispatch a call
// in the same instant, and on an account sitting close to its tokens-per-minute ceiling that
// burst is what tips it over — the request that loses the race burns a retry attempt for work
// that never ran. This gates dispatch on a per-model token bucket instead, so lanes that would
// have collided wait their turn locally before ever reaching the provider.

type Bucket = {
  tokens: number;
  capacity: number;
  lastRefillAt: number;
};

const buckets = new Map<string, Bucket>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Refills continuously (tokens-per-ms) rather than resetting once a minute, so a burst right
// after a fixed-window reset can't still blow past the account's real per-minute average.
function refill(bucket: Bucket, capacity: number, now: number): void {
  if (bucket.capacity !== capacity) {
    // Capacity is read fresh on every call (see REGULATORY_TOKENS_PER_MINUTE below), so an
    // operator tuning it mid-run rescales the balance instead of mixing old and new units.
    bucket.tokens =
      capacity <= 0 ? 0 : Math.min(bucket.tokens * (capacity / bucket.capacity), capacity);
    bucket.capacity = capacity;
  }
  const elapsedMs = now - bucket.lastRefillAt;
  if (elapsedMs <= 0) return;
  bucket.tokens = Math.min(capacity, bucket.tokens + (elapsedMs * capacity) / 60_000);
  bucket.lastRefillAt = now;
}

/**
 * Waits until `estimatedTokens` are available in the named model's bucket, then spends them.
 * A single call that estimates above `tokensPerMinute` is clamped to the full capacity rather
 * than left waiting forever for a balance the bucket can never hold.
 */
export async function acquireModelTokens(
  model: string,
  estimatedTokens: number,
  tokensPerMinute: number,
): Promise<void> {
  const capacity = Math.max(1, Math.round(tokensPerMinute));
  const need = Math.max(0, Math.min(Math.round(estimatedTokens), capacity));
  for (;;) {
    const now = Date.now();
    let bucket = buckets.get(model);
    if (!bucket) {
      bucket = { tokens: capacity, capacity, lastRefillAt: now };
      buckets.set(model, bucket);
    }
    refill(bucket, capacity, now);
    if (bucket.tokens >= need) {
      bucket.tokens -= need;
      return;
    }
    const deficitTokens = need - bucket.tokens;
    const waitMs = Math.max(25, Math.ceil((deficitTokens * 60_000) / capacity));
    await sleep(waitMs);
  }
}

/** Test-only: drops every bucket so cases don't inherit balance spent by an earlier case. */
export function resetRegulatoryRateLimiter(): void {
  buckets.clear();
}
