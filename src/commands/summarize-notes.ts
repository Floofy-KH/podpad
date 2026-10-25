import { createAuthenticatedSession } from "../pod/auth";
import { PodClient } from "../pod/client";
import type { AuthSession } from "../pod/session";
import { ConfigError, loadConfigFromEnv, type SolidConfig } from "../utils/config";
import { logError, logInfo, logSuccess } from "../utils/logger";
import { generateNoteFilename } from "../utils/note-name";
import { createSummarizer, type NoteInput, type Summarizer } from "../agent/summarizer";
import { loadSummarizerConfigFromEnv, type SummarizerConfig } from "../agent/config";
import { isNoteFilename, parseNoteFromUrl, type NoteItem } from "./list-notes";

export interface SummarizeNotesDeps {
  loadConfig: () => SolidConfig;
  loadSummarizerConfig: () => SummarizerConfig;
  createAuthenticatedSession: typeof createAuthenticatedSession;
  createPodClient: (
    session: AuthSession
  ) => Pick<PodClient, "listResourceUrls" | "readTextResource" | "writeTextResource">;
  createSummarizer: (config: SummarizerConfig) => Summarizer;
  generateNoteFilename: typeof generateNoteFilename;
}

const defaultDeps: SummarizeNotesDeps = {
  loadConfig: loadConfigFromEnv,
  loadSummarizerConfig: loadSummarizerConfigFromEnv,
  createAuthenticatedSession,
  createPodClient: (session) => new PodClient(session),
  createSummarizer,
  generateNoteFilename
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printSummarizerConfigHelp(): void {
  logInfo("Set these environment variables before running summarize-notes:");
  logInfo("- SUMMARIZER_PROVIDER (mock by default, or openai)");
  logInfo("- OPENAI_API_KEY (required when SUMMARIZER_PROVIDER=openai)");
  logInfo("- OPENAI_MODEL (optional, default gpt-4o-mini)");
  logInfo("- OPENAI_BASE_URL (optional, default https://api.openai.com/v1)");
}

export function parseLimit(argv: string[]): number | undefined {
  const flagIndex = argv.findIndex((arg) => arg === "--limit" || arg === "-n");
  if (flagIndex === -1) {
    return undefined;
  }

  const rawValue = argv[flagIndex + 1];
  if (!rawValue) {
    throw new Error("Missing value for --limit (-n).");
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error("--limit must be a non-negative integer.");
  }

  return parsed;
}

function formatTimestamp(date: Date): string {
  return `${date.toISOString().split(".")[0]}Z`;
}

export function buildSummaryText(notes: NoteItem[], summary: string): string {
  const sourceLines = notes.map(
    (note) => `- ${formatTimestamp(note.createdAt)}  ${note.title}\n  ${note.resourceUrl}`
  );

  return [
    `Generated: ${formatTimestamp(new Date())}`,
    `Source notes (${notes.length}):`,
    ...sourceLines,
    "",
    "Summary:",
    summary
  ].join("\n");
}

export async function runSummarizeNotes(
  argv: string[],
  deps: SummarizeNotesDeps = defaultDeps
): Promise<void> {
  let session: AuthSession | undefined;

  try {
    const config = deps.loadConfig();
    const summarizerConfig = deps.loadSummarizerConfig();
    const summarizer = deps.createSummarizer(summarizerConfig);

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
      logInfo("No notes found. Nothing to summarize.");
      return;
    }

    const limit = parseLimit(argv);
    const selectedNotes = limit === undefined ? notes : notes.slice(0, limit);
    if (selectedNotes.length === 0) {
      logInfo("No notes to summarize.");
      return;
    }

    const inputs: NoteInput[] = [];
    for (const note of selectedNotes) {
      const content = await podClient.readTextResource(note.resourceUrl);
      inputs.push({ title: note.title, content, resourceUrl: note.resourceUrl });
    }

    const summary = await summarizer.summarize(inputs);

    const summaryText = buildSummaryText(selectedNotes, summary);
    const filename = deps.generateNoteFilename("summary");
    const resourceUrl = `${config.pod.summariesContainerUrl}${filename}`;

    logInfo(`Writing summary to ${resourceUrl}...`);
    await podClient.writeTextResource(resourceUrl, summaryText);
    logSuccess(`Summary created: ${resourceUrl}`);
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      logError(error.message);
      for (const detail of error.details) {
        logError(`- ${detail}`);
      }
      printSummarizerConfigHelp();
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
