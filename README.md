# CalcDown

CalcDown is a text-first format for “spreadsheet-like” models: typed data + a reactive compute graph + declarative views, designed to be friendly to AI editing and to Git diffs/merges.

## Docs

- `PURPOSE.md` — project goals and thesis
- `docs/calcdown-0.3.md` — **current** file format + execution model
- `docs/stdlib-0.3.md` — **current** standard library
- `docs/examples/*.calc.md` — executable examples (use latest spec)
- Archived drafts: `docs/calcdown-0.[12].md`, `docs/stdlib-0.[12].md`
- Agent guidance: `AGENTS.md` (plus scoped files in subfolders)

## Status

Early-stage: this repo currently contains draft specifications and examples, not a full implementation.

## Demo (parser/evaluator scaffold)

This repo includes a minimal browser-first TypeScript parser/evaluator scaffold:

- Install deps: `make install` (or `npm install`)
- Build: `make build` (or `npm run build`)
- Static analysis: `make analyze` (or `npm run analyze`)
- Tests: `make test` (built-in Node test runner + coverage thresholds)
- Format examples: `make fmt` (normalizes `docs/examples/*.calc.md`)
- CI-ish local check: `make check`
- Repo dump: `make dump` (writes `build/dump_repo.md`, gitignored)
- Demo: `make demo` then open `http://localhost:5173/demo/`
- Demo renders `view` blocks as simple SVG charts (JSON or YAML), with a UI toggle for line vs bar/column.
- Demo 2: open `http://localhost:5173/demo2/` (cards view + inputs form) using `docs/examples/savings.calc.md`.
- Demo 3: open `http://localhost:5173/demo3/` (tabular `data` input + computed table output) using `docs/examples/invoice.calc.md`.
