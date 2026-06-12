# AGENTS.md

This file provides repository-specific guidance for AI coding agents.

## Scope And Source Of Truth

- Start with the project overview in [README.md](README.md).
- If this file conflicts with [README.md](README.md), follow [README.md](README.md).

## Project State

- Status: planning stage with a small initial implementation scope.
- Product direction: beginner-friendly exploration of AI agents with Solid Pods.
- Current interaction model: CLI-first.

## Learning-First Priority

- This repository is primarily for learning, not shipping a final product.
- Prefer changes that are easy to inspect, reason about, and discuss.
- Optimize for clarity of approach over speed or completeness.

## Working Boundaries

- Keep solutions simple and educational.
- Avoid introducing deployment infrastructure unless explicitly requested.
- Avoid adding a web frontend unless explicitly requested.
- Prefer minimal dependencies and small, readable code changes.

## Domain Expectations

- Core data flow should align with: ingest -> analyze -> persist.
- Pod data organization should align with [README.md](README.md): `notes/` and `summaries/`.
- Prioritize basic reliability: clear errors, defensive checks, and concise logging.

## Commands And Validation

- Canonical scripts, setup steps, and tooling docs live in [README.md](README.md).
- Before running Solid connectivity or other Pod-affecting CLI commands, load values from `.env` into the current terminal session so required environment variables are present.

## Agent Behavior

- Make the smallest safe change that unblocks progress.
- Favor incremental, step-by-step updates over broad refactors.
- Keep each change narrowly scoped so a learner can review it in one pass.
- Explain intent in simple terms through clear naming and straightforward structure.
- When requirements are ambiguous, prefer preserving current scope over expanding features.
- If adding conventions (tooling, structure, commands), document them in [README.md](README.md).