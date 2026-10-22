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
- Optional private Codespaces web screen for phone testing
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

## Phone Testing (GitHub Codespaces)

The optional mobile-friendly web screen lets you try adding and listing notes from a phone browser. It runs inside a Codespace; the forwarded port is configured as **private** and is not a permanent hosted app.

1. Create a Codespace for this repository.
2. Wait for setup and the PodPad page to open. If it does not, open the forwarded **PodPad phone demo** port from the Ports panel.
3. Start in demo mode: add and list sample notes without Solid credentials. Demo notes are kept in server memory and disappear when the app restarts.
4. Stop the Codespace when finished.

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

The commands below are the repeatable setup flow for Solid auth on `solidcommunity.net`.

### 1. Register a client and capture client ID/secret

```bash
python scripts/register_client.py
```

Shortcut:

```bash
npm run auth:register
```

Optional flags:

```bash
python scripts/register_client.py --issuer https://solidcommunity.net --client-name "PodPad CLI" --redirect-uri http://127.0.0.1:8787/callback
```

### 2. Request an auth code with PKCE

Run this command with your client ID, then copy the full callback URL from your browser and paste it when prompted:

```bash
python scripts/request_auth_code.py --client-id PASTE_CLIENT_ID
```

Shortcut:

```bash
npm run auth:code -- --client-id PASTE_CLIENT_ID
```

The script prints `PODPAD_CLIENT_ID`, `PODPAD_PKCE_VERIFIER`, `PODPAD_AUTH_CODE`, and `PODPAD_REDIRECT_URI` values you will need for the next step and for `.env`.

### 3. Exchange auth code for refresh token

```bash
python scripts/exchange_auth_code.py --client-id PASTE_CLIENT_ID --client-secret PASTE_CLIENT_SECRET --auth-code PASTE_AUTH_CODE --pkce-verifier PASTE_PKCE_VERIFIER
```

Shortcut:

```bash
npm run auth:token -- --client-id PASTE_CLIENT_ID --client-secret PASTE_CLIENT_SECRET --auth-code PASTE_AUTH_CODE --pkce-verifier PASTE_PKCE_VERIFIER
```

The script prints `PODPAD_REFRESH_TOKEN`.

### 4. Populate `.env`

Fill your local `.env` file with values from steps 1-3 and your Pod URL.

### 5. Load `.env` in Python and run check

```bash
python scripts/load_env_and_run.py -- npm run dev -- connectivity-check
```

Shortcut:

```bash
npm run auth:check
```