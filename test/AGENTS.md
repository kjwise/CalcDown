# Tests — Agent Instructions

Scope: `test/**`.

## Goals

- Keep tests fast, deterministic, and runnable offline.
- Maintain high coverage for the stdlib (thresholds enforced by `npm test` / `make test`).

## Conventions

- Use Node’s built-in test runner: `node:test`.
- Import from `dist/**` (tests run against built output) unless there is a strong reason not to.
- Prefer stable numeric comparisons (tolerances) for floating point math.

