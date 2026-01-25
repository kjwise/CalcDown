# CalcDown Standard Library 0.3 (Draft)

**This draft is SUPERSEDED.**  
Current version → [stdlib 0.8](stdlib-0.8.md) — [CalcDown 0.8](calcdown-0.8.md)

Status: **Draft / experimental**. This document specifies the standard library object available as `std` when evaluating CalcScript 0.3 expressions.

See also: `docs/calcdown-0.3.md` (the file format, execution model, and CalcScript subset).

Goals:

- **Deterministic + sandboxable:** no ambient I/O, time, randomness, globals.
- **Spreadsheet-grade primitives:** sequences, scans (running state), dates, finance.
- **Table-friendly:** helpers for common row/column transforms without loops.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

## 1) Conformance

A CalcDown 0.3 engine MUST provide a `std` object with the **Core** APIs in §3.

Engines MAY provide additional APIs in §4 (Recommended) and beyond, but MUST NOT expose unsafe capabilities (network, storage, timers, dynamic code loading).

## 2) Value model (informative)

Engines will differ internally, but CalcDown code conceptually works with:

- **Scalar**: `number | boolean | string | Date | …`
- **Column<T>**: vector of `T` (array, typed array, columnar buffer)
- **Table<Row>**: collection of rows with named columns

Many APIs are specified in terms of “arrays” for simplicity; engines MAY accept richer column/table types as long as behavior is equivalent.

## 3) Core APIs (required)

### 3.1 `std.math`

#### `std.math.sum(xs)`

Sum a numeric array.

Signature:

```ts
sum(xs: number[]): number
```

Rules:

- MUST throw if `xs` is not an array of numbers.
- MUST be deterministic (no parallel reduction nondeterminism).

### 3.2 `std.data`

#### `std.data.sequence(count, opts?)`

Generate a numeric sequence.

Signature:

```ts
sequence(count: number, opts?: { start?: number; step?: number }): number[]
```

Rules:

- `count` MUST be a non-negative integer.
- Default `start = 1`, `step = 1`.

#### `std.data.filter(items, predicate)`

Filter an array using a predicate function.

Signature:

```ts
filter<T>(items: T[], predicate: (item: T, index: number) => unknown): T[]
```

Rules:

- MUST throw if `items` is not an array.
- MUST throw if `predicate` is not a function.
- MUST return a new array containing items for which `predicate(...)` is truthy.

#### `std.data.sortBy(rows, key, direction?)`

Stable sort a “rows array” (table) by a single key.

Signature:

```ts
sortBy<T extends Record<string, unknown>>(
  rows: T[],
  key: string,
  direction?: "asc" | "desc"
): T[]
```

Rules:

- MUST throw if `rows` is not an array.
- MUST throw if `key` is empty or unsafe (engines MUST defensively block `__proto__`, `prototype`, `constructor`).
- `direction` MUST default to `"asc"` and MUST reject values other than `"asc"`/`"desc"`.
- Keys MAY be `number`, `string`, or `Date`. Missing keys (`null`/`undefined`) MUST sort last.
- Sorting MUST be stable (ties preserve original order) for deterministic diffs.

#### `std.data.scan(items, reducer, seedOrOptions)`

Run a deterministic left-to-right scan (running state). This is the preferred way to express amortization schedules, running totals, cumulative products, etc., without loops.

Signature:

```ts
scan<TItem, TState>(
  items: TItem[],
  reducer: (state: TState, item: TItem, index: number) => TState,
  seedOrOptions: TState | { seed: TState }
): TState[]
```

Rules:

- `items` MUST be finite and iterated in order.
- The reducer MUST be pure for determinism.
- The returned array length MUST equal `items.length`.

Notes:

- If `TState` is an object, engines commonly treat the resulting array as a “table” (one object per row).
- Reducers may ignore trailing parameters (e.g. `(state) => ...`), consistent with JavaScript calling conventions.

#### `std.data.last(items)`

Return the last element.

Signature:

```ts
last<T>(items: T[]): T
```

Rules:

- MUST throw on empty arrays.

### 3.3 `std.table`

Table helpers operate on “rows” represented as arrays of objects (`Array<Record<string, unknown>>`).

#### `std.table.col(rows, key)`

Extract a column as an array.

Signature:

```ts
col<T = unknown>(rows: Record<string, unknown>[], key: string): T[]
```

Rules:

- MUST throw if `rows` is not an array.
- MUST throw if `key` is not a non-empty string.

#### `std.table.map(rows, mapper)`

Map rows to a new array (like `Array.prototype.map`).

Signature:

```ts
map<TIn extends Record<string, unknown>, TOut>(
  rows: TIn[],
  mapper: (row: TIn, index: number) => TOut
): TOut[]
```

Rules:

- MUST throw if `rows` is not an array.
- MUST throw if `mapper` is not a function.

#### `std.table.sum(rows, key)`

Sum a numeric column.

Signature:

```ts
sum(rows: Record<string, unknown>[], key: string): number
```

Rules:

- MUST throw if any value in the column is not a finite number.

### 3.4 `std.date`

#### `std.date.parse(value)`

Parse an ISO date string (`YYYY-MM-DD`) into a `Date` (UTC midnight).

Signature:

```ts
parse(value: string): Date
```

Rules:

- MUST accept ISO `YYYY-MM-DD` only.
- MUST throw on invalid dates (including out-of-range calendar dates).

#### `std.date.format(date, template)`

Format a `Date` using a tiny, deterministic strftime-like template.

Signature:

```ts
format(date: Date, template: string): string
```

Supported tokens (0.3):

- `%Y` — 4-digit year (UTC)
- `%m` — 2-digit month (UTC)
- `%d` — 2-digit day (UTC)
- `%%` — literal `%`

Rules:

- MUST throw on unsupported tokens.

#### `std.date.addMonths(date, months)`

Add calendar months, clamping the day to the end of the target month when needed (e.g. Jan 31 + 1 month = Feb 28/29).

Signature:

```ts
addMonths(date: Date, months: number): Date
```

Rules:

- `months` MUST be an integer.
- MUST be deterministic and timezone-stable (engines SHOULD use a consistent timezone, e.g. UTC, for date-only values).

### 3.5 `std.finance`

#### `std.finance.toMonthlyRate(annualPercent)`

Convert an annual percent (e.g. `6.0` for 6%) to a decimal monthly rate.

Signature:

```ts
toMonthlyRate(annualPercent: number): number
```

Definition:

```
annualPercent / 100 / 12
```

#### `std.finance.pmt(rate, nper, pv, fv?, type?)`

Excel-compatible payment amount for a loan (PMT).

Signature:

```ts
pmt(rate: number, nper: number, pv: number, fv?: number, type?: 0 | 1): number
```

Notes:

- `type = 0` means payments at end of period; `type = 1` at beginning.
- Engines SHOULD match Excel sign conventions (cash outflows are negative).

### 3.6 `std.assert`

#### `std.assert.that(condition, message?)`

Throw a deterministic model error if `condition` is falsy.

Signature:

```ts
that(condition: unknown, message?: string): void
```

## 4) Recommended APIs (optional, but expected soon)

These APIs are not required for minimal engines, but are strongly recommended for spreadsheet parity.

### 4.1 `std.math`

- `mean(xs)`
- `minOf(xs)` / `maxOf(xs)`
- `round(x, digits=0)`

### 4.2 `std.table`

- `filter(rows, predicate)`
- `groupSum(rows, byKey, valueKey)`
- joins (`leftJoin`, `innerJoin`) for relational spreadsheet behavior

### 4.3 `std.date`

- `addDays(date, days)`
- `addYears(date, years)`
- `startOfMonth(date)` / `endOfMonth(date)`
- `range(start, count, interval)` where `interval ∈ {"day","week","month","quarter","year"}`

### 4.4 `std.lookup`

- `xlookup(key, keys, values, { mode="exact", notFound=null }={})`
- `interpolate(x, xs, ys, { clamp=true }={})`

### 4.5 `std.finance`

- `ipmt`, `ppmt`
- `npv`, `irr`
- depreciation: `sln`, `syd`
