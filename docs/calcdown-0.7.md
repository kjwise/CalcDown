# CalcDown 0.7 (Draft Specification)

Status: **Draft / experimental**. CalcDown is a text-first, Git-friendly format for “spreadsheet-like” models: typed inputs and data, a deterministic compute graph, and declarative views.

This document specifies **CalcDown 0.7** (the file format, project files, execution model, and expected tooling). The companion standard library is specified in `docs/stdlib-0.7.md`.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

Terms used in this spec:

- **Document**: a single CalcDown Markdown file (recommended extension: `.calc.md`).
- **Project**: a set of documents loaded together (via `include` and/or a manifest).
- **Manifest**: a JSON project file (`calcdown.json`) that declares the entry document and optional includes.
- **Lockfile**: a JSON file (`calcdown.lock.json`) that pins document and external data hashes for reproducibility.
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

## 2) Files

CalcDown 0.7 defines:

- **Documents** (`.calc.md`) — the primary authoring format (§2.1)
- An optional **manifest** (`calcdown.json`) — project composition (§2.3)
- An optional **lockfile** (`calcdown.lock.json`) — reproducibility (§2.4)

### 2.1 Document format

A CalcDown document is a UTF‑8 Markdown file (recommended extension: `.calc.md`) containing:

- Optional YAML front matter (`--- ... ---`)
- Markdown narrative
- Fenced code blocks that define executable/model content

### 2.2 Front matter

If present, front matter MUST be YAML and SHOULD include:

- `calcdown`: the spec version (`0.7`)
- `title`: a human-readable title (optional)

Front matter MAY include UI hints (non-normative, but recommended):

- `results`: a comma-separated list of node names to display by default (e.g. `results: total, net_profit`)

Front matter MAY include project composition:

- `include`: additional `.calc.md` files (relative paths) to load as part of the project.

`include` rules (0.7):

- Implementations MUST accept `include` as either:
  - a comma-separated string, or
  - a YAML sequence of strings.
- Included paths MUST be resolved relative to the document containing the `include`.
- Implementations MUST load included documents in the listed order.
- Implementations MUST treat the resulting **project** as a single namespace (§3.1).

Version rules:

- Implementations SHOULD accept `calcdown` as either a YAML number (`0.7`) or a string (`"0.7"`), but MUST treat it as an exact version identifier (not a range).
- If `calcdown` is missing, implementations MAY assume the latest supported `0.x` version, but SHOULD emit a warning.

### 2.3 Project manifest (`calcdown.json`)

CalcDown 0.7 standardizes an optional manifest file to describe a multi-document project without relying solely on per-document front matter.

The manifest MUST be JSON and MUST be a single JSON object.

CalcDown ships a JSON Schema for the manifest:

- `schemas/calcdown-manifest-0.7.schema.json`

Required keys:

- `entry` (string, required): path to the entry `.calc.md` document.

Optional keys:

- `calcdown` (string|number, optional): the spec version (recommended `"0.7"`).
- `include` (string|array, optional): additional `.calc.md` documents to load:
  - if a string, it is treated as a comma-separated list
  - if an array, it MUST be an array of strings
- `lock` (string, optional): path to a lockfile to check during validation and export.
- `results` (string, optional): UI hint equivalent to document front matter `results`.

Path resolution rules:

- `entry`, `include[]`, and `lock` MUST be resolved relative to the manifest file location.

Project loading rules:

- When a manifest is used, implementations MUST load `entry` first, then recursively load `include` from document front matter (§2.2), then load any manifest-level `include` documents.
- Duplicate document loads MUST be de-duplicated by absolute path.
- If `lock` is present and the project is loaded via the manifest, implementations MUST treat it as the default lockfile for `calcdown validate` and `calcdown export` (unless an explicit `--lock` is provided).

### 2.4 Lockfile (`calcdown.lock.json`)

CalcDown 0.7 standardizes an optional lockfile to support reproducible review and CI checks.

The lockfile MUST be JSON and MUST be a single JSON object.

CalcDown ships a JSON Schema for the lockfile:

- `schemas/calcdown-lock-0.7.schema.json`

Required keys:

- `calcdown` (string, required): `"0.7"` (lockfile schema version).
- `entry` (string, required): the resolved entry document path (project-relative or absolute).
- `documents` (array, required): pinned document content hashes.

`documents[]` entry shape:

- `path` (string, required): project-relative or absolute path to a `.calc.md` document.
- `sha256` (string, required): lower-case 64-hex SHA-256 of the document UTF‑8 bytes.

Optional keys:

- `manifest` (string, optional): project-relative or absolute path to the manifest file.
- `dataSources` (array, optional): pinned external data content hashes.

`dataSources[]` entry shape:

- `table` (string, required): the table name in the CalcDown project.
- `source` (string, required): resolved source identifier (URL or project-relative/absolute file path).
- `format` (string, required): `csv` or `json`.
- `declaredHash` (string, required): the hash string declared in the document (`sha256:<hex>`).
- `sha256` (string, required): lower-case 64-hex SHA-256 of the external data UTF‑8 bytes.

Lock semantics:

- `calcdown lock` SHOULD produce deterministic output (stable ordering, no timestamps).
- `calcdown validate --lock <file>` MUST fail if:
  - any `documents[]` hash mismatches, or
  - any project document is not present in `documents[]`, or
  - any referenced `dataSources[]` hash mismatches, or
  - any project data source is not present in `dataSources[]` (when `dataSources` is present).

## 3) Blocks

CalcDown 0.7 defines the following block types (by code-fence language tag):

- `inputs` — typed parameters
- `data` — tables (inline JSONL or external CSV/JSON sources)
- `calc` — computed nodes (CalcScript subset; see §4)
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

#### 3.3.1 Header keys (0.7)

Required:

- `name` (string, required): table name
- `primaryKey` (string, required): column name used as stable row identity
- `columns` (map, required): `columnName: type`

Optional (external sources):

- `source` (string, optional): a relative path or URL to load data from
- `format` (string, optional): `"csv"` or `"json"` (if omitted, engines MAY infer from `source` extension)
- `hash` (string, optional): content hash of the external data, in the form `sha256:<hex>`

Optional (ordering):

- `sortBy` (string, optional): a column name used to order rows deterministically after loading.

Rules:

- If `sortBy` is present, engines MUST order the in-memory row array by that column before evaluating dependent nodes.
- Sorting MUST be stable (ties preserve prior order).
- Missing values (`null`/`undefined`) MUST sort last.

Availability to `calc`:

- A `data` table MUST be available in `calc` expressions by its `name` identifier.
- Engines SHOULD provide a row-oriented view equivalent to `Array<Record<string, unknown>>` (one object per row).

#### 3.3.2 Inline rows (JSONL)

If `source` is not present, the rows section MUST be JSONL.

Rules:

- Each JSONL line MUST be a JSON object.
- Each row object MUST include the `primaryKey` field.
- Primary keys MUST be unique within the table and SHOULD be stable across edits.

#### 3.3.3 External sources (CSV / JSON)

If `source` is present, the rows section MUST be empty (blank lines and comments MAY be present).

Rules:

- When `source` is present, `hash` MUST also be present.
- Engines MUST load `source`, verify `hash`, then parse and coerce rows according to `columns`.
- Engines MUST enforce `primaryKey` presence and uniqueness after loading.

Hash rules (0.7):

- `sha256:<hex>` is computed over the raw UTF‑8 bytes of the external file content.

## 4) `calc` block (CalcScript subset)

`calc` blocks define computed nodes using a safe, deterministic expression subset (“CalcScript”).

Each top-level declaration has the form:

```ts
const <name> = <expr>;
```

Rules:

- Only `const` declarations are defined.
- Declarations MUST end with `;` (semicolon).
- Engines MUST compute nodes as a DAG (topologically sorted).
- The only ambient global identifier is `std` (the standard library).
- Calls MUST have a callee that is a member path rooted at `std` (e.g. `std.finance.pmt(...)`).

CalcScript expressions (0.7) support:

- Literals: numbers, strings, booleans
- Identifiers
- Object literals (`{ a: 1, b }`)
- Arrow functions (`(x) => x + 1`) for use as arguments to `std.*` APIs
- Member access (`obj.key`) and calls (`std.math.sum(xs)`), subject to the safety rules above
- Operators:
  - Unary `-` (numeric; scalar or array)
  - Binary numeric: `+`, `-`, `*`, `/`, `**` (numeric; scalar/array broadcasting)
  - Binary text: `&` (deterministic concatenation; scalar/array broadcasting)

Operator precedence (highest → lowest):

1. `**`
2. unary `-`
3. `*` `/`
4. `+` `-`
5. `&`

Vectorization rules (0.7):

- Unary `-` MUST apply element-wise when its operand is an array.
- For binary numeric operators (`+`, `-`, `*`, `/`, `**`):
  - scalar ⨯ scalar → scalar
  - array ⨯ array → array (element-wise; length mismatch is an error)
  - array ⨯ scalar → array (broadcast scalar)
  - scalar ⨯ array → array (broadcast scalar)
- Numeric operators MUST throw if any operand (scalar or array element) is not a finite number.
- Division by zero MUST be an error.

Column projection (0.7):

- For member access `obj.key`, if `obj` evaluates to an array and `key` is not an own-property on that array:
  - If `key` is a standard `Array.prototype` property, access MUST fail (to preserve the safety model).
  - Otherwise, the result MUST be an array obtained by projecting `key` from each element.
  - Projection MUST fail if any element is not an object or does not have `key` as an own-property.

`&` rules (0.7):

- Operands MUST be either:
  - a `string`
  - a finite `number`
  - an array of `string | finite number`
- If either operand is an array, then the other operand MUST be either a scalar (broadcast) or an array of the same length.

## 5) `view` block (standardized views)

Views are declarative and MUST be derivable from existing nodes/tables.

A `view` block MUST be either:

- A single view object (JSON object or YAML mapping), or
- A list of view objects (JSON array or YAML sequence)

Engines MUST accept JSON. Engines SHOULD accept YAML as a convenience. Documents intended for maximum portability SHOULD prefer JSON.

### 5.1 CalcDown view contract (`library: "calcdown"`)

CalcDown 0.7 standardizes view types under `library: "calcdown"`:

- `cards` — standardized results pane
- `table` — standardized tabular renderer (optionally editable)
- `chart` — standardized chart wrapper (small chart spec)
- `layout` — standardized composition of other views

Engines MUST validate `library: "calcdown"` views and MUST apply defaults where specified.

CalcDown ships JSON Schemas for these views:

- `schemas/calcdown-view-0.7.schema.json`
- `schemas/calcdown-view-cards-0.7.schema.json`
- `schemas/calcdown-view-table-0.7.schema.json`
- `schemas/calcdown-view-chart-0.7.schema.json`
- `schemas/calcdown-view-layout-0.7.schema.json`

## 6) Types (0.7)

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

## 7) Execution model

- The project defines a dependency graph of nodes: inputs, data tables, computed nodes, views.
- Engines evaluate nodes in topological order.
- On change, engines SHOULD re-evaluate only affected downstream nodes (reactive updates).
- Engines SHOULD evaluate with a deterministic “current datetime” per evaluation session (used by `std.date.now()` and `std.date.today()`).

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

Implementations MAY accept `--strict` to treat warnings as errors (non-zero exit status).

If `--lock <path>` is provided, `calcdown validate` MUST also enforce lock semantics (§2.4).

If `--lock` is not provided and the project is loaded via a manifest with `lock`, `calcdown validate` MUST enforce that lockfile.

Implementations MAY accept a runtime clock override for `std.date.now()` / `std.date.today()` (for example: `--date YYYY-MM-DD` or `--datetime ISO`).

### 8.3 `calcdown lock`

Implementations SHOULD provide `calcdown lock` that:

- Loads a project (document or manifest)
- Computes SHA‑256 hashes of all project documents
- Loads external data sources and records their SHA‑256 hashes
- Writes a deterministic lockfile (`calcdown.lock.json` by default)

### 8.4 `calcdown fmt` (canonical formatting)

Implementations SHOULD provide `calcdown fmt` that:

- Normalizes whitespace and line endings
- Normalizes `inputs` lines (spacing and comments) without changing meaning
- Normalizes `data` headers and rows without changing meaning
  - Inline JSONL rows SHOULD be ordered deterministically by `primaryKey`
  - Inline JSON objects SHOULD be serialized with stable key ordering
- Pretty-prints `view` blocks deterministically (stable key ordering)

Implementations MAY accept `--check` to fail if formatting would change any files (without writing changes).

### 8.5 `calcdown diff` (semantic diff)

Implementations SHOULD provide `calcdown diff` that compares two versions of a project and reports semantic changes:

- Inputs added/removed/changed
- Tables (schema + source metadata) added/removed/changed
- Table rows added/removed/changed by `primaryKey` when row data is available
- Nodes added/removed/changed (by expression text)
- Views added/removed/changed (by validated view object)

### 8.6 `calcdown export` (materialized output)

Implementations SHOULD provide `calcdown export` that materializes a project into a single JSON output containing:

- The resolved document list
- Evaluated `values` (`inputs`, `tables`, `nodes`)
- Validated CalcDown views
- Messages (errors/warnings)

CalcDown ships a JSON Schema for the export output:

- `schemas/calcdown-export-0.7.schema.json`

If `--lock <path>` is provided, `calcdown export` MUST enforce lock semantics (§2.4). If the project is loaded via a manifest with `lock` and `--lock` is not provided, `calcdown export` MUST enforce that lockfile.

Implementations MAY accept `--strict` to treat warnings as errors (non-zero exit status).

Implementations MAY accept a runtime clock override for `std.date.now()` / `std.date.today()` (for example: `--date YYYY-MM-DD` or `--datetime ISO`).

### 8.7 Deterministic conformance (recommended)

Implementations SHOULD provide deterministic, machine-readable outputs for `validate` and `export`, enabling golden-file conformance checks in CI (for example: “run validate/export on a fixed set of projects and compare JSON output byte-for-byte”).

## 9) Safety model (0.7)

CalcDown execution MUST be deterministic by default:

- No access to `window`, `document`, `globalThis`, `fetch`, storage APIs, or timers (unless explicitly implemented by the host).
- No dynamic code evaluation (`eval`, `Function`, `import()`).
- No nondeterminism (time/random) unless explicitly provided as an input or by the host as part of the evaluation context.

Prototype-pollution defenses:

- Engines MUST defensively block `__proto__`, `constructor`, and `prototype` in user-authored member access and object keys.
- Engines SHOULD apply similar defenses when parsing YAML view blocks (reject or sanitize unsafe keys).

## Appendix A) Changes from 0.6 → 0.7

- Adds `data.sortBy` (deterministic runtime row ordering).
- Adds CalcScript array column projection (`items.qty`) and numeric operator vectorization.
- 0.7 otherwise refines and clarifies the 0.x spec and tooling expectations.
