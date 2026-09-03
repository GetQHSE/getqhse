import { describe, expect, it } from "vitest";

import { decryptLlmSecret, encryptLlmSecret, LlmSecretError, maskLlmSecret } from "./llm-secret.js";

const secret = "a".repeat(32);

describe("llm secret storage", () => {
  it("round-trips a key", () => {
    expect(decryptLlmSecret(encryptLlmSecret("sk-abcdef", secret), secret)).toBe("sk-abcdef");
  });

  it("produces a different ciphertext each time", () => {
    expect(encryptLlmSecret("sk-abcdef", secret)).not.toBe(encryptLlmSecret("sk-abcdef", secret));
  });

  it("returns null rather than throwing when the encryption secret has changed", () => {
    expect(decryptLlmSecret(encryptLlmSecret("sk-abcdef", secret), "b".repeat(32))).toBeNull();
  });

  it("returns null for a value that is not a stored secret", () => {
    expect(decryptLlmSecret("sk-plain-text", secret)).toBeNull();
    expect(decryptLlmSecret("v1:only:two", secret)).toBeNull();
  });

  it("refuses to encrypt without an encryption secret", () => {
    expect(() => encryptLlmSecret("sk-abcdef", "")).toThrow(LlmSecretError);
  });

  it("masks everything but the last four characters", () => {
    expect(maskLlmSecret("sk-proj-1234567890abcd")).toBe("••••••••abcd");
    expect(maskLlmSecret("short")).toBe("•••••");
  });
});
