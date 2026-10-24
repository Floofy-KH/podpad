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

## Browser Testing (GitHub Codespaces)

The optional responsive web screen lets you try adding and listing notes from a browser on any device. It runs inside a Codespace; the forwarded port is configured as **private** and is not a permanent hosted app.

1. Create a Codespace for this repository.
2. Wait for setup and the PodPad page to open. If it does not, open the forwarded **PodPad web demo** port from the Ports panel.
3. Start in demo mode: add and list sample notes without Solid credentials. Demo notes are kept in server memory and disappear when the app restarts.
4. Stop the Codespace when finished.

If port 4173 is not forwarded, check the startup output in the Codespace terminal with `cat /tmp/podpad-web.log`. You can start the app manually with `npm run web`; Codespaces will forward the port when it detects the server.

The web screen defaults to demo mode. To connect a dedicated test Pod, add the `SOLID_OIDC_ISSUER`, `SOLID_CLIENT_ID`, `SOLID_CLIENT_SECRET`, `SOLID_REFRESH_TOKEN`, `SOLID_POD_BASE_URL`, and `PODPAD_WEB_MODE` values as Codespaces secrets (`PODPAD_WEB_MODE` should be `solid`), make them available to this repository's Codespaces, then stop and restart the Codespace. Do not put credentials in browser code or commit them to the repository. Use a test identity and Pod location rather than your main Pod.

To run the web screen locally, use `npm run web` and open http://127.0.0.1:4173. For a live Pod, set `PODPAD_WEB_MODE=solid` and load the Solid environment variables before starting it. The CLI remains available separately.

The web API and Solid credentials stay on the server; the browser receives only connection status and note titles/timestamps. The Codespaces port should remain private.

## Planned Features (Phase 1)

- Add note
- List notes
- Summarize notes
- Save summaries back to the Pod

Suggested command ideas:
- add-note
- list-notes
- summarize-notes

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
- Search/filter notes
- Config file for provider/settings
- Optional small local UI wrapper later

## Status

Project initialized in planning stage.
Name selected: PodPad.

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