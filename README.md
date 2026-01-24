# CalcDown

CalcDown is a text-first format for “spreadsheet-like” models: **typed data + a reactive compute graph + declarative views** — designed for **Git diffs/merges** and **AI-assisted editing**.

This repo treats the **spec and examples as the product**; the implementation here is a small browser-first scaffold used to keep the spec honest.

## Why

Spreadsheets are incredibly expressive, but:

- `.xlsx` is opaque and diff-hostile (PRs/merges are painful)
- cell-address formulas (A1/B2) are brittle and hard for humans + LLMs to reason about
- “the model” (logic) is tightly coupled to a particular UI grid state

CalcDown makes the **semantic model** (names, types, formulas, views) the source of truth in plain text.

## The killer feature: semantic tooling

The evaluator in this repo is intentionally small; the most “shipped-feeling” part today is the **Git-native tooling**:

- **Canonical formatting** (`make fmt`, `tools/fmt_calcdown.js`): normalizes CalcDown documents and **sorts inline JSONL rows by `primaryKey`** (with stable key ordering). If two people edit different rows, diffs are smaller and merge conflicts are less likely.
- **Semantic diffs** (`make diff`, `tools/calcdown.js diff`): compares the **parsed model** (inputs/tables/nodes/views), not just raw Markdown lines. Diffs point at “what changed” (e.g. a node expression or table schema), and can include **row-level changes by primary key** when row data is available.

## What

A CalcDown project is one or more Markdown documents (recommended extension: `.calc.md`) with fenced blocks:

- `inputs` — typed inputs with defaults
- `data` — typed tables (inline JSONL or external CSV/JSON sources pinned by SHA‑256)
- `calc` — CalcScript (sandboxed subset) defining computed nodes/tables
- `view` — standardized, schema-validated views (`cards`, `table`, `chart`, `layout`)

For multi-document projects, CalcDown 0.7 also defines:

- `calcdown.json` — a project manifest (`entry`, optional `include`, optional `lock`)
- `calcdown.lock.json` — a lockfile (document + external data hashes)

## How (tiny example)

````md
---
title: Savings growth
calcdown: 0.7
---

``` inputs
initial_balance      : number  = 10000
monthly_contribution : number  = 500
annual_return        : percent = 6.0
years                : integer = 10
```

``` calc
const months = years * 12;
const rate_mo = std.finance.toMonthlyRate(annual_return);
const balances = std.data.scan(
  std.data.sequence(months),
  (b) => (b * (1 + rate_mo)) + monthly_contribution,
  { seed: initial_balance }
);
const final_balance = std.data.last(balances);
```

``` view
{
  "id": "summary",
  "library": "calcdown",
  "type": "cards",
  "spec": { "title": "Summary", "items": [{ "key": "final_balance", "label": "Final balance" }] }
}
```
````

## Docs

- `PURPOSE.md` — project goals and thesis
- `docs/calcdown-0.7.md` — **current** file format + project files + execution model
- `docs/stdlib-0.7.md` — **current** standard library
- `docs/examples/*.calc.md` — executable examples (use latest spec)
- Archived drafts: `docs/calcdown-0.[123456].md`, `docs/stdlib-0.[123456].md`
- Agent guidance: `AGENTS.md` (plus scoped files in subfolders)

## Status

Early-stage: the spec is evolving, and the code here is a minimal, safety-first evaluator + demos (not a full spreadsheet UI/editor).

## Quickstart

- Install deps: `make install`
- Run the demos: `make demo` then open `http://localhost:5173/`
- Run typecheck/tests: `make check`
- Run full deterministic verification: `make verify`

## Demos

- Index: `http://localhost:5173/`
- Demo 1: `http://localhost:5173/demo/` (scratchpad + simple charts)
- Demo 2: `http://localhost:5173/demo2/` (inputs → cards view)
- Demo 3: `http://localhost:5173/demo3/` (tabular data input + computed tables + layout)
- Demo 4: `http://localhost:5173/demo4/` (browse examples; render cards/table/chart/layout)
- Demo 5: `http://localhost:5173/demo5/` (external CSV/JSON `data.source` + SHA‑256 verification)

## Tooling (CLI-like)

The `make/*` targets wrap small scripts in `tools/`:

- Canonicalize examples: `make fmt`
- Check formatting (no writes): `make fmt-check`
- Validate: `make validate ENTRY=docs/examples/mortgage.calc.md`
- Validate strictly (fail on warnings): `make validate-strict ENTRY=docs/examples/mortgage.calc.md`
- Lock: `make lock ENTRY=calcdown.json OUT=calcdown.lock.json`
- Export: `make export ENTRY=calcdown.json EXPORT_OUT=build/export.json`
- Export strictly (fail on warnings): `make export-strict ENTRY=calcdown.json EXPORT_OUT=build/export.json`
- Semantic diff: `make diff A=docs/examples/mortgage.calc.md B=docs/examples/savings.calc.md`
- Single-file repo dump for other LLMs: `make dump` (writes `build/dump_repo.md`, gitignored)
- Conformance suite (golden outputs): `make conformance`
