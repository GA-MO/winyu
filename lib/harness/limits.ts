/** The bounds every run stays inside: model steps, tool calls, retries per call, fix hints per tool, and the characters the context and the transcript may take. */
export const LIMITS = {
  maxSteps: 6,
  maxToolCalls: 12,
  maxRetries: 1,
  maxCorrections: 2,
  toolTimeoutMs: 20_000,
  maxContextChars: 12_000,
  maxTranscriptChars: 120_000,
  minTranscriptMessages: 4,
} as const;
