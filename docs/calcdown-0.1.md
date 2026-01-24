# CalcDown 0.1 (Draft Specification)

**This draft is SUPERSEDED.**  
Current version → [CalcDown 0.5](calcdown-0.5.md) — [stdlib 0.5](stdlib-0.5.md)

Status: **Draft / experimental**. This document describes an MVP-friendly, browser-first format for “spreadsheet-like” models as plain text.

## 1) Goals

- **Readable + editable as text:** works in Git, code review, and with AI patching.
- **Reactive execution model:** computations form a dependency graph (DAG).
- **Browser-first:** evaluation and rendering can run entirely in a browser.
- **Deterministic + safe:** no ambient I/O; sandboxed execution.
- **Semantic identifiers:** named tables/columns/nodes (no `A1` addressing).

## 2) File format

A CalcDown document is a UTF‑8 Markdown file (recommended extension: `.calc.md`) containing:

- Optional YAML front matter (`--- ... ---`)
- Markdown narrative
- Fenced code blocks that define executable/model content

Example (block overview):

```md
---
title: Simple Mortgage
calcdown: 0.1
---

## Inputs
```inputs
loan_amount   : currency(USD) = 300000
interest_rate : percent       = 5.0
term_years    : integer       = 30
start_date    : date          = 2024-01-01
```

## Logic
```calc
const total_months = term_years * 12;
const rate_mo = std.finance.toMonthlyRate(interest_rate);
const payment = std.finance.pmt(rate_mo, total_months, -loan_amount);
```
```

## 3) Blocks

CalcDown 0.1 defines these block types (by code-fence language tag):

- `inputs` — typed parameters
- `data` — inline typed tables (small datasets)
- `calc` — formulas (CalcScript; a safe TS/JS subset compiled by the engine)
- `view` — declarative charts/dashboards

Implementations MAY support aliases (`ts`, `js`) for `calc`, but `calc` is the canonical tag.

### 3.1 `inputs` block

Defines named, typed scalar values.

Syntax (one per line):

```
<name> : <type> = <default> [# comment]
```

Rules:

- `<name>` MUST match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Duplicate names are invalid.
- Defaults MUST be parseable as the declared type.
- Implementations SHOULD expose inputs as UI controls (field/slider/date picker).

### 3.2 `data` block (inline tables)

Used for small, reviewable datasets. For large datasets, prefer external files or application-specific attachments.

A `data` block declares a single table with:

- A YAML header (schema + options)
- A `---` separator line
- JSON Lines (JSONL), one row per line (diff-friendly)

Example:

```md
```data
name: expenses
primaryKey: id
columns:
  id: string
  date: date
  category: string
  amount: currency(ISK)
---
{"id":"e1","date":"2026-01-01","category":"Food","amount":18990}
{"id":"e2","date":"2026-01-03","category":"Transport","amount":4100}
```
```

Rules:

- Each JSONL row MUST include the `primaryKey` field.
- Primary keys MUST be unique and stable across edits (for merges/diffs).
- Implementations SHOULD treat `primaryKey` as the row identity (not row order).

### 3.3 `calc` block (CalcScript)

CalcScript is a **TypeScript/JavaScript-like** language that is **not executed directly**. The engine parses it, validates it, then compiles it into safe runtime code.

Design intent:

- User writes familiar math (`a * (1 + b)`) without manual `.map(...)`.
- The compiler rewrites operators into vectorized calls so scalars/columns “just work”.

In CalcDown 0.1, a `calc` block is a sequence of `const` declarations:

```ts
const monthly_rate = std.finance.toMonthlyRate(interest_rate);
const total_months = term_years * 12;
const payment = std.finance.pmt(monthly_rate, total_months, -loan_amount);
```

Rules:

- Each top-level `const <name> = <expr>;` defines a **node** in the compute graph.
- Node names MUST be unique across all `calc` blocks in the document.
- Implementations MAY allow multiple `calc` blocks; node scope is document-global.

See `docs/stdlib-0.1.md` for the expected `std.*` API.

### 3.4 `view` block

Views are declarative and MUST be derivable from existing nodes/tables. A `view` block is YAML (or JSON) describing a chart/dashboard.

CalcDown 0.1 defines a minimal, implementation-agnostic schema:

```yaml
id: paydown
type: chart
library: vega-lite
source: schedule
spec:
  mark: line
  encoding:
    x: { field: date, type: temporal }
    y: { field: closing_balance, type: quantitative }
```

Rules:

- `id` MUST be unique.
- `source` MUST reference a table node.
- Implementations MAY support multiple chart libraries.

#### 3.4.1 Standard view types (recommended)

CalcDown intends “views” to be a stable, declarative contract between the model and any UI.

Recommended standardized view types:

**Cards (summary)**

Use cards when you want a small set of headline numbers (the “results pane” in a UI).

```json
{
  "id": "summary",
  "type": "cards",
  "library": "calcdown",
  "spec": {
    "title": "Summary",
    "items": [
      { "key": "months", "label": "Months", "format": { "kind": "integer" } },
      { "key": "final_balance", "label": "Final balance", "format": { "kind": "number", "digits": 0 } }
    ]
  }
}
```

`cards.spec.items[]`:

- `key` (string, required): name of a node to display
- `label` (string, optional): display label (defaults to `key`)
- `format` (optional): `number|integer|percent|currency|date` (either a string or an object with `{ kind, digits, currency }`)

**Chart**

Charts remain library-specific, but should always declare:

- `source` (table node name)
- `spec` (library-defined spec; e.g. Vega-Lite)

## 4) Types (0.1)

Scalar types:

- `string`
- `boolean`
- `number` (IEEE 754 double)
- `integer` (validated `number`)
- `decimal` (arbitrary precision; implementation-defined)
- `percent` (a `decimal` ratio in `[0, 100]` by convention)
- `currency(ISO4217)` (a `decimal` with currency metadata)
- `date` (calendar date)
- `datetime` (timestamp with timezone handling; implementation-defined)

Implementations SHOULD validate types at boundaries:

- Input parsing
- Data table row parsing
- Stdlib function arguments (where practical)

## 5) Evaluation model

- The document defines a dependency graph of nodes (inputs, tables, computed nodes, views).
- The engine evaluates nodes in topological order.
- On change, the engine re-evaluates only affected downstream nodes (reactive updates).

Tables:

- A table is a typed collection of rows with a stable primary key.
- Implementations SHOULD represent columns in a columnar format for performance.

## 6) Sandboxing + safety

CalcDown execution MUST be deterministic by default:

- No access to `window`, `document`, `globalThis`, `fetch`, storage APIs, or timers.
- No dynamic code evaluation (`eval`, `Function`, `import()`).
- No nondeterminism (time/random) unless explicitly provided as an input.

The only available global is `std` (standard library), plus named nodes/tables from the document.

## 7) Canonical formatting (for Git)

Implementations SHOULD provide `calcdown fmt` (or equivalent) that:

- Normalizes whitespace and line endings
- Canonicalizes `inputs` alignment (optional but recommended)
- Canonicalizes `data` header key ordering
- Validates JSONL rows and (optionally) sorts rows by primary key

The goal is stable diffs: a semantic change should produce a small textual diff.
