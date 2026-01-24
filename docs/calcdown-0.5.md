# CalcDown 0.5 (Draft Specification)

Status: **Draft / experimental**. CalcDown is a text-first, Git-friendly format for “spreadsheet-like” models: typed inputs and data, a deterministic compute graph, and declarative views.

This document specifies **CalcDown 0.5** (the file format and execution model). The companion standard library is specified in `docs/stdlib-0.5.md`.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

Terms used in this spec:

- **Document**: a single CalcDown Markdown file (recommended extension: `.calc.md`).
- **Project**: a set of documents loaded together (via `include`).
- **Block**: a fenced code block with a recognized language tag (`inputs`, `data`, `calc`, `view`).
- **Input**: a named, typed scalar value provided by the user/environment.
- **Table**: a set of typed rows, addressed by stable row identity (via `primaryKey`).
- **Node**: a named computed value defined in `calc` (scalar, column, or table-like).
- **View**: a declarative description of how to present existing values (cards, tables, charts, layout).

## 1) Design goals

- **Text is the source of truth:** the semantic model is stored as plain text; UIs are projections.
- **AI- and Git-friendly:** named nodes/tables, stable identifiers, small diffs.
- **Reactive by default:** computations form a dependency graph (DAG), re-evaluated incrementally.
- **Deterministic execution:** no ambient I/O, time, or randomness unless explicitly provided as inputs.
- **Browser-first:** intended to run locally in a browser with a safe expression language.

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

- `calcdown`: the spec version (`0.5`)
- `title`: a human-readable title (optional)

Front matter MAY include UI hints (non-normative, but recommended):

- `results`: a comma-separated list of node names to display by default (e.g. `results: total, net_profit`)

Front matter MAY include project composition:

- `include`: a comma-separated list of additional `.calc.md` files (relative paths) to load as part of the project.

Rules:

- Implementations SHOULD accept `calcdown` as either a YAML number (`0.5`) or a string (`"0.5"`), but MUST treat it as an exact version identifier (not a range).
- If `calcdown` is missing, implementations MAY assume the latest supported `0.x` version, but SHOULD emit a warning.
- If `include` is present, implementations MUST load included documents in the listed order and treat the resulting **project** as a single namespace (§3.1).

## 3) Blocks

CalcDown 0.5 defines the following block types (by code-fence language tag):

- `inputs` — typed parameters
- `data` — tables (inline JSONL or external CSV/JSON sources)
- `calc` — computed nodes (CalcScript 0.5; a safe expression subset)
- `view` — declarative views (cards, tables, charts, layout)

Documents MAY contain multiple blocks of the same type. Semantically, blocks are concatenated by type (e.g. all `inputs` blocks contribute to the input namespace).

### 3.1 Naming and namespaces (project-wide)

All identifiers share a single namespace across the project:

- input names
- data table names
- calc node names

Rules:

- Names MUST match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Names MUST be unique across the entire project (no overlaps between inputs/tables/nodes).
- The identifier `std` is reserved and MUST NOT be used as an input/table/node name.

### 3.2 `inputs` block

Defines named, typed scalar values.

**Syntax (one per line):**

```
<name> : <type> = <default> [# comment]
```

Rules:

- Input defaults MUST be parseable as the declared type.
- Implementations SHOULD expose inputs as UI controls (field/slider/date picker).

### 3.3 `data` block (tables)

`data` blocks declare a single table with:

- A YAML header (schema + options)
- A `---` separator line
- One of:
  - Inline JSON Lines (JSONL), one row per line (diff-friendly), or
  - An external source reference (CSV/JSON) with a content hash (diff-friendly “big data” story)

#### 3.3.1 Header keys (0.5)

Required:

- `name` (string, required): table name
- `primaryKey` (string, required): column name used as stable row identity
- `columns` (map, required): `columnName: type`

Optional (external sources):

- `source` (string, optional): a relative path or URL to load data from
- `format` (string, optional): `"csv"` or `"json"` (if omitted, engines MAY infer from `source` extension)
- `hash` (string, optional): content hash of the external data, in the form `sha256:<hex>`

Header rules:

- Headers MUST be expressible as a YAML mapping using only scalars plus the `columns:` mapping.
- Tabs SHOULD NOT be used for indentation (spaces only).
- Implementations MAY ignore unknown header keys, but SHOULD emit a warning.

Availability to `calc`:

- A `data` table MUST be available in `calc` expressions by its `name` identifier.
- Engines SHOULD provide a row-oriented view equivalent to `Array<Record<string, unknown>>` (one object per row).

#### 3.3.2 Inline rows (JSONL)

If `source` is not present, the rows section MUST be JSONL.

Rules:

- Each JSONL line MUST be a JSON object.
- Each row object MUST include the `primaryKey` field.
- Primary keys MUST be unique within the table and SHOULD be stable across edits.

Example (outer fence uses 4 backticks to safely nest Markdown fences):

````md
```data
name: items
primaryKey: id
columns:
  id: string
  name: string
  qty: integer
  unit_price: number
---
{"id":"i1","name":"Coffee beans","qty":2,"unit_price":18.50}
{"id":"i2","name":"Milk","qty":1,"unit_price":2.25}
```
````

#### 3.3.3 External sources (CSV / JSON)

If `source` is present, the rows section MUST be empty (blank lines and comments MAY be present).

Rules:

- When `source` is present, `hash` MUST also be present.
- Engines MUST load `source`, verify `hash`, then parse and coerce rows according to `columns`.
- Engines MUST enforce `primaryKey` presence and uniqueness after loading.

CSV rules (0.5):

- CSV MUST include a header row naming columns.
- Engines MUST match CSV columns to declared `columns` by name.
- Engines MUST error on missing declared columns (extra columns MAY be ignored or preserved as untyped fields).

JSON rules (0.5):

- JSON MUST be either:
  - a JSON array of objects (`[{...}, {...}]`), or
  - JSON Lines (one object per line)

Hash rules (0.5):

- `sha256:<hex>` is computed over the raw UTF‑8 bytes of the external file content.

## 4) `calc` block (CalcScript 0.5)

`calc` blocks define computed nodes using **CalcScript 0.5**, a safe expression subset.

Each top-level declaration has the form:

```ts
const <name> = <expr>;
```

Rules:

- Only `const` declarations are defined in CalcScript 0.5.
- Declarations MUST end with `;` (semicolon).
- Engines MUST compute nodes as a DAG (topologically sorted).
- The only ambient global identifier is `std` (the standard library).
- Calls MUST have a callee that is a member path rooted at `std` (e.g. `std.finance.pmt(...)`).

### 4.1 Expression subset (normative)

CalcScript 0.5 expressions MUST be limited to:

- Literals: numbers, strings, booleans
- Identifiers: `foo`, `bar_baz`
- Unary: `-x`
- Binary: `+ - * / **` (with standard precedence; `**` is right-associative)
- Member access: `a.b`
- Calls: `f(x, y)` (calls MUST have a callee rooted at `std`)
- Object literals: `{ a: 1, b, "c": 3 }` (shorthand allowed for identifiers)
- Arrow functions (expression-bodied only): `(x, i) => x + i` or `x => x + 1`

Everything else is out of scope for 0.5 (loops, assignments, `new`, `this`, dynamic property access, `import`, etc.).

### 4.2 Numeric edge rules (0.5)

For deterministic behavior:

- All numeric operators (`+ - * / **` and unary `-`) MUST require **finite** numbers.
- Division by zero MUST error.
- Engines MUST treat any operation that would produce `NaN`, `Infinity`, or `-Infinity` as an error.

### 4.3 Member access safety (0.5)

Member access MUST be safe and deterministic:

- Engines MUST reject member access to `__proto__`, `prototype`, and `constructor`.
- Engines MUST NOT traverse the prototype chain: member access MUST resolve only **own** properties.

## 5) `view` block (standardized views)

Views are declarative and MUST be derivable from existing nodes/tables.

A `view` block MUST be either:

- A single view object (JSON object or YAML mapping), or
- A list of view objects (JSON array or YAML sequence)

Engines MUST accept JSON. Engines SHOULD accept YAML as a convenience. Documents intended for maximum portability SHOULD prefer JSON.

### 5.1 View object base shape (0.5)

Every view object MUST include:

- `id` (string): unique within the project
- `type` (string): view type (`cards`, `table`, `chart`, `layout`)
- `spec` (object): view-type-specific configuration

Every view object SHOULD include:

- `library` (string): view “dialect”

Defaults:

- If `library` is missing, engines MUST default it to `"calcdown"`.

### 5.2 CalcDown view contract (`library: "calcdown"`)

CalcDown 0.5 standardizes view types under `library: "calcdown"`:

- `cards` — standardized results pane
- `table` — standardized tabular renderer (optionally editable)
- `chart` — standardized chart wrapper (small chart spec)
- `layout` — standardized composition of other views

Engines MUST validate `library: "calcdown"` views and MUST apply defaults where specified.

CalcDown ships JSON Schemas for these views:

- `schemas/calcdown-view-0.5.schema.json`
- `schemas/calcdown-view-cards-0.5.schema.json`
- `schemas/calcdown-view-table-0.5.schema.json`
- `schemas/calcdown-view-chart-0.5.schema.json`
- `schemas/calcdown-view-layout-0.5.schema.json`

Engines SHOULD expose view validation errors as user-visible messages (§8).

#### 5.2.1 Cards (`type: "cards"`)

Cards show a list of scalar node values.

`cards.spec` keys (0.5):

- `title` (string, optional)
- `items` (array, required): a list of card items

Each `items[]` entry:

- `key` (string, required): node name to display
- `label` (string, optional): display label (default: `key`)
- `format` (optional): either a string (`number|integer|percent|date`) or an object with:
  - `kind` (string, required)
  - `digits` (number, optional)
  - `currency` (string, optional; required when `kind: "currency"`)

#### 5.2.2 Table (`type: "table"`)

Tables render row arrays (tables) from `source`.

Required fields:

- `source` (string, required): the name of a table node

`table.spec` keys (0.5):

- `title` (string, optional)
- `columns` (array, optional): column definitions `{ key, label?, format? }`
- `editable` (boolean, optional, default `false`): if true and `source` is a `data` table, UIs MAY allow editing
- `limit` (integer, optional, default implementation-defined): maximum rows to render

Defaults:

- If `columns` is missing, engines SHOULD default to the table schema order (when available).

#### 5.2.3 Chart (`type: "chart"`)

Charts render a small, CalcDown-native chart spec from a table `source`.

Required fields:

- `source` (string, required): the name of a table node

`chart.spec` keys (0.5):

- `title` (string, optional)
- `kind` (string, required): `"line"` or `"bar"` (engines MAY also accept `"column"` as an alias of `"bar"`)
- `x` (object, required): `{ key: string, label?: string, format?: ... }`
- `y` (object, required): `{ key: string, label?: string, format?: ... }`

#### 5.2.4 Layout (`type: "layout"`)

Layout composes other views by referencing their `id`s.

`layout.spec` keys (0.5):

- `title` (string, optional)
- `direction` (string, optional, default `"column"`): `"row"` or `"column"`
- `items` (array, required): list of layout items

Each `items[]` entry MUST be one of:

- `{ "ref": "<viewId>" }` (reference a view by id), or
- a nested layout object (same shape as a top-level `layout` view, without requiring a unique `id`)

## 6) Types (0.5)

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

Date semantics (recommended):

- Engines SHOULD treat `date` values as UTC midnight timestamps internally.
- Engines SHOULD format `date` values back to ISO `YYYY-MM-DD` for display/serialization.

## 7) Execution model

- The project defines a dependency graph of nodes: inputs, data tables, computed nodes, views.
- Engines evaluate nodes in topological order.
- On change, engines SHOULD re-evaluate only affected downstream nodes (reactive updates).

External data sources (§3.3.3) MUST be loaded and validated before evaluating dependent nodes.

## 8) Error model and tooling

### 8.1 Messages

Engines MUST surface model errors as user-visible messages. Messages SHOULD include:

- `severity` (`error|warning`)
- `code` (string, stable error code)
- `message` (string)
- `file` (string, optional; for multi-file projects)
- `line` (1-based, optional)
- `column` (1-based, optional)
- `blockLang` (optional)
- `nodeName` (optional)

### 8.2 `calcdown validate`

Implementations SHOULD provide `calcdown validate` that:

- Parses a document/project
- Loads external data sources (verifies hashes)
- Validates schemas, node graph, and views
- Outputs messages with stable codes and locations

### 8.3 `calcdown fmt` (canonical formatting)

Implementations SHOULD provide `calcdown fmt` that:

- Normalizes whitespace and line endings
- Normalizes `inputs` lines (spacing and comments) without changing meaning
- Normalizes `data` headers and rows without changing meaning
- Pretty-prints `view` blocks deterministically (stable key ordering)

### 8.4 `calcdown diff` (semantic diff)

Implementations SHOULD provide `calcdown diff` that compares two versions of a document/project and reports semantic changes:

- Inputs added/removed/changed
- Tables (schema + source metadata) added/removed/changed
- Nodes added/removed/changed (by expression text)
- Views added/removed/changed (by validated view object)

## 9) Safety model (0.5)

CalcDown execution MUST be deterministic by default:

- No access to `window`, `document`, `globalThis`, `fetch`, storage APIs, or timers.
- No dynamic code evaluation (`eval`, `Function`, `import()`).
- No nondeterminism (time/random) unless explicitly provided as an input.

Prototype-pollution defenses:

- Engines MUST defensively block `__proto__`, `constructor`, and `prototype` in user-authored member access and object keys.
- Engines SHOULD apply similar defenses when parsing YAML view blocks (reject or sanitize unsafe keys).

## Appendix A) CalcScript 0.5 grammar (informative)

This grammar describes the 0.5 expression subset:

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

## Appendix B) Changes from 0.4 → 0.5

- Adds project composition via front matter `include`.
- Adds external table sources (`data` header `source` + `hash`) for CSV/JSON.
- Standardizes `library: "calcdown"` view types into an explicit contract, with JSON Schemas and required defaults.
- Tightens CalcScript safety: numeric operators require finite numbers; member access is own-properties only (no prototype traversal).
- Introduces expected tooling surface: `calcdown validate`, `calcdown fmt`, `calcdown diff`.

