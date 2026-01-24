# CalcDown — Agent Instructions

These instructions apply to the whole repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Project intent

- Treat **spec + docs as the product** (the implementation is a scaffold/prototype).
- Keep CalcDown **text-first, Git-friendly, deterministic, and browser-first**.
- Prefer semantic names (nodes/tables) over positional references (no A1-style thinking).

## Quick commands

- `make build` — compile TypeScript into `dist/`
- `make typecheck` — strict TS typecheck
- `make analyze` — static analysis (unused locals/params)
- `make test` — Node test runner + coverage thresholds (stdlib)
- `make check` — `typecheck + analyze + test`
- `make demo` — build then serve demos
- `make dump` — write a single-file repo dump for LLM review (gitignored)

## Dependency policy

- Avoid adding new runtime dependencies unless there is a clear win.
- Prefer Node/TypeScript built-ins and small, auditable code.
- Assume network access may be unavailable in some environments; keep workflows offline-friendly.

## Safety model (important)

- Do **not** use `eval`, `new Function`, dynamic `import()`, or access to browser globals in CalcScript evaluation.
- Keep prototype-pollution defenses intact (`__proto__`, `constructor`, `prototype`).
- `std` is reserved; do not allow user code to shadow it.

## Documentation rules

- Specs are versioned under `docs/` (e.g. `docs/calcdown-0.5.md`, `docs/stdlib-0.5.md`).
- Older versions stay **archived/superseded**, not rewritten.
- Keep examples executable and consistent with the latest spec.
