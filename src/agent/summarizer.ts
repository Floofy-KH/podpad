import { ConfigError } from "../utils/config";
import { DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL, type SummarizerConfig } from "./config";

export interface NoteInput {
  title: string;
  content: string;
  resourceUrl: string;
}

export interface Summarizer {
  summarize(notes: NoteInput[]): Promise<string>;
}

/**
 * Offline-friendly summarizer used by default. Returns a deterministic,
 * human-readable placeholder that echoes the notes it received.
 */
export class MockSummarizer implements Summarizer {
  async summarize(notes: NoteInput[]): Promise<string> {
    if (notes.length === 0) {
      return "No notes to summarize.";
    }

    const noteLines = notes.map((note) => {
      const snippet = note.content.trim().split("\n")[0] ?? "";
      const snippetSuffix = snippet ? `: ${snippet}` : "";
      return `- ${note.title}${snippetSuffix}`;
    });

    return [
      `Mock summary generated from ${notes.length} note(s).`,
      ...noteLines
    ].join("\n");
  }
}

/**
 * Summarizer backed by any OpenAI-compatible chat completions endpoint.
 * The network call itself lands in Stage 2 of the Phase 1C plan; for now the
 * constructor validates its configuration eagerly and `summarize` fails fast
 * with a clear message instead of silently doing nothing.
 */
export class OpenAiCompatibleSummarizer implements Summarizer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    apiKey: string,
    baseUrl: string = DEFAULT_OPENAI_BASE_URL,
    model: string = DEFAULT_OPENAI_MODEL
  ) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ConfigError("OpenAiCompatibleSummarizer is missing an API key.", [
        "Set OPENAI_API_KEY when SUMMARIZER_PROVIDER is openai."
      ]);
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async summarize(notes: NoteInput[]): Promise<string> {
    throw new Error(
      "OpenAiCompatibleSummarizer is not implemented yet; the chat completions call lands in Stage 2 of the Phase 1C plan."
    );
  }
}

export function createSummarizer(config: SummarizerConfig): Summarizer {
  if (config.provider === "openai") {
    return new OpenAiCompatibleSummarizer(
      config.apiKey ?? "",
      config.baseUrl,
      config.model
    );
  }

  return new MockSummarizer();
}
