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

const SYSTEM_PROMPT =
  "You are a helpful assistant that creates short, plain-text summaries of personal notes. Respond with only the summary text.";

function buildUserPrompt(notes: NoteInput[]): string {
  const noteBlocks = notes.map((note, index) => {
    const content = note.content.trim() || "(empty note)";
    return `[Note ${index + 1}]\nTitle: ${note.title}\nContent:\n${content}`;
  });

  return [
    "Summarize the user's notes below. Return only the summary text.",
    ...noteBlocks
  ].join("\n\n");
}

/**
 * Summarizer backed by any OpenAI-compatible chat completions endpoint.
 * Talks to <baseUrl>/chat/completions using plain fetch (no SDK dependency).
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
    if (notes.length === 0) {
      return "No notes to summarize.";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(notes) }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Summarizer request failed (HTTP ${response.status}).`);
    }

    let responseBody: { choices?: { message?: { content?: string } }[] };
    try {
      responseBody = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    } catch {
      throw new Error("Summarizer response was not valid JSON.");
    }

    const summary = responseBody.choices?.[0]?.message?.content;
    if (!summary) {
      throw new Error("Summarizer response did not include a summary message.");
    }

    return summary;
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
