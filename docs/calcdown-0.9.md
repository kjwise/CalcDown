# CalcDown 0.9 (Draft Specification)

Status: **Draft / experimental**. CalcDown is a text-first, Git-friendly format for “spreadsheet-like” models: typed inputs and data, a deterministic compute graph, and declarative views.

This document specifies **CalcDown 0.9**, focusing on **tooling and integration contracts** and the **Editor Protocol**: how tools map runtime objects back to source text and apply safe, minimal patches. The execution model, blocks, views, and standard library are unchanged from 0.7 unless stated otherwise. CalcScript expressions additionally support comparison/equality operators, boolean operators (`&&`, `||`, `!`), and the conditional operator (`?:`). Calc blocks MAY also include optional **table patch statements** (experimental; see §0.9 additions (calc patches)).

The companion standard library is specified in `docs/stdlib-0.9.md`.

## 0.9 additions (views)

CalcDown 0.9 extends the standardized `chart` view to support **multiple plotted series**.

For `library: "calcdown"` charts:

- `chart.spec.x` is unchanged (one axis spec object).
- `chart.spec.y` MAY be either:
  - a single axis spec object (legacy), or
  - an array of axis spec objects, where each entry is plotted as a separate series.

CalcDown 0.9 also standardizes a small ergonomic default:

- If a view spec object has a `key` and omits `label`, engines SHOULD default `label` to a humanized Title Case form of the key when the key is snake_case or kebab-case (e.g. `foo_bar` → `Foo Bar`).

## 0.9 additions (calc patches, experimental)

CalcDown 0.7 defines `calc` blocks as pure `const <name> = <expr>;` declarations evaluated as a DAG (see CalcDown 0.7 §4).

CalcDown 0.9 adds an optional convenience: engines MAY recognize **table patch statements** inside `calc` blocks to update inline `data` tables (typically used as “output templates”).

**Syntax:**

````md
``` calc
table["<primaryKey>"].<column> = <expr>;
```
````

Rules:

- Patch targets MUST be inline `data` tables (no `source`).
- Patch selectors SHOULD use `primaryKey` string literals. Engines MAY also support 1-based row indices (`table[1].col = ...;`) but SHOULD warn because canonical formatting may reorder rows.
- `<column>` MUST be a declared column and MUST NOT be the table’s `primaryKey`.
- Patch `<expr>` MUST be a CalcScript expression.
- Patches MUST be applied after evaluating `const` calc nodes. Patched table values MUST be visible to views and to subsequent patch statements in the same run.
- Patches MUST NOT affect the evaluation of `const` calc nodes.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

Line numbers in this spec are **1-based** (consistent with CalcDown messages).

### 0.1 Fenced code blocks (CalcDown documents)

In CalcDown documents (`.calc.md`), fenced code blocks are reserved for CalcDown blocks.

- The fence info string’s first token MUST be one of: `inputs`, `data`, `calc`, `view`.
- Fenced code blocks with a missing or unknown language tag MUST be treated as an error by validators.

Rationale: `.calc.md` is a modeling document. Allowing arbitrary fenced code blocks makes tooling ambiguous (parsing, formatting, source mapping). Use prose and inline code (`` `...` ``) for literal snippets.

## 1) Design goal: “Read → Edit → Write”

CalcDown 0.7 validates and evaluates a project (“Read → Eval → Print”).

CalcDown 0.8 added the missing half required for spreadsheet-like authoring:

- Render a grid/UI from text
- Accept user edits (inputs, table cells)
- Produce a minimal, deterministic patch back to the original text
- Re-parse and re-evaluate

## 2) Source mapping requirements

To support two-way editing, parsers MUST expose sufficient source locations to let an editor update:

- an `inputs` default value line, and
- an inline `data` JSONL row line.

### 2.1 Input mapping

Input definitions MUST include the source line number of the definition (already required by prior versions).

### 2.2 Inline data row mapping (`rowMap`)

When parsing a `data` block with inline JSONL rows (i.e. no `source`), the parser MUST provide a `rowMap` for that table.

`rowMap` MUST be an ordered list where index `i` corresponds to the row index in the parsed `rows` array.

Each `rowMap[i]` entry MUST include:

- `primaryKey` (string): the primary key value (normalized to string)
- `line` (integer): the 1-based line number in the source document where the JSONL row begins

If a row fails to parse or fails validation (missing/invalid/duplicate primary key), it MUST NOT be included in `rows`, and it MUST NOT be included in `rowMap`.

For external `data` tables (`source: ...`), `rowMap` MUST be omitted.

Note on formatting vs runtime ordering: The canonical formatter sorts inline JSONL rows by `primaryKey` to produce stable Git diffs. The optional `sortBy` header key controls runtime row presentation order only and is not applied during formatting.

## 3) The patching protocol

Implementations SHOULD provide a patch module that applies atomic edits to CalcDown source text while preserving comments and minimizing unrelated changes.

### 3.1 Atomic operations

The patcher MUST support these operations:

1. `updateInput(name, value)` — update the default value of an input definition.
2. `updateTableCell(tableName, primaryKey, column, value)` — update a single cell in an inline `data` table row (JSONL).

### 3.2 Preservation rules

#### Inputs

For `updateInput` patches:

- Patches MUST NOT remove or change any `#` comment text on the same line.
- Patches SHOULD preserve the original whitespace/indentation before the `#` comment.

#### Inline JSONL rows

For `updateTableCell` patches:

- Patches MUST preserve the line’s leading indentation.
- Patches MUST preserve the row’s primary key value (editors SHOULD treat primary key edits as a separate operation).
- Patches SHOULD preserve the existing JSON key order when possible.
- If a new key must be inserted (e.g. adding a missing column), the patcher SHOULD prefer the column order declared in the table schema.

### 3.3 Type-aware serialization (recommended)

Patchers SHOULD serialize patched values in a way that preserves round-trippability with declared types:

- `integer` values SHOULD be written as JSON numbers with no fractional part.
- `date` values SHOULD be written as ISO strings (`YYYY-MM-DD`).
- `datetime` values SHOULD be written as ISO strings (timezone handling implementation-defined).

## 4) External data handling

If a `data` table declares `source: ...` (external CSV/JSON), patchers MUST treat the inline `.calc.md` table as read-only.

Implementations SHOULD:

- return an explicit error (“external tables are read-only”), OR
- patch the external source file directly (implementation-defined; must preserve hash semantics).

## 5) Tooling (recommended)

Implementations SHOULD provide deterministic tooling that supports AI-driven development workflows:

- `calcdown validate --strict` — warnings treated as errors
- `calcdown fmt --check` — no-write mode, fails if changes would be made
- A golden-file conformance suite that runs validation/export on known projects and compares JSON outputs byte-for-byte
