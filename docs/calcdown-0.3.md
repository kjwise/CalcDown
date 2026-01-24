# CalcDown 0.3 (Draft Specification)

Status: **Draft / experimental**. CalcDown is a text-first, Git-friendly format for “spreadsheet-like” models: typed inputs and data, a deterministic compute graph, and declarative views.

This document specifies **CalcDown 0.3** (the file format and execution model). The companion standard library is specified in `docs/stdlib-0.3.md`.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

Terms used in this spec:

- **Document**: a single CalcDown Markdown file (recommended extension: `.calc.md`).
- **Block**: a fenced code block with a recognized language tag (`inputs`, `data`, `calc`, `view`).
- **Input**: a named, typed scalar value provided by the user/environment.
- **Table**: a set of typed rows, addressed by stable row identity (via `primaryKey`).
- **Node**: a named computed value defined in `calc` (scalar, column, or table-like).
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

- `calcdown`: the spec version (`0.3`)
- `title`: a human-readable title (optional)

Implementations SHOULD accept `calcdown` as either a YAML number (`0.3`) or a string (`"0.3"`), but MUST treat it as an exact version identifier (not a range).

If `calcdown` is missing, implementations MAY assume the latest supported `0.x` version, but SHOULD emit a warning.

## 3) Blocks

CalcDown 0.3 defines the following block types (by code-fence language tag):

- `inputs` — typed parameters
- `data` — inline typed tables (small datasets)
- `calc` — computed nodes (CalcScript 0.3; a safe TS/JS-like subset)
- `view` — declarative views (charts, cards, tables)

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

**Header keys (0.3):**

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

### 3.3 `calc` block (CalcScript 0.3)

CalcScript is a **TypeScript/JavaScript-like** language that is **not executed directly**. An engine parses it, validates it, and evaluates it in a sandbox.

In CalcDown 0.3, a `calc` block is a sequence of top-level `const` declarations:

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

**CalcScript 0.3 expression subset (normative):**

- Literals: numbers, strings, booleans
- Identifiers: `foo`, `bar_baz`
- Unary: `-x`
- Binary: `+ - * / **` (with standard precedence; `**` is right-associative)
- Member access: `a.b`
- Calls: `f(x, y)` (calls MUST have a callee that is a member path rooted at `std`, e.g. `std.finance.pmt(...)`)
- Object literals: `{ a: 1, b, "c": 3 }` (shorthand allowed for identifiers)
- Arrow functions (expression-bodied only): `(x, i) => x + i` or `x => x + 1`

Everything else is out of scope for 0.3 (loops, assignments, `new`, `this`, dynamic property access, `import`, etc.).

### 3.4 `view` block

Views are declarative and MUST be derivable from existing nodes/tables.

A `view` block MUST be either:

- A single view object (JSON object or YAML mapping), or
- A list of view objects (JSON array or YAML sequence)

Engines MUST accept JSON. Engines SHOULD accept YAML as a convenience. Documents intended for maximum portability SHOULD prefer JSON.

At minimum, every view object MUST include:

- `id` (string): unique within the document
- `type` (string): view type (e.g. `cards`, `table`, `chart`)
- `library` (string): the view “dialect” (e.g. `calcdown`, `vega-lite`)
- `spec` (object): view-type/library-specific configuration

Views MAY include additional top-level fields. CalcDown 0.3 standardizes `source` for table-backed views:

- `source` (string, optional): the name of a table node (a `data` table or a computed table-like node).

#### 3.4.1 Standard view types (recommended)

CalcDown intends “views” to be a stable, declarative contract between the model and any UI.

##### Cards (`type: "cards"`, `library: "calcdown"`)

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

##### Table (`type: "table"`, `library: "calcdown"`)

Tables provide a standardized way to render tabular results (including `data` inputs and computed table-like nodes).

Example:

```json
{
  "id": "lines",
  "type": "table",
  "library": "calcdown",
  "source": "lines",
  "spec": {
    "title": "Line items",
    "editable": false,
    "columns": [
      { "key": "name", "label": "Name" },
      { "key": "qty", "label": "Qty", "format": "integer" },
      { "key": "unit_price", "label": "Unit price", "format": { "kind": "number", "digits": 2 } },
      { "key": "line_total", "label": "Total", "format": { "kind": "number", "digits": 2 } }
    ]
  }
}
```

Required fields:

- `source` (string, required): a table node name

`table.spec` keys:

- `title` (string, optional)
- `editable` (boolean, optional; default `false`): UIs MAY allow editing if `source` refers to a `data` table.
- `columns` (array, optional): list of column definitions:
  - `key` (string, required): column key in each row object
  - `label` (string, optional)
  - `format` (optional): same as cards item format

##### Chart (`type: "chart"`, `library: "calcdown"`)

Charts are a standardized wrapper plus a small, CalcDown-native chart spec.

Required fields:

- `source` (string, required): a table node name

`chart.spec` keys (0.3):

- `title` (string, optional)
- `kind` (string, required): `"line"` or `"bar"`
- `x` (object, required): `{ key: string, label?: string, format?: ... }`
- `y` (object, required): `{ key: string, label?: string, format?: ... }`

Implementations MAY also support library-specific charts (e.g. `library: "vega-lite"`), but portable documents SHOULD prefer `library: "calcdown"` charts.

## 4) Types (0.3)

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

### 4.1 Type Coercion and Validation Rules

CalcDown is designed to be permissive at **UI boundaries** (text fields, form inputs) while remaining strict and deterministic at execution time.

Rules (0.3):

- **Numeric → `integer`**: when an `integer` value is required and a finite number is provided, engines SHOULD coerce using truncation toward zero (equivalent to JavaScript `Math.trunc`). Non-finite values MUST error.
- **String → `date`**: engines MUST accept ISO `YYYY-MM-DD` only, and MUST reject other formats unless explicitly documented by the engine.
- **`decimal` precision**: engines MUST NOT round arithmetic results unless explicitly requested; engines SHOULD preserve at least 10 decimal digits of precision where representable.
- **`currency(ISO4217)` arithmetic**: engines MUST NOT perform automatic currency conversion. If currency codes are tracked, engines SHOULD error on cross-currency arithmetic.

## 5) Error model

Engines MUST surface model errors as user-visible messages.

### 5.1 Required errors

At minimum, engines MUST be able to report:

- **Undefined identifier** (referencing an input/node/table name that does not exist)
- **Type mismatch** (e.g. numeric operator applied to non-numbers)
- **Division by zero**
- **Cycle detected** in calc nodes (or unresolved dependencies)

### 5.2 Propagation

- Errors in one node MUST NOT halt evaluation of the entire document.
- A node that errors MUST be treated as “errored” for the remainder of the evaluation.
- Downstream nodes that depend on an errored node SHOULD become errored (and SHOULD expose a message that points to the upstream failure).

### 5.3 Messages

- Messages SHOULD include stable, human-readable strings.
- When available, engines SHOULD attach line/node metadata for diagnostics in UIs.

## 6) Execution model

- The document defines a dependency graph of nodes: inputs, data tables, computed nodes, views.
- Engines evaluate nodes in topological order.
- On change, engines SHOULD re-evaluate only affected downstream nodes (reactive updates).

### 6.1 Reactive semantics (minimal)

CalcDown is intended to feel reactive like a spreadsheet, but minimal engines MAY recompute the whole program on change.

At minimum:

- **Input change** SHOULD invalidate and recompute only affected downstream nodes.
- **Table mutation** (row add/edit/delete) SHOULD invalidate nodes that read that table.

## 7) Safety model

CalcDown execution MUST be deterministic by default:

- No access to `window`, `document`, `globalThis`, `fetch`, storage APIs, or timers.
- No dynamic code evaluation (`eval`, `Function`, `import()`).
- No nondeterminism (time/random) unless explicitly provided as an input.

The only ambient global is `std`, plus the named inputs/nodes defined by the document.

Engines SHOULD defensively block prototype-pollution surfaces (e.g. disallow `__proto__`, `constructor`, `prototype` in user-authored member access and object keys).

## 8) Canonical formatting (for Git)

Implementations SHOULD provide `calcdown fmt` that:

- Normalizes whitespace and line endings
- Normalizes `inputs` lines (spacing and comments) without changing meaning
- Validates `data` header + JSONL rows (and optionally sorts rows by primary key)
- Produces stable output so semantic changes create small diffs

This repo includes an initial, minimal formatter used for examples:

- `make fmt` runs `tools/fmt_calcdown.js` to normalize `docs/examples/*.calc.md`.
- v1 formatting focuses on `inputs` alignment, `data` header key order (`name`, `primaryKey`, `columns`), and pretty-printing `view` blocks.

## Appendix A) CalcScript 0.3 grammar (informative)

This grammar describes the 0.3 expression subset:

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

## Appendix B) Changes from 0.2 → 0.3

- Allows a `view` block to contain a list of view objects (JSON array / YAML sequence).
- Standardizes a CalcDown-native chart spec (`type: "chart"`, `library: "calcdown"`).
- Extends the standardized `table` view with `spec.editable` for input tables.
