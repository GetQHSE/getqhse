import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// The provider API key is the one setting an administrator can type that is worth stealing, so it
// is encrypted at rest rather than stored as a plain column. The key is derived from
// BETTER_AUTH_SECRET, which every service already requires and already treats as a secret — one
// less thing to rotate, and no new required variable for existing deployments.
const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

export class LlmSecretError extends Error {}

function encryptionKey(secret = process.env["BETTER_AUTH_SECRET"]): Buffer {
  if (!secret) throw new LlmSecretError("BETTER_AUTH_SECRET is required to store an API key");
  return createHash("sha256").update(`qhse:llm-settings:${secret}`).digest();
}

export function encryptLlmSecret(plaintext: string, secret?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Returns null instead of throwing when the stored value cannot be read — a rotated
 * BETTER_AUTH_SECRET leaves an undecryptable key behind, and the right answer there is to fall
 * back to the environment and let the administrator re-enter it, not to crash every worker. */
export function decryptLlmSecret(stored: string, secret?: string): string | null {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(secret), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** What the administration workspace is allowed to see: enough to recognise which key is in use,
 * not enough to use it. */
export function maskLlmSecret(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return plaintext.length <= 8 ? `${"•".repeat(plaintext.length)}` : `${"•".repeat(8)}${tail}`;
}
