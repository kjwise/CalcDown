# CalcDown Standard Library 0.7 (Draft)

Status: **Draft / experimental**. This document specifies the standard library object available as `std` when evaluating CalcScript expressions in CalcDown 0.7.

See also: `docs/calcdown-0.7.md` (the file format, project files, execution model, and tooling).

Goals:

- **Deterministic + sandboxable:** no ambient I/O, time, randomness, globals.
- **Spreadsheet-grade primitives:** sequences, scans (running state), dates, finance.
- **Relational power:** group-by, aggregation, joins, keyed lookups.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

## 1) Conformance

A CalcDown 0.7 engine MUST provide a `std` object with the **Core** APIs in §3.

Engines MAY provide additional APIs in §4 (Recommended) and beyond, but MUST NOT expose unsafe capabilities (network, storage, timers, dynamic code loading).

## 2) Value model (informative)

CalcDown code conceptually works with:

- **Scalar**: `number | boolean | string | Date | …`
- **Column<T>**: vector of `T` (array, typed array, columnar buffer)
- **Table<Row>**: collection of rows, represented as `Array<Record<string, unknown>>`

Many APIs are specified in terms of “arrays” for simplicity; engines MAY accept richer column/table types as long as behavior is equivalent.

## 3) Core APIs (required)

### 3.1 `std.math`

#### `std.math.sum(xs)`

Signature:

```ts
sum(xs: number[]): number
```

Rules:

- MUST throw if `xs` is not an array of finite numbers.

#### `std.math.mean(xs)`

Signature:

```ts
mean(xs: number[]): number
```

Rules:

- MUST throw if `xs` is empty.

#### `std.math.minOf(xs)` / `std.math.maxOf(xs)`

Signature:

```ts
minOf(xs: number[]): number
maxOf(xs: number[]): number
```

Rules:

- MUST throw if `xs` is empty.

#### `std.math.round(x, digits?)`

Signature:

```ts
round(x: number, digits?: number): number
```

Rules:

- `digits` MUST be an integer (default `0`).
- Engines SHOULD use “half away from zero” semantics for spreadsheet parity.

#### `std.math.abs(x)`

Signature:

```ts
abs(x: number): number
```

Rules:

- MUST throw if `x` is not a finite number.

#### `std.math.sign(x)`

Signature:

```ts
sign(x: number): number
```

Rules:

- MUST throw if `x` is not a finite number.

#### `std.math.sqrt(x)`

Signature:

```ts
sqrt(x: number): number
```

Rules:

- MUST throw if `x` is not a finite number.
- MUST throw if the result is not a finite number.

#### `std.math.exp(x)`

Signature:

```ts
exp(x: number): number
```

Rules:

- MUST throw if `x` is not a finite number.
- MUST throw if the result is not a finite number.

#### `std.math.ln(x)`

Signature:

```ts
ln(x: number): number
```

Rules:

- MUST throw if `x` is not a finite number.
- MUST throw if the result is not a finite number.

#### `std.math.log10(x)`

Signature:

```ts
log10(x: number): number
```

Rules:

- MUST throw if `x` is not a finite number.
- MUST throw if the result is not a finite number.

#### Additional scalar math (0.7)

The following functions MUST be provided:

- `sin(x)`, `cos(x)`, `tan(x)`
- `asin(x)`, `acos(x)`, `atan(x)`, `atan2(y, x)`
- `sinh(x)`, `cosh(x)`, `tanh(x)`
- `ceil(x)`, `floor(x)`, `trunc(x)`
- `pow(base, exp)`

Rules:

- Each numeric argument MUST be a finite number.
- The result MUST be a finite number.

#### `std.math.E`

A numeric constant equal to *e*.

#### `std.math.PI`

A numeric constant equal to π.

### 3.2 `std.data`

#### `std.data.sequence(count, opts?)`

Signature:

```ts
sequence(count: number, opts?: { start?: number; step?: number }): number[]
```

Rules:

- `count` MUST be a non-negative integer.
- Default `start = 1`, `step = 1`.

#### `std.data.filter(items, predicate)`

Signature:

```ts
filter<T>(items: T[], predicate: (item: T, index: number) => unknown): T[]
```

Rules:

- MUST return a new array containing items for which `predicate(...)` is truthy.

#### `std.data.sortBy(rows, key, direction?)`

Signature:

```ts
sortBy<T extends Record<string, unknown>>(
  rows: T[],
  key: string,
  direction?: "asc" | "desc"
): T[]
```

Rules:

- Sorting MUST be stable for deterministic output.
- Keys MAY be `number`, `string`, or `Date`. Missing keys (`null`/`undefined`) MUST sort last.

#### `std.data.scan(items, reducer, seedOrOptions)`

Signature:

```ts
scan<TItem, TState>(
  items: TItem[],
  reducer: (state: TState, item: TItem, index: number) => TState,
  seedOrOptions: TState | { seed: TState }
): TState[]
```

Rules:

- The returned array length MUST equal `items.length`.
- The reducer MUST be deterministic.

#### `std.data.last(items)`

Signature:

```ts
last<T>(items: T[]): T
```

Rules:

- MUST throw on empty arrays.

### 3.3 `std.table`

Table helpers operate on “rows” represented as arrays of objects (`Array<Record<string, unknown>>`).

#### `std.table.col(rows, key)`

Signature:

```ts
col<T = unknown>(rows: Record<string, unknown>[], key: string): T[]
```

#### `std.table.map(rows, mapper)`

Signature:

```ts
map<TIn extends Record<string, unknown>, TOut>(
  rows: TIn[],
  mapper: (row: TIn, index: number) => TOut
): TOut[]
```

#### `std.table.sum(rows, key)`

Signature:

```ts
sum(rows: Record<string, unknown>[], key: string): number
```

Rules:

- MUST throw if any value in the column is not a finite number.

#### `std.table.filter(rows, predicate)`

Signature:

```ts
filter<T extends Record<string, unknown>>(
  rows: T[],
  predicate: (row: T, index: number) => unknown
): T[]
```

#### `std.table.sortBy(rows, key, direction?)`

Alias of `std.data.sortBy` for row arrays.

#### `std.table.groupBy(rows, key)`

Group rows into stable groups keyed by a column or key function.

Signature:

```ts
groupBy<T extends Record<string, unknown>>(
  rows: T[],
  key: string | ((row: T, index: number) => string | number)
): Array<{ key: string | number; rows: T[] }>
```

Rules:

- Group order MUST be stable (order of first appearance).
- Key values MUST be `string` or `number`.

#### `std.table.agg(groups, mapper)`

Aggregate grouped rows into a new row array.

Signature:

```ts
agg<T extends Record<string, unknown>, TOut extends Record<string, unknown>>(
  groups: Array<{ key: string | number; rows: T[] }>,
  mapper: (group: { key: string | number; rows: T[] }, index: number) => TOut
): TOut[]
```

Rules:

- MUST return a new array with length equal to `groups.length`.

#### `std.table.join(leftRows, rightRows, opts)`

Join two row arrays by key equality.

Signature:

```ts
join(
  leftRows: Record<string, unknown>[],
  rightRows: Record<string, unknown>[],
  opts: {
    leftKey: string;
    rightKey: string;
    how?: "inner" | "left";
    rightPrefix?: string;
  }
): Record<string, unknown>[]
```

Rules:

- `how` MUST default to `"inner"`.
- Join output order MUST be stable:
  - `"inner"` / `"left"` MUST preserve left row order.
- If a right-side field name collides with an existing left-side field name, engines MUST prefix right-side keys with `rightPrefix` (default: `"right_"`).

### 3.4 `std.lookup`

`std.lookup` provides keyed lookup (XLOOKUP-like) for row arrays.

#### `std.lookup.index(rows, keyColumn)`

Build a lookup index.

Signature:

```ts
index(rows: Record<string, unknown>[], keyColumn: string): unknown
```

Notes:

- The returned value is an opaque index object intended for `std.lookup.get` / `std.lookup.xlookup`.

#### `std.lookup.get(index, key)`

Return the first row matching `key`.

Signature:

```ts
get(index: unknown, key: string | number): Record<string, unknown>
```

Rules:

- MUST throw if the key is not found.

#### `std.lookup.xlookup(key, rows, keyColumn, valueColumn, notFound?)`

Return a value from a keyed table (XLOOKUP-like).

Signature:

```ts
xlookup(
  key: string | number,
  rows: Record<string, unknown>[],
  keyColumn: string,
  valueColumn: string,
  notFound?: unknown
): unknown
```

Rules:

- MUST throw if not found and `notFound` is not provided.

### 3.5 `std.date`

#### `std.date.now()`

Return the current datetime according to the evaluation context.

Rules:

- Engines SHOULD supply a deterministic “current datetime” value per evaluation session.
- If no context is supplied, implementations MAY use the host’s current time.

#### `std.date.today()`

Return the current date (UTC midnight) according to the evaluation context.

#### `std.date.parse(value)`

Parse an ISO date string (`YYYY-MM-DD`) into a `Date` (UTC midnight).

#### `std.date.format(date, template)`

Format a `Date` using a tiny, deterministic strftime-like template.

#### `std.date.addMonths(date, months)`

Add calendar months, clamping the day to end-of-month when needed.

### 3.6 `std.finance`

#### `std.finance.toMonthlyRate(annualPercent)`

Convert an annual percent to a decimal monthly rate.

#### `std.finance.pmt(rate, nper, pv, fv?, type?)`

Excel-compatible payment amount for a loan (PMT).

### 3.7 `std.assert`

#### `std.assert.that(condition, message?)`

Throw a deterministic model error if `condition` is falsy.

### 3.8 `std.text`

#### `std.text.concat(...parts)`

Concatenate text and numbers deterministically. Scalars broadcast over arrays.

Signature:

```ts
concat(...parts: Array<string | number | Array<string | number>>): string | string[]
```

Rules:

- Each `part` MUST be either:
  - a `string`
  - a finite `number`
  - an array of `string | finite number`
- If any `part` is an array, then all array parts MUST have the same length. Scalars MUST be broadcast across that length.
- The return value MUST be:
  - a `string` (if all parts are scalars), or
  - a `string[]` (if any part is an array)

#### `std.text.repeat(value, count)`

Repeat a string (or each string in an array).

Signature:

```ts
repeat(value: string | string[], count: number): string | string[]
```

Rules:

- `count` MUST be a non-negative integer.
- If `value` is an array, it MUST be an array of strings.

## 4) Recommended APIs (optional, but expected soon)

- `std.lookup.interpolate`
- `std.finance.ipmt`, `std.finance.ppmt`
- `std.date.range` and other calendar helpers

## Appendix A) Changes from 0.6 → 0.7

- Expand `std.math` with common scalar math (trig, hyperbolic, ceil/floor/trunc, pow) and constant `E`.
- 0.7 otherwise keeps the 0.x standard library small and safety-first.
