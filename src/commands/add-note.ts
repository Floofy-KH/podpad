import { createAuthenticatedSession } from "../pod/auth";
import { PodClient } from "../pod/client";
import type { AuthSession } from "../pod/session";
import { ConfigError, loadConfigFromEnv, type SolidConfig } from "../utils/config";
import { logError, logInfo, logSuccess } from "../utils/logger";
import { generateNoteFilename } from "../utils/note-name";

export interface AddNoteDeps {
  readStdin: () => Promise<string>;
  loadConfig: () => SolidConfig;
  createAuthenticatedSession: typeof createAuthenticatedSession;
  createPodClient: (session: AuthSession) => Pick<PodClient, "writeTextResource">;
  generateNoteFilename: typeof generateNoteFilename;
}

const defaultDeps: AddNoteDeps = {
  readStdin,
  loadConfig: loadConfigFromEnv,
  createAuthenticatedSession,
  createPodClient: (session) => new PodClient(session),
  generateNoteFilename
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printConfigHelp(): void {
  logInfo("Set these environment variables before running add-note:");
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
}

export function parseTitle(argv: string[]): string | undefined {
  const titleFlagIndex = argv.findIndex((arg) => arg === "--title" || arg === "-t");
  if (titleFlagIndex === -1) {
    return undefined;
  }

  const title = argv[titleFlagIndex + 1];
  if (!title || title.startsWith("-")) {
    throw new Error("Missing value for --title (-t).");
  }

  return title;
}

export function assertNonEmptyNoteContent(content: string): void {
  if (content.trim().length > 0) {
    return;
  }

  throw new Error(
    "Note content is empty. Pipe content into stdin (example: echo \"Hello\" | npm run dev -- add-note)."
  );
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", (error) => {
      reject(error);
    });
  });
}

export async function runAddNote(argv: string[], deps: AddNoteDeps = defaultDeps): Promise<void> {
  let session: AuthSession | undefined;

  try {
    const content = await deps.readStdin();
    assertNonEmptyNoteContent(content);

    const title = parseTitle(argv);
    const config = deps.loadConfig();

    logInfo("Starting Solid authentication...");
    session = await deps.createAuthenticatedSession(config.auth);
    logSuccess(`Authenticated as ${session.info.webId ?? "unknown WebID"}`);

    const podClient = deps.createPodClient(session);
    const fileName = deps.generateNoteFilename(title);
    const resourceUrl = `${config.pod.notesContainerUrl}${fileName}`;

    logInfo(`Writing note to ${resourceUrl}...`);
    await podClient.writeTextResource(resourceUrl, content);
    logSuccess(`Note created: ${resourceUrl}`);
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
        // Ignore logout errors for this command.
      }
    }
  }
}