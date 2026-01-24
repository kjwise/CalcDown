# CalcDown

CalcDown is a text-first format for “spreadsheet-like” models: typed data + a reactive compute graph + declarative views, designed to be friendly to AI editing and to Git diffs/merges.

## Docs

- `PURPOSE.md` — project goals and thesis
- `docs/calcdown-0.2.md` — draft file format + execution model
- `docs/stdlib-0.2.md` — draft standard library (`std.*`)
- `docs/examples/mortgage.calc.md` — end-to-end example
- `docs/examples/savings.calc.md` — simple “cards view” example
- Archived drafts: `docs/calcdown-0.1.md`, `docs/stdlib-0.1.md`

## Status

Early-stage: this repo currently contains draft specifications and examples, not a full implementation.

## Demo (parser/evaluator scaffold)

This repo includes a minimal browser-first TypeScript parser/evaluator scaffold:

- Install deps: `make install` (or `npm install`)
- Build: `make build` (or `npm run build`)
- Demo: `make demo` then open `http://localhost:5173/demo/`
- Demo renders `view` blocks as simple SVG charts (JSON only), with a UI toggle for line vs bar/column.
- Demo 2: open `http://localhost:5173/demo2/` (cards view + inputs form) using `docs/examples/savings.calc.md`.
