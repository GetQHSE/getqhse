const CONSERVATIVE_PROMPT_OVERHEAD_TOKENS = 16_384;

export function positiveNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function regulatoryCostMicroUsd(inputTokens: number, outputTokens: number): number {
  const inputRate = positiveNumber("OPENAI_REGULATORY_INPUT_USD_PER_MTOK", 0.25);
  const outputRate = positiveNumber("OPENAI_REGULATORY_OUTPUT_USD_PER_MTOK", 2);
  return Math.ceil(inputTokens * inputRate + outputTokens * outputRate);
}

export function conservativeInputTokens(prompt: { system: string; context: string }): number {
  return (
    Buffer.byteLength(prompt.system, "utf8") +
    Buffer.byteLength(prompt.context, "utf8") +
    CONSERVATIVE_PROMPT_OVERHEAD_TOKENS
  );
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout|timed out|abort/iu.test(`${error.name} ${error.message}`);
}
