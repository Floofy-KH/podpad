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
- No deployment or infrastructure setup yet
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

- No web frontend required
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