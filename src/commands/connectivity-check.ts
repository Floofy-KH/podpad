import { createAuthenticatedSession } from "../pod/auth";
import { bootstrapPodContainers } from "../pod/bootstrap";
import { PodClient } from "../pod/client";
import type { AuthSession } from "../pod/session";
import { ConfigError, loadConfigFromEnv } from "../utils/config";
import { logError, logInfo, logSuccess } from "../utils/logger";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printConfigHelp(): void {
  logInfo("Set these environment variables before running connectivity-check:");
  logInfo("- SOLID_OIDC_ISSUER");
  logInfo("- SOLID_CLIENT_ID");
  logInfo("- SOLID_CLIENT_SECRET");
  logInfo("- SOLID_REFRESH_TOKEN");
  logInfo("- SOLID_POD_BASE_URL");
  logInfo("Optional:");
  logInfo("- SOLID_TOKEN_TYPE (DPoP or Bearer; default DPoP)");
  logInfo("- SOLID_AUTH_MAX_RETRIES (non-negative integer; default 2)");
  logInfo("- SOLID_AUTH_RETRY_DELAY_MS (non-negative integer; default 2000)");
  logInfo("- SOLID_NOTES_CONTAINER_URL");
  logInfo("- SOLID_SUMMARIES_CONTAINER_URL");
}

export async function runConnectivityCheck(): Promise<void> {
  let session: AuthSession | undefined;

  try {
    const config = loadConfigFromEnv();

    logInfo("Starting Solid authentication...");
    session = await createAuthenticatedSession(config.auth);
    logSuccess(`Authenticated as ${session.info.webId ?? "unknown WebID"}`);

    const podClient = new PodClient(session);

    logInfo("Bootstrapping notes/ and summaries/ containers...");
    await bootstrapPodContainers(podClient, config.pod);
    logSuccess("Container bootstrap complete.");

    const [notesUrls, summaryUrls] = await Promise.all([
      podClient.listResourceUrls(config.pod.notesContainerUrl),
      podClient.listResourceUrls(config.pod.summariesContainerUrl)
    ]);

    logSuccess(
      `Connectivity check passed (notes=${notesUrls.length}, summaries=${summaryUrls.length}).`
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      logError(error.message);
      for (const detail of error.details) {
        logError(`- ${detail}`);
      }
      printConfigHelp();
      throw error;
    }

    if (error instanceof Error) {
      logError(error.message);
      throw error;
    }

    const fallback = String(error);
    logError(fallback);
    throw new Error(fallback);
  } finally {
    if (session) {
      try {
        await Promise.race([session.logout(), sleep(2000)]);
      } catch {
        // Ignore logout errors for this smoke check.
      }
    }
  }
}