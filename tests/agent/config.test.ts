import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadSummarizerConfigFromEnv } from "../../src/agent/config";
import { ConfigError } from "../../src/utils/config";

// Summarizer-related env vars read by loadSummarizerConfigFromEnv.
const ENV_KEYS = [
  "SUMMARIZER_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL"
] as const;

describe("loadSummarizerConfigFromEnv", () => {
  const savedEnv: Record<string, string | undefined> = {};

  before(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  after(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("defaults to the mock provider when SUMMARIZER_PROVIDER is unset", () => {
    const config = loadSummarizerConfigFromEnv();

    assert.equal(config.provider, "mock");
  });

  it("returns an openai config with defaults when provider and key are set", () => {
    process.env.SUMMARIZER_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-api-key";

    const config = loadSummarizerConfigFromEnv();

    assert.equal(config.provider, "openai");
    assert.equal(config.apiKey, "test-api-key");
    assert.equal(config.model, "gpt-4o-mini");
    assert.equal(config.baseUrl, "https://api.openai.com/v1");
  });

  it("uses custom model and baseUrl when provided", () => {
    process.env.SUMMARIZER_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.OPENAI_MODEL = "openai/some-model";
    process.env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";

    const config = loadSummarizerConfigFromEnv();

    assert.equal(config.model, "openai/some-model");
    assert.equal(config.baseUrl, "https://openrouter.ai/api/v1");
  });

  it("throws ConfigError when the openai provider has no api key", () => {
    process.env.SUMMARIZER_PROVIDER = "openai";

    assert.throws(
      () => loadSummarizerConfigFromEnv(),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });

  it("throws ConfigError for an unrecognized provider", () => {
    process.env.SUMMARIZER_PROVIDER = "openai-ish";

    assert.throws(
      () => loadSummarizerConfigFromEnv(),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });
});
