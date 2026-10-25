import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ConfigError } from "../../src/utils/config";
import {
  createSummarizer,
  MockSummarizer,
  OpenAiCompatibleSummarizer,
  type NoteInput
} from "../../src/agent/summarizer";

function makeNote(overrides: Partial<NoteInput> = {}): NoteInput {
  return {
    title: "Learning Notes",
    content: "Today I learned about Solid Pods.",
    resourceUrl: "https://pod.example/notes/20231001T120000Z_abc123_learning-notes.txt",
    ...overrides
  };
}

describe("MockSummarizer", () => {
  it("returns a non-empty summary", async () => {
    const summarizer = new MockSummarizer();
    const summary = await summarizer.summarize([makeNote()]);

    assert.ok(summary.length > 0);
  });

  it("includes note titles in its output so callers can verify it received inputs", async () => {
    const summarizer = new MockSummarizer();
    const summary = await summarizer.summarize([
      makeNote({ title: "Learning Notes", content: "Today I learned about Solid Pods." }),
      makeNote({
        title: "Untitled note",
        content: "",
        resourceUrl: "https://pod.example/notes/20231001T100000Z_def456.txt"
      })
    ]);

    assert.ok(summary.includes("Learning Notes"));
    assert.ok(summary.includes("Untitled note"));
  });

  it("returns a placeholder message when there are no notes", async () => {
    const summarizer = new MockSummarizer();
    const summary = await summarizer.summarize([]);

    assert.ok(summary.length > 0);
  });
});

describe("OpenAiCompatibleSummarizer", () => {
  it("throws when the apiKey is empty", () => {
    assert.throws(
      () => new OpenAiCompatibleSummarizer(""),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError, "expected ConfigError");
        assert.equal(error.details.length, 1);
        return true;
      }
    );
  });
});

describe("createSummarizer", () => {
  it("returns a MockSummarizer when provider is mock", () => {
    const summarizer = createSummarizer({ provider: "mock" });
    assert.ok(summarizer instanceof MockSummarizer);
  });

  it("returns an OpenAiCompatibleSummarizer when provider is openai", () => {
    const summarizer = createSummarizer({ provider: "openai", apiKey: "test-api-key" });
    assert.ok(summarizer instanceof OpenAiCompatibleSummarizer);
  });

  it("throws when the openai provider has no apiKey", () => {
    assert.throws(
      () => createSummarizer({ provider: "openai", apiKey: undefined }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError, "expected ConfigError");
        return true;
      }
    );
  });
});
