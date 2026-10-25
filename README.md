# PodPad

A beginner-friendly project to explore the intersection of AI agents and Solid Pods.

## Project Goal

Build a simple notes assistant that stores data in a Solid Pod and performs lightweight agent tasks (summarization, tagging, and action extraction).

This project is intended to help learn:
- Solid fundamentals (identity, auth, Pod data access)
- Agentic workflow basics (ingest, analyze, write back)
- How Solid and agent patterns interact in practice

## Current Scope

Initial scope is intentionally small and desktop-developer friendly:
- CLI-first workflow
- Optional private Codespaces web screen for browser-based testing on any device
- No production deployment or infrastructure setup
- Minimal dependencies and moving parts

## Phase 0 Baseline

Phase 0 establishes a minimal TypeScript CLI scaffold for learning and for the next Solid Pod integration slices.

- Runtime baseline: Node.js 20.11+
- Entry point: src/cli.ts
- Build output: dist/

### Phase 0 Commands

- npm run dev -- phase0-check
- npm run check
- npm run build
- npm test

## Phase 1A: Solid Connectivity Foundation

Phase 1A adds a connectivity smoke check that validates:
- Solid authentication using a refresh-token flow
- Pod base access
- Idempotent bootstrap for notes/ and summaries/ containers

Run:
- npm run dev -- connectivity-check

Solid setup prerequisites (manual for now):
1. Create or use an existing Solid identity with an OIDC issuer.
2. Register an OAuth client for CLI usage and capture client ID/secret.
3. Obtain a refresh token for that client.
4. Confirm the target Pod base URL is reachable for that identity.
5. Confirm this identity can read and write under the target Pod location.

Required environment variables:
- SOLID_OIDC_ISSUER
- SOLID_CLIENT_ID
- SOLID_CLIENT_SECRET
- SOLID_REFRESH_TOKEN
- SOLID_POD_BASE_URL

Optional environment variables:
- SOLID_TOKEN_TYPE (DPoP or Bearer, default DPoP)
- SOLID_AUTH_MAX_RETRIES (non-negative integer, default 2)
- SOLID_AUTH_RETRY_DELAY_MS (non-negative integer, default 2000)
- SOLID_NOTES_CONTAINER_URL
- SOLID_SUMMARIES_CONTAINER_URL

## Phase 1B Commands

Once auth is configured, you can create and list notes in your Pod.

### Add a note

Pipe content into `add-note` from stdin. An optional `--title` (or `-t`) sets a friendly slug in the filename.

```bash
# Add a note without a title
echo "Hello, Solid world!" | npm run dev -- add-note

# Add a note with a title
echo "Learning about Pods today." | npm run dev -- add-note --title "Learning Notes"
```

What happens:
- The CLI authenticates to your Pod.
- A filename like `20231001T120000Z_abc123.txt` (or `20231001T120000Z_abc123_learning-notes.txt` with a title) is generated.
- The note is written as a text resource into the `notes/` container.

### List notes

```bash
npm run dev -- list-notes
```

What happens:
- The CLI authenticates to your Pod.
- It prints a count and a list of your notes, newest first.
- Each line shows the title, creation date, and resource URL.

## Phase 1C Commands

### Summarize notes

```bash
npm run dev -- summarize-notes
```

What happens:
- The CLI authenticates to your Pod.
- It lists the notes in the `notes/` container.
- It generates a summary through the configured summarizer.
- It writes the summary to the `summaries/` container.

If no notes are found, it prints a clear message and exits without writing.

### Summarize notes with a limit

```bash
# Only the most recent note is included
npm run dev -- summarize-notes --limit 1

# Same as above, short flag
npm run dev -- summarize-notes -n 2
```

### Configure the summarizer

Summarization uses a pluggable provider. The default is the offline `mock` provider, so you can try the flow without an API key.

To use a real model:

```bash
export SUMMARIZER_PROVIDER=openai
export OPENAI_API_KEY=your-openai-api-key
```

Optional settings:

```bash
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_BASE_URL` can be pointed at OpenRouter.ai (`https://openrouter.ai/api/v1`) or a local Ollama server (`http://localhost:11434/v1`).

## Web Screen

### Generate and preview summaries in the browser

- Start the web app in demo mode: `npm run web`.
- Add a note with the "New note" form (or use demo notes).
- Click **Generate summary**.
- The new summary shows up in the **Recent summaries** list.
- Click a summary to preview its generated content.

### Web Mode

The web screen supports two modes, controlled by the `PODPAD_WEB_MODE` environment variable:

- **Demo mode** (`PODPAD_WEB_MODE=demo`, default): Run `npm run web` without additional configuration. Notes and summaries are stored in memory and disappear when the app restarts. This is great for learning the UI without a Solid Pod.
- **Solid mode** (`PODPAD_WEB_MODE=solid`): Set `PODPAD_WEB_MODE=solid` and ensure your Solid environment variables (`SOLID_OIDC_ISSUER`, `SOLID_CLIENT_ID`, `SOLID_CLIENT_SECRET`, `SOLID_REFRESH_TOKEN`, `SOLID_POD_BASE_URL`) are loaded. Run `npm run web` to connect to your Pod. Notes and summaries are persisted to your Pod's `notes/` and `summaries/` containers.

You can set the mode in your `.env` file:

```
PODPAD_WEB_MODE=solid
```

When running in a Codespace, add `PODPAD_WEB_MODE` as a repository secret and set it to `solid` to enable Solid mode. Do not commit credentials to the repository.

## Non-Goals (for now)

- No production-ready web frontend
- No production infrastructure
- No multi-user support
- No advanced policy management yet (ACP/WAC deep dive later)

## Learning Focus

- Solid authentication flow for scripts/apps
- Read/write resources in Pod containers
- Basic data organization strategy:
  - notes/
  - summaries/
- Simple agent loop:
  - ingest -> analyze -> persist

## Early Milestones

### Milestone 1: Solid Basics
- Authenticate
- Create/read/write one resource in Pod
- Set up notes and summaries containers

### Milestone 2: Agent Behavior
- Generate summaries from notes
- Persist generated outputs to Pod
- Add basic error handling/logging

### Milestone 3: Polish
- End-to-end CLI workflow
- Config file for provider/settings
- Web screen integration

## Phase 1D: Config + Tests + Docs

This phase consolidates configuration loading, ensures test coverage across all commands, and updates documentation to match the working implementation.

### Verification Checklist

1. **Foundation checks**: authenticated session established, Pod root reachable, notes/ and summaries/ created idempotently
2. **Command checks**: add-note creates unique resources; list-notes works for empty and non-empty containers; summarize-notes writes summary resources with source linkage
3. **Summarization checks**: mock provider works offline; openai provider requires OPENAI_API_KEY; --limit correctly caps notes
4. **Failure checks**: invalid config, auth failure, missing container, provider failure, and Pod write failure return actionable errors
5. **Regression checks**: rerun bootstrap and summarize commands without duplicating/mutating unrelated data
6. **Documentation checks**: README includes exact scripts, config steps, and first-run walkthrough

## Repeatable Auth Setup (Phase 1A)

The fastest way to get credentials on `solidcommunity.net` (or any compatible issuer) is the one-shot setup script. It registers a client, opens your browser, catches the callback automatically, exchanges the code for a refresh token, discovers your Pod base URL, and writes everything to `.env`.

```bash
npm run auth:setup
```

Optional flags:

```bash
npm run auth:setup -- --issuer https://solidcommunity.net --port 8787 --env-file .env
```

After it finishes, verify connectivity:

```bash
npm run auth:check
```

### Manual fallback

If you prefer to run each step yourself (useful for learning the OAuth flow), the original Python scripts are still available:

1. `npm run auth:register` – register client
2. `npm run auth:code -- --client-id <id>` – request auth code (manual browser callback copy/paste)
3. `npm run auth:token -- ...` – exchange for refresh token
4. Fill `.env` by hand
5. `npm run auth:check`