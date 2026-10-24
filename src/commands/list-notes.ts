import { createAuthenticatedSession } from "../pod/auth";
import { PodClient } from "../pod/client";
import type { AuthSession } from "../pod/session";
import { ConfigError, loadConfigFromEnv, type SolidConfig } from "../utils/config";
import { logError, logInfo, logSuccess } from "../utils/logger";

export interface ListNotesDeps {
  loadConfig: () => SolidConfig;
  createAuthenticatedSession: typeof createAuthenticatedSession;
  createPodClient: (session: AuthSession) => Pick<PodClient, "listResourceUrls" | "readTextResource">;
}

const defaultDeps: ListNotesDeps = {
  loadConfig: loadConfigFromEnv,
  createAuthenticatedSession,
  createPodClient: (session) => new PodClient(session)
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printConfigHelp(): void {
  logInfo("Set these environment variables before running list-notes:");
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

export interface NoteItem {
  filename: string;
  title: string;
  createdAt: Date;
  resourceUrl: string;
}

export function parseNoteFromUrl(resourceUrl: string): NoteItem {
  const encodedFilename = new URL(resourceUrl).pathname.split("/").pop() ?? "";
  let filename = encodedFilename;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    // Keep encoded filename if decoding fails
  }

  const match = /^(\d{8}T\d{6}Z)_[a-f0-9]{6}(?:_(.*))?\.txt$/i.exec(filename);
  const timestamp = match?.[1];
  let createdAt = new Date(0);
  if (timestamp) {
    const date = new Date(
      `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`
    );
    if (!Number.isNaN(date.valueOf())) {
      createdAt = date;
    }
  }
  const slug = match?.[2];

  return {
    filename,
    title: slug ? slug.replace(/-/g, " ") : "Untitled note",
    createdAt,
    resourceUrl
  };
}

export function isNoteFilename(filename: string): boolean {
  return /^\d{8}T\d{6}Z_[a-f0-9]{6}(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?\.txt$/i.test(filename);
}

export async function runListNotes(deps: ListNotesDeps = defaultDeps): Promise<void> {
  let session: AuthSession | undefined;

  try {
    const config = deps.loadConfig();

    logInfo("Starting Solid authentication...");
    session = await deps.createAuthenticatedSession(config.auth);
    logSuccess(`Authenticated as ${session.info.webId ?? "unknown WebID"}`);

    const podClient = deps.createPodClient(session);

    logInfo("Listing notes...");
    const urls = await podClient.listResourceUrls(config.pod.notesContainerUrl);

    const notes = urls
      .map(parseNoteFromUrl)
      .filter((note) => isNoteFilename(note.filename))
      .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf());

    if (notes.length === 0) {
      logInfo("No notes found.");
      return;
    }

    logSuccess(`Found ${notes.length} note(s):`);
    console.log("");

    for (const note of notes) {
      const dateStr = note.createdAt.toISOString();
      console.log(`  ${dateStr}  ${note.title}`);
      console.log(`    ${note.resourceUrl}`);

      try {
        const content = await podClient.readTextResource(note.resourceUrl);
        const firstLine = content.split("\n")[0] ?? "";
        const preview = firstLine.slice(0, 80);
        if (preview) {
          console.log(`    > ${preview}${firstLine.length > 80 ? "..." : ""}`);
        }
      } catch {
        console.log("    > (unable to read preview)");
      }
      console.log("");
    }
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
