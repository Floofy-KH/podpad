## Plan: PodPad Phase 1B (Iterative With Test Gates)

Goal: deliver note creation and note listing in small, reviewable increments with explicit stage gates.

Scope for Phase 1B:
- add-note command (stdin content + optional title)
- list-notes command
- stable note naming convention
- defensive error handling and concise logs

Out of scope for this phase:
- summarize-notes
- note editing/deletion
- advanced metadata schema

---

### Stage 1: Note naming utility

Status: Complete.

Completion notes:
- Implemented `src/utils/note-name.ts` with `generateNoteFilename(title?: string): string`.
- Added unit tests in `tests/utils/note-name.test.ts` for all Stage 1 cases.
- Gate checks passed: `npm run check` and `npm test`.

Implementation target:
- Add src/utils/note-name.ts.
- Export generateNoteFilename(title?: string): string.
- Filename shape: {yyyyMMddTHHmmssZ}_{6hex}.txt or {yyyyMMddTHHmmssZ}_{6hex}_{slug}.txt.

Why this stage first:
- Pure logic, no auth/network coupling.
- Establishes a stable naming contract before write/list command code depends on it.

Gate 1: testability and checks
- Entry criteria:
  - No command wiring required.
  - Naming rules are written in code comments or function docs.
- Pass criteria:
  - Filename pattern is deterministic in format and validated by local checks.
  - Slug behavior is correct for title/no-title paths.
  - Multiple calls produce collision-resistant names in practical use.
  - npm run check passes.
  - npm test passes.
- Rollback criteria:
  - Pattern ambiguity discovered (for example, hard to parse timestamp).
  - Excessively long or unsafe slugs.
  - Any type-check regression.

Automated unit tests (tests/utils/note-name.test.ts):
- Test runner: Node.js built-in node:test with node:assert/strict. No new dependencies.
- Test cases to cover:
  1. Output with no title matches {timestamp}_{6hex}.txt.
  2. Output with title includes lowercased slug derived from title.
  3. Slug strips leading/trailing dashes and collapses punctuation runs.
  4. Two calls within the same second produce different filenames (random hex differs).
  5. Empty string title is treated as no title.

Suggested verification for this gate:
1. npm run check
2. npm test

---

### Stage 2: add-note command

Status: Complete.

Completion notes:
- Implemented `src/commands/add-note.ts` with stdin reading, title parsing, and Pod writes.
- Added unit tests in `tests/commands/add-note.test.ts` covering title parsing, empty content rejection, and session isolation.
- Gate checks passed: `npm run check` and `npm test`.
- Manual verification:
  - Non-empty stdin successfully creates notes in notes/ container.
  - Title flags (--title, -t) correctly generate filename slugs.
  - Empty stdin is rejected before session creation with clear error.
  - Missing env vars map through ConfigError with readable details.
  - Pod write confirmed with fresh refresh token:
    - Example no-title: `20260612T144745Z_6b0efa.txt`
    - Example with-title: `20260612T144908Z_996cfc_my-phase-1b-note.txt`

Implementation target:
- Add src/commands/add-note.ts.
- Read content from stdin.
- Support optional --title and -t.
- Write note content to notes/ via PodClient.writeTextResource.
- Reuse existing config/auth/session lifecycle and logger patterns.

Dependencies:
- Stage 1 naming utility completed and stable.

Gate 2: testability and checks
- Entry criteria:
  - Stage 1 gate passed.
  - Command can be invoked from a function entrypoint with argv.
- Pass criteria:
  - Non-empty stdin creates a note in notes/.
  - Empty stdin returns clear, actionable error.
  - --title affects filename slug only, not note body.
  - Missing env vars still map through ConfigError with readable details.
  - npm run check passes.
  - npm test passes.
- Rollback criteria:
  - Stdin handling hangs or behaves inconsistently.
  - Session cleanup regressions (logout not attempted in finally).
  - Errors become less actionable than current connectivity-check behavior.

Automated unit tests (tests/commands/add-note.test.ts):
- Scope: only logic that does not require a live Pod session.
- Test cases to cover:
  1. parseTitle extracts --title value correctly.
  2. parseTitle extracts -t value correctly.
  3. parseTitle returns undefined when neither flag is present.
  4. Empty content string is rejected with a clear error before any session is created.
- Note: Pod write path remains manual-only at this stage (live session required).

Suggested verification for this gate:
1. npm run check
2. npm test
3. echo "Hello from Phase 1B" | npm run dev -- add-note
4. echo "Hello titled" | npm run dev -- add-note --title "My First Note"
5. Run once with missing required env var and verify ConfigError output quality.

---

### Stage 3: list-notes command

Implementation target:
- Add src/commands/list-notes.ts.
- List URLs from notes/ using PodClient.listResourceUrls.
- Print learner-friendly output for empty and non-empty states.
- Reuse existing config/auth/session lifecycle and logger patterns.

Dependencies:
- Phase 1A connectivity foundation.
- Prefer Stage 2 complete so there is realistic data to list.

Gate 3: testability and checks
- Entry criteria:
  - Command entrypoint exists and runs from CLI routing candidate branch.
- Pass criteria:
  - Empty container path prints a clear no-notes message.
  - Non-empty path prints note count and each URL.
  - Works with notes created by Stage 2.
  - npm run check passes.
  - npm test passes.
- Rollback criteria:
  - Output format is confusing or inconsistent with logger style.
  - Listing fails on common provider response paths already handled by PodClient.
  - Any type-check regression.

Automated unit tests:
- No new unit tests at this stage. Output formatting logic is tightly coupled to logger calls and does not warrant an isolated unit test unless the formatting is factored into a helper.
- Coverage for PodClient.listResourceUrls and extractContainedUrls is deferred to Phase 1D, where a mocked Pod layer is introduced.
- If formatting is factored out, add tests to tests/commands/list-notes.test.ts at that point.

Suggested verification for this gate:
1. npm run check
2. npm test (should still pass; no new test failures expected)
3. npm run dev -- list-notes in empty-state environment.
4. Create at least one note via add-note, then rerun list-notes.

---

### Stage 4: CLI integration

Status: Complete.

Completion notes:
- Exported `parseCommand` from `src/cli.ts`.
- Added `tests/cli.test.ts` covering all routing cases (add-note, list-notes, phase0-check, connectivity-check, help, unknown command, no command).
- Gate checks passed: `npm run check` and `npm test`.

Implementation target:
- Update src/cli.ts:
  - Add add-note and list-notes command constants.
  - Extend parseCommand.
  - Add dynamic import dispatch branches.
  - Update help text.

Dependencies:
- Stages 2 and 3 command modules exist.

Gate 4: testability and checks
- Entry criteria:
  - Stage 2 and Stage 3 gates passed at module level.
- Pass criteria:
  - help output includes add-note and list-notes.
  - add-note dispatches correctly and receives argv.
  - list-notes dispatches correctly.
  - Unknown command still falls back to help.
  - npm run check passes.
  - npm test passes.
- Rollback criteria:
  - Existing commands regress (phase0-check, connectivity-check).
  - Routing becomes ambiguous or brittle.

Automated unit tests (tests/cli.test.ts):
- Test cases to cover:
  1. parseCommand returns add-note for "add-note" argv.
  2. parseCommand returns list-notes for "list-notes" argv.
  3. parseCommand returns help for an unrecognized command string.
  4. parseCommand returns help when no command is given.
  5. Existing cases (phase0-check, connectivity-check, help) still resolve correctly.
- Note: parseCommand must be exported from cli.ts to make these tests possible.

Suggested verification for this gate:
1. npm run check
2. npm test
3. npm run dev -- help
4. npm run dev -- phase0-check
5. npm run dev -- connectivity-check
6. echo "wire check" | npm run dev -- add-note
7. npm run dev -- list-notes

---

### Stage 5: README updates for Phase 1B

Status: Complete.

Completion notes:
- Replaced the "Planned Features (Phase 1)" section with a concrete "Phase 1B Commands" section showing `add-note` and `list-notes` usage.
- Added copy-pasteable examples for stdin piping and the `--title` / `-t` flags.
- Updated the Status section to reflect Phase 1B completion.
- Verified README examples align with help output.
- Gate checks passed: `npm run check` and `npm test`.

Implementation target:
- Update README.md with Phase 1B commands and usage examples.
- Ensure docs reflect actual stdin-first behavior and optional title flag.

Dependencies:
- Stage 4 complete so docs match real CLI behavior.

Gate 5: testability and checks
- Entry criteria:
  - CLI behavior is finalized for this phase.
- Pass criteria:
  - Every documented command is copy-paste runnable as written.
  - Phase 1B section clearly states stdin requirement and title option.
  - No mismatch between docs and help output.
- Rollback criteria:
  - Documentation drift detected during copy-paste checks.
  - Examples imply unsupported options.

Suggested verification for this gate:
1. Run each README command exactly as written.
2. Compare README command list against help output.

---

## Iterative execution policy

Use this sequence and do not skip gates:
1. Implement one stage.
2. Run that stage gate checks.
3. Commit only after pass.
4. Move to next stage.

Recommended commit granularity:
1. stage-1-note-name
2. stage-2-add-note
3. stage-3-list-notes
4. stage-4-cli-wire
5. stage-5-readme

This keeps each change small, reviewable, and easy to revert independently.

---

## Test runner convention

- Framework: Node.js built-in node:test (no extra dependencies).
- Assertions: node:assert/strict.
- File pattern: tests/**/*.test.ts (run via tsx with node --test).
- Run: npm test.
- Tests must not require a live Pod session. Pod-dependent paths remain manual.

---

## Quick command checklist by stage

Stage 1:
- npm run check
- npm test

Stage 2:
- npm run check
- npm test
- echo "Hello" | npm run dev -- add-note
- echo "Hello" | npm run dev -- add-note --title "My Note"

Stage 3:
- npm run check
- npm test
- npm run dev -- list-notes

Stage 4:
- npm run check
- npm test
- npm run dev -- help
- npm run dev -- phase0-check
- npm run dev -- connectivity-check
- echo "wire check" | npm run dev -- add-note
- npm run dev -- list-notes

Stage 5:
- Run README examples exactly as documented
