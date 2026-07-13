# Dicemancer

2–4 player dice engine-builder for the browser. Vite + React + TypeScript.
**PLAN.md is the source of truth** — read it before starting any phase work. Card design constraints live in docs/DESIGN_RULES.md (the design agents read that file; don't duplicate it here).

## Commands
- `npm run dev` — Vite dev server
- `npm test` — Vitest. A phase is not done until this is green.

## Architecture invariants (never violate)
- `/src/engine` is pure TypeScript: no React, no DOM, no `Math.random` — RNG is injected and seeded. Every state change goes through `applyAction(state, action, rng)`. `GameState` stays fully serializable.
- Cards are data in `/src/content`, interpreted by the engine's effect system. Never write per-card bespoke logic into the engine.
- UI and bot touch the game only through `legalActions(state)` + `applyAction`. No game rules inside React components.

## Workflow
- Work exactly ONE phase from PLAN.md §7 at a time. Stop when its acceptance criteria pass — show the test output as evidence, don't just assert success. Never start the next phase unprompted.
- Commit at every green phase boundary (e.g. `P1: engine core — acceptance tests green`).
- Balance numbers are placeholders until the Phase 5 sim; don't tune by intuition.
- Subagents `card-designer` and `balance-reviewer` exist in .claude/agents/ — invoke only when explicitly asked.
