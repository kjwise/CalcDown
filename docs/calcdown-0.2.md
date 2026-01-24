# CalcDown 0.2 (Draft Specification)

**This draft is SUPERSEDED.**  
Current version → [CalcDown 0.7](calcdown-0.7.md) — [stdlib 0.7](stdlib-0.7.md)

Status: **Draft / experimental**. CalcDown is a text-first, Git-friendly format for “spreadsheet-like” models: typed inputs and data, a deterministic compute graph, and declarative views.

This document specifies **CalcDown 0.2** (the file format and execution model). The companion standard library is specified in `docs/stdlib-0.2.md`.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

Terms used in this spec:

- **Document**: a single CalcDown Markdown file (recommended extension: `.calc.md`).
- **Block**: a fenced code block with a recognized language tag (`inputs`, `data`, `calc`, `view`).
- **Input**: a named, typed scalar value provided by the user/environment.
- **Table**: a set of typed rows, addressed by stable row identity (via `primaryKey`).
- **Node**: a named computed value defined in `calc` (scalar, column, or table).
- **View**: a declarative description of how to present existing values (cards, tables, charts).

## 1) Design goals

- **Text is the source of truth:** the semantic model is stored as plain text; UIs are projections.
- **AI- and Git-friendly:** named nodes/tables, stable identifiers, small diffs.
- **Reactive by default:** computations form a dependency graph (DAG), re-evaluated incrementally.
- **Deterministic execution:** no ambient I/O, time, or randomness unless explicitly provided as inputs.
- **Browser-first:** intended to run locally in a browser with a safe TS/JS-like expression language.

Non-goals (0.x):

- Full Excel parity (macros, add-ins, every edge case).
- Arbitrary side effects inside formulas.
- “Layout as source of truth” authoring (text-first initially).

## 2) File format

A CalcDown document is a UTF‑8 Markdown file (recommended extension: `.calc.md`) containing:

- Optional YAML front matter (`--- ... ---`)
- Markdown narrative
- Fenced code blocks that define executable/model content

### 2.1 Front matter

If present, front matter MUST be YAML and SHOULD include:

- `calcdown`: the spec version (`0.2`)
- `title`: a human-readable title (optional)

Implementations SHOULD accept `calcdown` as either a YAML number (`0.2`) or a string (`"0.2"`), but MUST treat it as an exact version identifier (not a range).

If `calcdown` is missing, implementations MAY assume the latest supported `0.x` version, but SHOULD emit a warning.

## 3) Blocks

CalcDown 0.2 defines the following block types (by code-fence language tag):

- `inputs` — typed parameters
- `data` — inline typed tables (small datasets)
- `calc` — computed nodes (CalcScript 0.2; a safe TS/JS-like subset)
- `view` — declarative views (charts, cards, dashboards)

Implementations MAY support aliases (e.g. `ts`, `js`) for `calc`, but `calc` is the canonical tag.

Documents MAY contain multiple blocks of the same type. Semantically, blocks are concatenated by type (e.g. all `inputs` blocks contribute to the input namespace, all `calc` blocks contribute nodes).

### 3.1 `inputs` block

Defines named, typed scalar values.

**Syntax (one per line):**

```
<name> : <type> = <default> [# comment]
```

**Rules:**

- `<name>` MUST match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Input names MUST be unique across the entire document (including `calc` node names and `data` table names).
- The identifier `std` is reserved and MUST NOT be used as an input name.
- Defaults MUST be parseable as the declared type.
- Implementations SHOULD expose inputs as UI controls (field/slider/date picker).

### 3.2 `data` block (inline tables)

Used for small, reviewable datasets. For large datasets, prefer external files or application-specific attachments.

A `data` block declares a single table with:

- A YAML header (schema + options)
- A `---` separator line
- JSON Lines (JSONL), one row per line (diff-friendly)

**Header keys (0.2):**

- `name` (string, required): table name (identifier-style recommended)
- `primaryKey` (string, required): column name used as stable row identity
- `columns` (map, required): `columnName: type`

**Rules:**

- `name` SHOULD match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Table names MUST be unique across the entire document and MUST NOT conflict with input or node names.
- The identifier `std` is reserved and MUST NOT be used as a table name.

**Availability to `calc`:**

- A `data` table MUST be available in `calc` expressions by its `name` identifier.
- The table value model is implementation-defined, but engines SHOULD provide a row-oriented view equivalent to `Array<Record<string, unknown>>` (one object per row) so views can consume it.

**Row format:**

- Each JSONL line MUST be a JSON object.
- Each row object MUST include the `primaryKey` field.
- Primary keys MUST be unique within the table and SHOULD be stable across edits.

Example (outer fence uses 4 backticks to safely nest Markdown fences):

````md
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
````

### 3.3 `calc` block (CalcScript 0.2)

CalcScript is a **TypeScript/JavaScript-like** language that is **not executed directly**. An engine parses it, validates it, and evaluates it in a sandbox.

In CalcDown 0.2, a `calc` block is a sequence of top-level `const` declarations:

```ts
const months = years * 12;
const rate_mo = std.finance.toMonthlyRate(annual_return);
const final_balance = std.data.last(balances);
```

Each `const <name> = <expr>;` defines a **node** in the compute graph.

**Rules:**

- Node names MUST match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Node names MUST be unique across the entire document (including input names).
- Engines MUST compute nodes as a DAG (topologically sorted).
- The only ambient global identifier is `std` (the standard library).
- The identifier `std` is reserved and MUST NOT be used as a node name.
- CalcScript MUST support `//` line comments and `/* ... */` block comments.

**CalcScript 0.2 expression subset (normative):**

- Literals: numbers, strings, booleans
- Identifiers: `foo`, `bar_baz`
- Unary: `-x`
- Binary: `+ - * / **` (with standard precedence; `**` is right-associative)
- Member access: `a.b`
- Calls: `f(x, y)` (calls MUST have a callee that is a member path rooted at `std`, e.g. `std.finance.pmt(...)`)
- Object literals: `{ a: 1, b, "c": 3 }` (shorthand allowed for identifiers)
- Arrow functions (expression-bodied only): `(x, i) => x + i` or `x => x + 1`

Everything else is out of scope for 0.2 (loops, assignments, `new`, `this`, dynamic property access, `import`, etc.).

### 3.4 `view` block

Views are declarative and MUST be derivable from existing nodes/tables. A `view` block is either YAML or JSON describing a view.

At minimum, every view object MUST include:

- `id` (string): unique within the document
- `type` (string): view type (e.g. `cards`, `chart`)
- `library` (string): the view “dialect” (e.g. `calcdown`, `vega-lite`)
- `spec` (object): view-type/library-specific configuration

Views MAY include additional top-level fields. CalcDown 0.2 standardizes `source` for table-backed views:

- `source` (string, optional): the name of a table node (a `data` table or a computed table-like node).

#### 3.4.1 Standard view types (recommended)

CalcDown intends “views” to be a stable, declarative contract between the model and any UI.

**Cards (`type: "cards"`, `library: "calcdown"`)**

Cards are a standardized “results pane”.

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

- `key` (string, required): node name to display
- `label` (string, optional): display label (defaults to `key`)
- `format` (optional): either a string (`number|integer|percent|date`) or an object with:
  - `kind` (string, required)
  - `digits` (number, optional)
  - `currency` (string, optional; required when `kind: "currency"`)

**Table (`type: "table"`, `library: "calcdown"`)**

Tables provide a standardized way to render tabular results.

Example:

```json
{
  "id": "schedule",
  "type": "table",
  "library": "calcdown",
  "source": "schedule",
  "spec": {
    "title": "Amortization schedule",
    "columns": [
      { "key": "date", "label": "Date", "format": "date" },
      { "key": "opening_balance", "label": "Open", "format": { "kind": "number", "digits": 2 } },
      { "key": "interest_pay", "label": "Interest", "format": { "kind": "number", "digits": 2 } },
      { "key": "principal_pay", "label": "Principal", "format": { "kind": "number", "digits": 2 } },
      { "key": "closing_balance", "label": "Close", "format": { "kind": "number", "digits": 2 } }
    ]
  }
}
```

Required fields:

- `source` (string, required): a table node name

Suggested `table.spec` keys:

- `title` (string, optional)
- `columns` (array, optional): list of column definitions:
  - `key` (string, required): column key in each row object
  - `label` (string, optional)
  - `format` (optional): same as cards item format

**Chart (`type: "chart"`)**

Charts are typically library-specific (e.g. Vega-Lite). CalcDown standardizes only the wrapper:

- `source` SHOULD reference a table node name (and is REQUIRED by most chart libraries).
- `spec` is passed to the chart library.

## 4) Types (0.2)

Scalar types (core):

- `string`
- `boolean`
- `number` (IEEE 754 double)
- `integer` (validated `number`)
- `decimal` (arbitrary precision; implementation-defined)
- `percent` (a numeric percentage in `[0, 100]` by convention)
- `currency(ISO4217)` (numeric with currency metadata)
- `date` (calendar date; ISO `YYYY-MM-DD` text representation)
- `datetime` (timestamp; timezone handling implementation-defined)

Implementations SHOULD validate types at boundaries:

- Input parsing
- Data table row parsing
- Stdlib function arguments (where practical)

## 5) Execution model

- The document defines a dependency graph of nodes: inputs, data tables, computed nodes, views.
- Engines evaluate nodes in topological order.
- On change, engines SHOULD re-evaluate only affected downstream nodes (reactive updates).

## 6) Safety model

CalcDown execution MUST be deterministic by default:

- No access to `window`, `document`, `globalThis`, `fetch`, storage APIs, or timers.
- No dynamic code evaluation (`eval`, `Function`, `import()`).
- No nondeterminism (time/random) unless explicitly provided as an input.

The only ambient global is `std`, plus the named inputs/nodes defined by the document.

Engines SHOULD defensively block prototype-pollution surfaces (e.g. disallow `__proto__`, `constructor`, `prototype` in user-authored member access and object keys).

## 7) Canonical formatting (for Git)

Implementations SHOULD provide `calcdown fmt` that:

- Normalizes whitespace and line endings
- Normalizes `inputs` lines (spacing and comments) without changing meaning
- Validates `data` header + JSONL rows (and optionally sorts rows by primary key)
- Produces stable output so semantic changes create small diffs

## Appendix A) CalcScript 0.2 grammar (informative)

This grammar describes the 0.2 expression subset:

```
program     := (decl)* ;
decl        := "const" ident "=" expr ";" ;
expr        := arrow | addsub ;
arrow       := params "=>" expr ;
params      := ident | "(" [ ident ("," ident)* ] ")" ;
addsub      := muldiv (("+"|"-") muldiv)* ;
muldiv      := power (("*"|"/") power)* ;
power       := unary ("**" power)? ;
unary       := "-" unary | postfix ;
postfix     := primary (("." ident) | call)* ;
call        := "(" [ expr ("," expr)* ] ")" ;
primary     := number | string | boolean | ident | object | "(" expr ")" ;
object      := "{" [ prop ("," prop)* [","] ] "}" ;
prop        := ident [ ":" expr ] | string ":" expr ;
```

## Appendix B) Changes from 0.1 → 0.2

- Clarifies CalcScript as a strict expression subset (adds object literals + expression-bodied arrow functions).
- Restricts function calls to `std.*` member paths (sandboxable by default).
- Tightens `data` blocks: JSONL rows are objects; `primaryKey` is required.
- Adds standardized `cards` and `table` view types as the recommended “results pane” and tabular view.
