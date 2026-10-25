import { ConfigError } from "../utils/config";

export type SummarizerProvider = "mock" | "openai";

export interface SummarizerConfig {
  provider: SummarizerProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * Loads the summarizer provider settings from environment variables.
 *
 * - SUMMARIZER_PROVIDER: "mock" (default) or "openai".
 * - OPENAI_API_KEY: required when the provider is "openai".
 * - OPENAI_MODEL: optional, defaults to DEFAULT_OPENAI_MODEL.
 * - OPENAI_BASE_URL: optional, defaults to DEFAULT_OPENAI_BASE_URL.
 *
 * This is intentionally separate from the Solid auth config so it can be
 * tested (and mocked) without any Pod or network coupling.
 */
export function loadSummarizerConfigFromEnv(): SummarizerConfig {
  const normalizedProvider = process.env.SUMMARIZER_PROVIDER?.trim().toLowerCase();

  let provider: SummarizerProvider;
  if (normalizedProvider === "mock") {
    provider = "mock";
  } else if (normalizedProvider === "openai") {
    provider = "openai";
  } else if (normalizedProvider) {
    throw new ConfigError("Invalid SUMMARIZER_PROVIDER.", [
      `SUMMARIZER_PROVIDER must be either "mock" or "openai" (received "${normalizedProvider}").`
    ]);
  } else {
    provider = "mock";
  }

  if (provider === "mock") {
    return { provider: "mock" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError("Missing OPENAI_API_KEY for the openai summarizer provider.", [
      "Set SUMMARIZER_PROVIDER=openai and provide an OPENAI_API_KEY, or keep the default mock provider."
    ]);
  }

  return {
    provider: "openai",
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL
  };
}
