export type SolidTokenType = "DPoP" | "Bearer";

export interface SolidAuthConfig {
  oidcIssuer: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenType: SolidTokenType;
  maxRetries: number;
  retryDelayMs: number;
}

export interface PodConfig {
  podBaseUrl: string;
  notesContainerUrl: string;
  summariesContainerUrl: string;
}

export interface Phase1AConfig {
  auth: SolidAuthConfig;
  pod: PodConfig;
}

export class ConfigError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = "ConfigError";
    this.details = details;
  }
}

function requiredEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeContainerUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function parseTokenType(raw: string | undefined): SolidTokenType {
  if (!raw) {
    return "DPoP";
  }

  if (raw === "DPoP" || raw === "Bearer") {
    return raw;
  }

  throw new ConfigError("Invalid SOLID_TOKEN_TYPE.", [
    "SOLID_TOKEN_TYPE must be either DPoP or Bearer."
  ]);
}
export function parseNonNegativeInt(
    name: string,
    raw: string | undefined,
    defaultValue: number
  ): number {
    if (!raw) {
      return defaultValue;
    }

    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0) {
      throw new ConfigError(`Invalid ${name}.`, [`${name} must be a non-negative integer.`]);
    }

    return value;
  }

export function loadPhase1AConfigFromEnv(): Phase1AConfig {
  const errors: string[] = [];

  const oidcIssuer = requiredEnv("SOLID_OIDC_ISSUER");
  const clientId = requiredEnv("SOLID_CLIENT_ID");
  const clientSecret = requiredEnv("SOLID_CLIENT_SECRET");
  const refreshToken = requiredEnv("SOLID_REFRESH_TOKEN");
  const podBaseUrlRaw = requiredEnv("SOLID_POD_BASE_URL");

  if (!oidcIssuer) {
    errors.push("SOLID_OIDC_ISSUER is required.");
  }
  if (!clientId) {
    errors.push("SOLID_CLIENT_ID is required.");
  }
  if (!clientSecret) {
    errors.push("SOLID_CLIENT_SECRET is required.");
  }
  if (!refreshToken) {
    errors.push("SOLID_REFRESH_TOKEN is required.");
  }
  if (!podBaseUrlRaw) {
    errors.push("SOLID_POD_BASE_URL is required.");
  }

  if (errors.length > 0) {
    throw new ConfigError("Missing required Solid configuration.", errors);
  }

  const tokenType = parseTokenType(process.env.SOLID_TOKEN_TYPE?.trim());
    const maxRetries = parseNonNegativeInt(
      "SOLID_AUTH_MAX_RETRIES",
      process.env.SOLID_AUTH_MAX_RETRIES?.trim(),
      2
    );
    const retryDelayMs = parseNonNegativeInt(
      "SOLID_AUTH_RETRY_DELAY_MS",
      process.env.SOLID_AUTH_RETRY_DELAY_MS?.trim(),
      2000
    );
  const podBaseUrl = normalizeContainerUrl(podBaseUrlRaw as string);
  const notesContainerUrl = normalizeContainerUrl(
    process.env.SOLID_NOTES_CONTAINER_URL?.trim() || `${podBaseUrl}notes/`
  );
  const summariesContainerUrl = normalizeContainerUrl(
    process.env.SOLID_SUMMARIES_CONTAINER_URL?.trim() || `${podBaseUrl}summaries/`
  );

  return {
    auth: {
      oidcIssuer: oidcIssuer as string,
      clientId: clientId as string,
      clientSecret: clientSecret as string,
      refreshToken: refreshToken as string,
      tokenType,
      maxRetries,
      retryDelayMs
    },
    pod: {
      podBaseUrl,
      notesContainerUrl,
      summariesContainerUrl
    }
  };
}