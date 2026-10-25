import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runSummarizeNotes, parseLimit, buildSummaryText, type SummarizeNotesDeps } from "../../src/commands/summarize-notes";
import type { AuthSession } from "../../src/pod/session";
import type { SolidConfig } from "../../src/utils/config";
import type { NoteInput, Summarizer } from "../../src/agent/summarizer";
import type { SummarizerConfig } from "../../src/agent/config";

const NOTE_URL =
  "https://pod.example/user/notes/20231001T120000Z_abc123_learning-notes.txt";
const SUMMARY_FILENAME = "20231001T120000Z_abc123_summary.txt";

function makeSession(): AuthSession {
  return {
    fetch: globalThis.fetch,
    logout: async () => {
      return;
    },
    info: {
      webId: "https://example.test/profile/card#me"
    }
  };
}

function makeSolidConfig(): SolidConfig {
  return {
    auth: {
      oidcIssuer: "https://issuer.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      tokenType: "DPoP",
      maxRetries: 0,
      retryDelayMs: 0
    },
    pod: {
      podBaseUrl: "https://pod.example/user/",
      notesContainerUrl: "https://pod.example/user/notes/",
      summariesContainerUrl: "https://pod.example/user/summaries/"
    }
  };
}

interface FakeWrite {
  url: string;
  content: string;
}

function makeFakePodClient(overrides: { urls?: string[]; content?: string } = {}) {
  const writes: FakeWrite[] = [];
  const client = {
    listResourceUrls: async () => overrides.urls ?? [],
    readTextResource: async (url: string) => overrides.content ?? `Content for ${url}`,
    writeTextResource: async (url: string, content: string) => {
      writes.push({ url, content });
    }
  };
  return { client, writes };
}

function makeDeps(
  overrides: { urls?: string[]; content?: string; summarizerResult?: string } = {}
) {
  const { client, writes } = makeFakePodClient({ urls: overrides.urls, content: overrides.content });
  const summarizeCalls: NoteInput[][] = [];
  const summarizer: Summarizer = {
    summarize: async (notes) => {
      summarizeCalls.push(notes);
      return overrides.summarizerResult ?? "Mocked LLM summary.";
    }
  };

  const deps: SummarizeNotesDeps = {
    loadConfig: () => makeSolidConfig(),
    loadSummarizerConfig: () => ({ provider: "mock" } as SummarizerConfig),
    createAuthenticatedSession: async () => makeSession(),
    createPodClient: () => client,
    createSummarizer: () => summarizer,
    generateNoteFilename: () => SUMMARY_FILENAME
  };

  return { deps, writes, summarizeCalls };
}

describe("parseLimit", () => {
  it("extracts --limit value correctly", () => {
    assert.equal(parseLimit(["summarize-notes", "--limit", "2"]), 2);
  });

  it("extracts -n value correctly", () => {
    assert.equal(parseLimit(["summarize-notes", "-n", "1"]), 1);
  });

  it("returns undefined when neither flag is present", () => {
    assert.equal(parseLimit(["summarize-notes"]), undefined);
  });
});

describe("buildSummaryText", () => {
  it("includes generated timestamp, source notes, and summary text", () => {
    const note = {
      filename: "20231001T120000Z_abc123_learning-notes.txt",
      title: "learning notes",
      createdAt: new Date("2023-10-01T12:00:00Z"),
      resourceUrl: NOTE_URL
    };
    const text = buildSummaryText([note], "Mocked LLM summary.");

    assert.ok(text.includes("Source notes (1):"));
    assert.ok(text.includes("- 2023-10-01T12:00:00Z  learning notes"));
    assert.ok(text.includes(NOTE_URL));
    assert.ok(text.includes("Summary:"));
    assert.ok(text.includes("Mocked LLM summary."));
  });
});

describe("runSummarizeNotes", () => {
  it("exits before summarizing or writing when there are no notes", async () => {
    const { deps, writes, summarizeCalls } = makeDeps({ urls: [] });

    await runSummarizeNotes(["summarize-notes"], deps);

    assert.equal(writes.length, 0);
    assert.equal(summarizeCalls.length, 0);
  });

  it("reads notes, calls the summarizer, and writes the summary text", async () => {
    const { deps, writes, summarizeCalls } = makeDeps({
      urls: [NOTE_URL],
      content: "Today I learned about Solid Pods."
    });

    await runSummarizeNotes(["summarize-notes", "--limit", "1"], deps);

    assert.equal(summarizeCalls.length, 1);
    assert.equal(summarizeCalls[0][0].title, "learning notes");
    assert.equal(summarizeCalls[0][0].content, "Today I learned about Solid Pods.");
    assert.equal(summarizeCalls[0][0].resourceUrl, NOTE_URL);

    assert.equal(writes.length, 1);
    assert.ok(writes[0].url.endsWith(SUMMARY_FILENAME));
    assert.ok(writes[0].content.includes("Source notes (1)"));
    assert.ok(writes[0].content.includes("Mocked LLM summary."));
  });
});
