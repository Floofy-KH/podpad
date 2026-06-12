import { Session } from "@inrupt/solid-client-authn-node";

import { SolidAuthConfig } from "../utils/config";
import type { AuthSession } from "./session";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("timed out") || message.includes("timeout");
}

export async function createAuthenticatedSession(
  authConfig: SolidAuthConfig
): Promise<AuthSession> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= authConfig.maxRetries; attempt += 1) {
    const session = new Session();

    try {
      await session.login({
        oidcIssuer: authConfig.oidcIssuer,
        clientId: authConfig.clientId,
        clientSecret: authConfig.clientSecret,
        refreshToken: authConfig.refreshToken,
        tokenType: authConfig.tokenType
      });

      if (!session.info.isLoggedIn) {
        throw new Error("Solid login did not establish an authenticated session.");
      }

      return session;
    } catch (error: unknown) {
      lastError = error;

      if (!isRetryableAuthError(error) || attempt >= authConfig.maxRetries) {
        throw error;
      }

      await sleep(authConfig.retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}