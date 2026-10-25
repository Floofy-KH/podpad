## Plan: PodPad Phase 1C (Summarization Slice)

Goal: deliver the `summarize-notes` command and corresponding web screen features that read notes, generate a summary via a pluggable adapter, and persist it to `summaries/` with source linkage metadata.

Scope for Phase 1C:
- Summarizer adapter interface with a mock provider (default) and a fetch-based real provider stub
- `summarize-notes` CLI command: list notes -> summarize -> write summary
- Web screen parity: generate summaries from the browser, list them, and preview them
- Simple plain-text summary format with embedded source metadata
- Defensive error handling and concise logs

Out of scope for this phase:
- Tagging / action extraction
- Note editing or deletion
- Advanced per-note summarization (we summarize the current note set as a whole)
- Streaming or chunked summarization

---

### Design decisions

**Adapter shape**
```ts
interface NoteInput {
  title: string;
  content: string;
  resourceUrl: string;
}

interface Summarizer {
  summarize(notes: NoteInput[]): Promise<string>;
}
```

**Providers**
- `MockSummarizer` — deterministic, offline-friendly, returns a placeholder summary string. Used by default so onboarding and tests require no API keys.
- `OpenAiCompatibleSummarizer` — uses global `fetch` to call an OpenAI-compatible chat completions endpoint. No SDK dependency. Accepts `apiKey`, optional `baseUrl`, optional `model`.

This works with:
- **OpenAI** directly (`baseUrl` defaults to `https://api.openai.com/v1`).
- **OpenRouter.ai** (`baseUrl` = `https://openrouter.ai/api/v1`, `model` = any OpenRouter model slug).
- **Ollama** or other local servers (`baseUrl` = `http://localhost:11434/v1`).
- Any other proxy or service that exposes the standard `/chat/completions` endpoint.

**Configuration (env-based)**
- `SUMMARIZER_PROVIDER` — `mock` (default) or `openai`
- `OPENAI_API_KEY` — required when provider is `openai`
- `OPENAI_MODEL` — optional, default `gpt-4o-mini`
- `OPENAI_BASE_URL` — optional, default `https://api.openai.com/v1`

Config lives in `src/agent/config.ts` and is loaded separately from Solid auth config.

**Summary output format**
Plain text, human-readable, with a small header block:

```
Generated: 2023-10-01T12:00:00Z
Source notes (2):
- 2023-10-01T11:00:00Z  Learning Notes
  https://pod.example/notes/20231001T110000Z_abc123_learning-notes.txt
- 2023-10-01T10:00:00Z  Untitled note
  https://pod.example/notes/20231001T100000Z_def456.txt

Summary:
{generated summary text}
```

**Summary filename**
Reuse the existing naming utility: `generateNoteFilename("summary")` produces something like `20231001T120000Z_abc123_summary.txt`.

**Command behavior**
- Default: summarize all notes, newest first.
- Optional `--limit N` (or `-n N`): include only the N most recent notes.
- If no notes are found, print a clear message and exit without creating a summary file.
- If summarization fails, do not write to `summaries/`; print an actionable error.

**Web parity policy (from this phase onward)**
Every new CLI feature must include a corresponding web screen capability. The web screen should mirror the CLI behavior where it makes sense:
- The web server exposes API endpoints that wrap the same business logic.
- Demo mode stores data in memory so learners can explore without a Solid Pod.
- UI updates are small, accessible, and consistent with the existing note list/preview pattern.

**Web screen additions for summarization**
- New API endpoints:
  - `GET /api/summaries` — list summaries from `summaries/` container (or demo memory).
  - `POST /api/summaries` — trigger summary generation using the same orchestration as the CLI command.
  - `GET /api/summaries/:id` — read a single summary resource.
- UI additions:
  - A "Generate summary" button in the note workspace with an optional note-count limit selector.
  - A "Recent summaries" panel alongside or below notes (simple two-column layout or sequential sections).
  - Clicking a summary opens its content in a preview pane, similar to note previews.

---

### Stage 1: Summarizer adapter + mock provider

Status: Not started.

Implementation target:
- Add `src/agent/summarizer.ts` exporting:
  - `NoteInput` interface
  - `Summarizer` interface
  - `MockSummarizer` class
  - `OpenAiCompatibleSummarizer` class
  - `createSummarizer(config)` factory
- Add `src/agent/config.ts` exporting:
  - `SummarizerConfig` interface
  - `loadSummarizerConfigFromEnv()`
  - `SummarizerConfigError` class (or reuse `ConfigError` from utils)
- Add unit tests in `tests/agent/summarizer.test.ts`:
  - `MockSummarizer.summarize()` returns a non-empty string.
  - `MockSummarizer` includes note titles in its output so callers can verify it received inputs.
  - `OpenAiCompatibleSummarizer` throws if `apiKey` is empty.
  - `createSummarizer` returns a `MockSummarizer` when provider is `mock`.
  - `createSummarizer` returns an `OpenAiCompatibleSummarizer` when provider is `openai`.

Why this stage first:
- Pure logic, no auth/network coupling.
- Establishes the adapter contract before the command orchestrator or web server depends on it.
- Mock provider enables offline tests and first-run exploration.

Gate 1: testability and checks
- Entry criteria:
  - No CLI wiring required.
  - Interface and factory are typed and documented.
- Pass criteria:
  - `MockSummarizer` works without env vars or network.
  - `OpenAiCompatibleSummarizer` validates its config eagerly.
  - Factory covers mock and openai branches.
  - `npm run check` passes.
  - `npm test` passes.
- Rollback criteria:
  - Interface ambiguity discovered.
  - Config loading is entangled with Solid config in a way that makes testing harder.

Suggested verification for this gate:
1. `npm run check`
2. `npm test`

---

### Stage 2: Real provider stub

Status: Not started.

Implementation target:
- flesh out `OpenAiCompatibleSummarizer.summarize()` to build a chat-completions request payload and call `fetch`.
- Build a simple system prompt + user prompt from the `NoteInput` array.
- Parse the JSON response and return `choices[0].message.content`.
- Surface HTTP and JSON parsing errors with clear messages.

Dependencies:
- Stage 1 interface is stable.

Gate 2: testability and checks
- Entry criteria:
  - Stage 1 gate passed.
- Pass criteria:
  - `OpenAiCompatibleSummarizer` builds a reasonable prompt from note titles/contents.
  - Missing `apiKey` still throws before any network call.
  - `npm run check` passes.
  - `npm test` passes (tests should mock `globalThis.fetch` for the openai branch).
- Rollback criteria:
  - Real provider stub is too large to review in one pass.
  - Error messages leak sensitive data (e.g., raw response bodies containing keys).

Automated unit tests (add to `tests/agent/summarizer.test.ts`):
- Mock `globalThis.fetch` to return a valid OpenAI-style JSON response and assert the returned summary.
- Mock `globalThis.fetch` to return a non-OK response and assert the error message.
- Assert that the request body includes a system prompt and concatenated note contents.

Suggested verification for this gate:
1. `npm run check`
2. `npm test`

---

### Stage 3: summarize-notes command

Status: Not started.

Implementation target:
- Add `src/commands/summarize-notes.ts`.
- Follow the same auth/session/logout pattern as `add-note` and `list-notes`.
- Steps:
  1. Load Solid config + summarizer config.
  2. Authenticate.
  3. List note URLs from `notes/` container.
  4. Read each note's text content.
  5. Build `NoteInput[]` array.
  6. Apply `--limit` / `-n` if provided (newest first).
  7. Call `summarizer.summarize(inputs)`.
  8. Build the summary text with header metadata.
  9. Generate filename via `generateNoteFilename("summary")`.
  10. Write to `summaries/` container.
- Export a `SummarizeNotesDeps` interface for testability, just like `AddNoteDeps`/`ListNotesDeps`.
- Export `parseLimit(argv)` helper.

Dependencies:
- Phase 1B list-notes logic (reuse `listResourceUrls`, `readTextResource`, `parseNoteFromUrl`).
- Stage 1 + 2 summarizer adapter.

Gate 3: testability and checks
- Entry criteria:
  - Stage 2 gate passed.
  - Command can be invoked from a function entrypoint with argv.
- Pass criteria:
  - Empty notes container prints a clear no-notes message and exits without writing.
  - Non-empty container produces a summary file in `summaries/`.
  - `--limit` correctly caps the number of notes fed to the summarizer.
  - Missing env vars map through `ConfigError` with readable details.
  - `npm run check` passes.
  - `npm test` passes.
- Rollback criteria:
  - Command is too large to review in one pass.
  - Note-reading failures are not handled gracefully.

Automated unit tests (target: `tests/commands/summarize-notes.test.ts`):
- Scope: only logic that does not require a live Pod session.
- Test cases to cover:
  1. `parseLimit` extracts `--limit` value correctly.
  2. `parseLimit` extracts `-n` value correctly.
  3. `parseLimit` returns `undefined` when neither flag is present.
  4. Command with zero notes exits before creating a session or calling summarizer.
  5. Command with notes reads them, calls summarizer, and writes the expected summary text shape to the Pod.

Suggested verification for this gate:
1. `npm run check`
2. `npm test`
3. `npm run dev -- summarize-notes` (against an empty notes container)
4. Add a note, then `npm run dev -- summarize-notes`
5. `npm run dev -- summarize-notes --limit 1`

---

### Stage 4: CLI integration

Status: Not started.

Implementation target:
- Update `src/cli.ts`:
  - Add `SUMMARIZE_NOTES` command constant.
  - Extend `parseCommand`.
  - Add dynamic import dispatch branch.
  - Update `printHelp`.
- Export `parseCommand` updates so existing CLI tests can be extended.
- Add routing tests in `tests/cli.test.ts`.

Dependencies:
- Stage 3 command module exists.

Gate 4: testability and checks
- Entry criteria:
  - Stage 3 gate passed at module level.
- Pass criteria:
  - `help` output includes `summarize-notes`.
  - `summarize-notes` dispatches correctly and receives argv.
  - Existing commands still dispatch correctly.
  - `npm run check` passes.
  - `npm test` passes.
- Rollback criteria:
  - Existing commands regress.
  - Routing becomes ambiguous.

Automated unit tests (`tests/cli.test.ts`):
- `parseCommand` returns `summarize-notes` for `"summarize-notes"` argv.
- `parseCommand` still returns correct values for all existing commands.

Suggested verification for this gate:
1. `npm run check`
2. `npm test`
3. `npm run dev -- help`
4. `npm run dev -- summarize-notes`

---

### Stage 5: Web server API endpoints for summaries

Status: Not started.

Implementation target:
- Extend `src/web/server.ts` and `WebServerDeps` to support summarizer operations.
  - Add `loadSummarizerConfig` to deps.
  - Add `createSummarizer` factory to deps.
  - Add in-memory `demoSummaries` storage alongside `demoNotes`.
- Add API routes:
  - `GET /api/summaries` — list summary metadata from `summaries/` (or demo memory).
  - `POST /api/summaries` — accept `{ noteLimit?: number }`, run the same orchestration as the CLI command:
    - list notes, read contents, build `NoteInput[]`, apply limit, call summarizer, write summary, return the new summary list.
  - `GET /api/summaries/:id` — read a single summary resource.
- Reuse existing helper patterns: `withPodClient`, `isNoteFilename`, `noteFromUrl`.
- Add `summaryFromUrl` parser and `isSummaryFilename` guard.

Dependencies:
- Stage 3 command orchestration is stable.
- Summarizer adapter and config are stable.

Gate 5: testability and checks
- Entry criteria:
  - Stage 4 gate passed.
- Pass criteria:
  - Demo mode can generate, list, and read summaries.
  - Solid mode can generate, list, and read summaries from the Pod.
  - Web server still passes `npm run check` and `npm test`.
  - No regressions in existing note endpoints.
- Rollback criteria:
  - Web server becomes too large to review in one pass.
  - Summary routes leak unhandled exceptions.

Automated unit tests:
- Scope deferred to Stage 7 (web server UI integration tests are manual; unit tests for route handlers may be added if they are factored into testable helpers).

Suggested verification for this gate:
1. `npm run check`
2. `npm test`
3. `npm run web` in demo mode, then use curl or browser to exercise:
   - `POST /api/summaries`
   - `GET /api/summaries`
   - `GET /api/summaries/:id`
4. `npm run web` in solid mode, repeat with real Pod.

---

### Stage 6: Web UI for summaries

Status: Not started.

Implementation target:
- Update `src/web/public/index.html`:
  - Add a "Recent summaries" section adjacent to the notes list.
  - Add a "Generate summary" button with a small note-limit input (e.g., "Include last N notes").
- Update `src/web/public/app.js`:
  - Add `refreshSummaries()`, `selectSummary()`, `renderSummaries()`, and `generateSummary()` functions.
  - Reuse the same preview pattern for summary previewing (title, date, content).
  - Keep the same accessible patterns (`aria-busy`, `aria-pressed`, error messages).
- Update `src/web/public/app.css` if needed for the new layout; keep it minimal.

Dependencies:
- Stage 5 API endpoints are live and verified.

Gate 6: testability and checks
- Entry criteria:
  - Stage 5 gate passed.
- Pass criteria:
  - Generate summary button works in demo mode.
  - Generate summary button works in solid mode.
  - Summary list renders after generation.
  - Summary preview displays header metadata and generated text.
  - No layout regressions on narrow viewports.
- Rollback criteria:
  - UI becomes significantly more complex than the notes UI.

Suggested verification for this gate:
1. `npm run check`
2. `npm test`
3. `npm run web` in demo mode:
   - Add a few demo notes.
   - Click "Generate summary".
   - Confirm summary appears in the summaries list.
   - Click the summary and confirm preview shows metadata + text.
4. `npm run web` in solid mode, repeat with real Pod.

---

### Stage 7: README updates for Phase 1C

Status: Not started.

Implementation target:
- Add a `Phase 1C Commands` section (or extend earlier sections) documenting:
  - `summarize-notes` CLI usage
  - `summarize-notes --limit N` usage
  - Configuring the summarizer provider (`SUMMARIZER_PROVIDER`, `OPENAI_API_KEY`, etc.)
  - Explicitly mention OpenRouter.ai and Ollama compatibility via `OPENAI_BASE_URL`
- Add a `Web Screen` subsection for summarization:
  - How to generate summaries from the browser
  - How the summaries list and preview work
- Update the Status section to reflect Phase 1C completion.
- Keep examples copy-paste runnable.

Dependencies:
- Stage 6 complete so docs match real CLI and web behavior.

Gate 7: testability and checks
- Entry criteria:
  - CLI and web behavior are finalized for this phase.
- Pass criteria:
  - Every documented command is copy-paste runnable as written.
  - Mock provider behavior is described so a learner can run it without an API key.
  - OpenRouter and Ollama examples are accurate.
  - Web instructions describe the actual UI flow.
  - No mismatch between docs and help output.
- Rollback criteria:
  - Documentation drift detected during copy-paste checks.

Suggested verification for this gate:
1. Run each README CLI command exactly as written.
2. Run the web screen and verify the documented UI flow.
3. Compare README command list against help output.

---

## Iterative execution policy

Use this sequence and do not skip gates:
1. Implement one stage.
2. Run that stage gate checks.
3. Commit only after pass.
4. Move to next stage.

Recommended commit granularity:
1. stage-1-summarizer-adapter
2. stage-2-real-provider
3. stage-3-summarize-command
4. stage-4-cli-wire
5. stage-5-web-api
6. stage-6-web-ui
7. stage-7-readme

This keeps each change small, reviewable, and easy to revert independently.

---

## Test runner convention

- Framework: Node.js built-in `node:test` (no extra dependencies).
- Assertions: `node:assert/strict`.
- File pattern: `tests/**/*.test.ts` (run via tsx with `node --test`).
- Run: `npm test`.
- Tests must not require a live Pod session or live LLM call. Pod-dependent and network-dependent paths remain manual.

---

## Quick command checklist by stage

Stage 1:
- `npm run check`
- `npm test`

Stage 2:
- `npm run check`
- `npm test`

Stage 3:
- `npm run check`
- `npm test`
- `npm run dev -- summarize-notes` (empty-state)
- Add a note, then `npm run dev -- summarize-notes`
- `npm run dev -- summarize-notes --limit 1`

Stage 4:
- `npm run check`
- `npm test`
- `npm run dev -- help`
- `npm run dev -- summarize-notes`

Stage 5:
- `npm run check`
- `npm test`
- `npm run web` and exercise `/api/summaries` via curl or browser

Stage 6:
- `npm run check`
- `npm test`
- `npm run web` and exercise full summary UI in demo mode
- `npm run web` and exercise full summary UI in solid mode

Stage 7:
- Run README examples exactly as documented
