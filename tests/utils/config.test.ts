/**
 * Unit tests for pure config logic in src/utils/config.ts.
 *
 * These tests cover three exported functions:
 *   - parseTokenType: validates the SOLID_TOKEN_TYPE value
 *   - parseNonNegativeInt: validates integer env var values
 *   - loadPhase1AConfigFromEnv: reads and validates the full Phase 1A config from env
 *
 * No Solid Pod session or network access is required.
 * Test runner: Node.js built-in node:test (no extra dependencies).
 */

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ConfigError,
  loadPhase1AConfigFromEnv,
  parseNonNegativeInt,
  parseTokenType
} from "../../src/utils/config";

// ---------------------------------------------------------------------------
// parseTokenType
// ---------------------------------------------------------------------------

describe("parseTokenType", () => {
  it("returns DPoP when raw is undefined (default)", () => {
    assert.equal(parseTokenType(undefined), "DPoP");
  });

  it("returns DPoP when raw is 'DPoP'", () => {
    assert.equal(parseTokenType("DPoP"), "DPoP");
  });

  it("returns Bearer when raw is 'Bearer'", () => {
    assert.equal(parseTokenType("Bearer"), "Bearer");
  });

  it("throws ConfigError for an unrecognized value", () => {
    assert.throws(
      () => parseTokenType("INVALID"),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        assert.equal(err.details.length, 1);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// parseNonNegativeInt
// ---------------------------------------------------------------------------

describe("parseNonNegativeInt", () => {
  it("returns the default when raw is undefined", () => {
    assert.equal(parseNonNegativeInt("MY_VAR", undefined, 2), 2);
  });

  it("returns 0 as a valid boundary value", () => {
    assert.equal(parseNonNegativeInt("MY_VAR", "0", 99), 0);
  });

  it("returns a positive integer", () => {
    assert.equal(parseNonNegativeInt("MY_VAR", "5", 0), 5);
  });

  it("throws ConfigError for a negative integer", () => {
    assert.throws(
      () => parseNonNegativeInt("MY_VAR", "-1", 0),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });

  it("throws ConfigError for a non-numeric string", () => {
    assert.throws(
      () => parseNonNegativeInt("MY_VAR", "abc", 0),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// loadPhase1AConfigFromEnv
// ---------------------------------------------------------------------------

// All env var keys read by loadPhase1AConfigFromEnv.
const ALL_ENV_VARS = [
  "SOLID_OIDC_ISSUER",
  "SOLID_CLIENT_ID",
  "SOLID_CLIENT_SECRET",
  "SOLID_REFRESH_TOKEN",
  "SOLID_POD_BASE_URL",
  "SOLID_TOKEN_TYPE",
  "SOLID_AUTH_MAX_RETRIES",
  "SOLID_AUTH_RETRY_DELAY_MS",
  "SOLID_NOTES_CONTAINER_URL",
  "SOLID_SUMMARIES_CONTAINER_URL"
] as const;

// Minimal set of required env vars with valid placeholder values.
const REQUIRED_DEFAULTS: Record<string, string> = {
  SOLID_OIDC_ISSUER: "https://provider.example/",
  SOLID_CLIENT_ID: "test-client-id",
  SOLID_CLIENT_SECRET: "test-client-secret",
  SOLID_REFRESH_TOKEN: "test-refresh-token",
  SOLID_POD_BASE_URL: "https://pod.example/user/"
};

describe("loadPhase1AConfigFromEnv", () => {
  // Snapshot env state once before the suite so it can be restored afterward.
  const savedEnv: Record<string, string | undefined> = {};

  before(() => {
    for (const key of ALL_ENV_VARS) {
      savedEnv[key] = process.env[key];
    }
  });

  // Clear all relevant vars before each test so tests are fully isolated.
  beforeEach(() => {
    for (const key of ALL_ENV_VARS) {
      delete process.env[key];
    }
  });

  // Restore original env state after all tests in this suite complete.
  after(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  // Helper: set all required env vars, with optional per-key overrides.
  function setRequired(overrides: Record<string, string> = {}): void {
    const merged = { ...REQUIRED_DEFAULTS, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      process.env[key] = value;
    }
  }

  // --- missing required vars ---

  it("throws ConfigError listing all five missing required vars", () => {
    // No env vars set at all.
    assert.throws(
      () => loadPhase1AConfigFromEnv(),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        assert.equal(err.details.length, 5, "expected one detail per missing var");
        return true;
      }
    );
  });

  it("throws ConfigError with one detail when only one required var is missing", () => {
    setRequired();
    delete process.env["SOLID_CLIENT_ID"];

    assert.throws(
      () => loadPhase1AConfigFromEnv(),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        assert.equal(err.details.length, 1);
        assert.ok(err.details[0].includes("SOLID_CLIENT_ID"));
        return true;
      }
    );
  });

  // --- successful parse ---

  it("returns a valid config when all required vars are present", () => {
    setRequired();
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.auth.oidcIssuer, REQUIRED_DEFAULTS.SOLID_OIDC_ISSUER);
    assert.equal(config.auth.clientId, REQUIRED_DEFAULTS.SOLID_CLIENT_ID);
    assert.equal(config.auth.clientSecret, REQUIRED_DEFAULTS.SOLID_CLIENT_SECRET);
    assert.equal(config.auth.refreshToken, REQUIRED_DEFAULTS.SOLID_REFRESH_TOKEN);
  });

  // --- token type ---

  it("defaults tokenType to DPoP when SOLID_TOKEN_TYPE is unset", () => {
    setRequired();
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.auth.tokenType, "DPoP");
  });

  it("applies Bearer tokenType when SOLID_TOKEN_TYPE is 'Bearer'", () => {
    setRequired();
    process.env.SOLID_TOKEN_TYPE = "Bearer";
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.auth.tokenType, "Bearer");
  });

  it("throws ConfigError for an invalid SOLID_TOKEN_TYPE", () => {
    setRequired();
    process.env.SOLID_TOKEN_TYPE = "INVALID";
    assert.throws(
      () => loadPhase1AConfigFromEnv(),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });

  // --- integer defaults ---

  it("defaults maxRetries to 2 and retryDelayMs to 2000", () => {
    setRequired();
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.auth.maxRetries, 2);
    assert.equal(config.auth.retryDelayMs, 2000);
  });

  it("applies custom maxRetries and retryDelayMs", () => {
    setRequired();
    process.env.SOLID_AUTH_MAX_RETRIES = "5";
    process.env.SOLID_AUTH_RETRY_DELAY_MS = "500";
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.auth.maxRetries, 5);
    assert.equal(config.auth.retryDelayMs, 500);
  });

  it("throws ConfigError for an invalid SOLID_AUTH_MAX_RETRIES value", () => {
    setRequired();
    process.env.SOLID_AUTH_MAX_RETRIES = "not-a-number";
    assert.throws(
      () => loadPhase1AConfigFromEnv(),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });

  // --- container URL derivation and normalization ---

  it("normalizes podBaseUrl to end with /", () => {
    setRequired({ SOLID_POD_BASE_URL: "https://pod.example/user" }); // no trailing slash
    const config = loadPhase1AConfigFromEnv();
    assert.ok(config.pod.podBaseUrl.endsWith("/"));
  });

  it("derives default container URLs from podBaseUrl", () => {
    setRequired({ SOLID_POD_BASE_URL: "https://pod.example/user/" });
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.pod.notesContainerUrl, "https://pod.example/user/notes/");
    assert.equal(config.pod.summariesContainerUrl, "https://pod.example/user/summaries/");
  });

  it("uses custom container URLs and normalizes their trailing slash", () => {
    setRequired();
    process.env.SOLID_NOTES_CONTAINER_URL = "https://pod.example/my-notes"; // no trailing slash
    process.env.SOLID_SUMMARIES_CONTAINER_URL = "https://pod.example/my-summaries/"; // already has slash
    const config = loadPhase1AConfigFromEnv();
    assert.equal(config.pod.notesContainerUrl, "https://pod.example/my-notes/");
    assert.equal(config.pod.summariesContainerUrl, "https://pod.example/my-summaries/");
  });
});
