## Plan: PodPad Phase 1 Kickoff

Deliver a learning-first CLI foundation in Node.js + TypeScript that proves the full ingest -> analyze -> persist loop with Solid Pods. Start with reliable Pod access and note workflows, then add summarization via a mock-first adapter so provider choice can evolve without rework.

### Steps

#### Phase 1.0: Project framing and scaffolding
1. [x] Confirm implementation boundaries from README/AGENTS: CLI-first, minimal dependencies, no frontend, no deployment, small reviewable increments.
2. [x] Define minimal TypeScript project skeleton and command entrypoint.
3. [x] Decide baseline Node version and package scripts for build/run/test. Depends on step 1.

#### Phase 1A: Solid connectivity foundation
Dependency: complete Phase 1.0.
1. [x] Implement auth/session bootstrap for beginner-friendly local usage first. Follow-up path documents service-style auth for later learning.
2. [x] Implement Pod client wrapper that centralizes authenticated read/write/list operations. Depends on step 1.
3. [x] Implement idempotent container bootstrap for notes/ and summaries/. Depends on step 2.
4. [x] Add a connectivity smoke command/check that validates auth + Pod access before feature commands. Depends on steps 1-3.
5. [x] Set up a real Solid account/client credentials locally, run connectivity-check against a valid Pod, and do manual verification/playground passes (auth success, container bootstrap, repeat run idempotency).

#### Phase 1B: Note command slice
Dependency: complete Phase 1A.
1. Implement add-note command to persist note resources in notes/. Depends on Phase 1A step 3.
2. Implement list-notes command to enumerate notes with learner-friendly output. Depends on Phase 1A step 3. Parallel with step 1.
3. Define note naming/metadata convention (timestamp + short id + optional title) to avoid collisions and keep traceability. Depends on steps 1-2.
4. Add defensive error mapping and concise logging to all note commands. Parallel with steps 1-3.

#### Phase 1C: Summarization slice
Dependency: complete Phase 1B.
1. Implement summarization adapter interface with at least two providers: mock provider (default for onboarding/tests) and one real provider implementation stub.
2. Wire summarize-notes command: read notes -> summarize -> persist outputs in summaries/. Depends on Phase 1B step 2 and Phase 1C step 1.
3. Store summary linkage metadata to source notes (source URI/id + created time). Depends on step 2.
4. Add failure-path handling: summarize failures should not corrupt note data; write failures should report actionable recovery steps. Depends on step 2.

#### Phase 1D: Config + tests + docs
Dependency: complete Phases 1A-1C.
1. Add config loader with env/file support for Pod settings and summarizer provider selection. Include clear validation errors.
2. Add minimal tests: unit tests for config and summarizer adapter; integration-lite tests for note listing/parsing with mocked Pod layer.
3. Add one end-to-end manual verification script/checklist (add -> list -> summarize -> verify in Pod).
4. Update README and AGENTS with concrete commands/scripts and Phase 1 workflow notes. Depends on steps 1-3.

### Relevant files
- README.md - source of truth for project goals, milestones, command scope, and learner-facing setup.
- AGENTS.md - constraints for learning-first implementation style and documentation requirements.
- src/cli.ts - planned command routing entrypoint.
- src/pod/auth.ts - planned Solid auth/session bootstrap.
- src/pod/client.ts - planned authenticated Pod operations wrapper.
- src/pod/bootstrap.ts - planned container bootstrap logic for notes/ and summaries/.
- src/commands/add-note.ts - planned add-note command.
- src/commands/list-notes.ts - planned list-notes command.
- src/commands/summarize-notes.ts - planned summarize-notes orchestrator.
- src/agent/summarizer.ts - planned provider adapter and mock-first default.
- src/utils/config.ts - planned config parsing/validation.
- src/utils/logger.ts - planned concise logging/error formatting.
- tests/ - planned minimal unit + integration-lite test coverage.

### Verification
1. Foundation checks: authenticated session established, Pod root reachable, notes/ and summaries/ created idempotently.
2. Command checks: add-note creates unique resources; list-notes works for empty and non-empty containers.
3. Summarization checks: summarize-notes writes summary resources with source linkage; mock provider works offline.
4. Failure checks: invalid config, auth failure, missing container, provider failure, and Pod write failure return actionable errors.
5. Regression checks: rerun bootstrap and summarize commands without duplicating/mutating unrelated data.
6. Documentation checks: README includes exact scripts, config steps, and first-run walkthrough.

### Decisions
- Runtime: Node.js + TypeScript.
- Auth approach: start with simplest interactive/local-dev path; document service-style auth as a Phase 2 follow-up.
- Phase 1 includes basic config and minimal tests.
- Summarizer strategy: adapter-based design with mock-first default to enable learning without immediate provider lock-in.

### Further Considerations
1. Real LLM provider options to present in implementation kickoff:
Option A: OpenAI API (most common docs/ecosystem).
Option B: Local model via Ollama (offline-friendly, great for experimentation).
Option C: Hugging Face inference provider (broad model variety).
Recommendation: implement A or B first behind the same adapter, keep mock as default.
2. Testing depth target for Phase 1 should remain minimal: prioritize critical path and error handling over broad coverage.
3. Scope guard: defer tagging/action extraction and advanced Solid policies to Phase 2+.
4. Auth follow-up after Phase 1: evaluate replacing Inrupt auth SDK with a generic OAuth/OIDC stack (option 1), likely oauth4webapi or openid-client plus jose, and keep this as a Phase 2 migration track once core CLI flows are stable.