# CalcDown Standard Library 0.2 (Draft)

Status: **Draft / experimental**. This document specifies the standard library object available as `std` when evaluating CalcScript 0.2 expressions.

See also: `docs/calcdown-0.2.md` (the file format, execution model, and CalcScript subset).

Goals:

- **Deterministic + sandboxable:** no ambient I/O, time, randomness, globals.
- **Spreadsheet-grade primitives:** sequences, scans (running state), dates, finance.
- **Vector-first intent:** engines may broadcast scalars/columns, but the API stays pure.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

## 1) Conformance

A CalcDown 0.2 engine MUST provide a `std` object with the **Core** APIs in §3.

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

### 3.3 `std.date`

#### `std.date.addMonths(date, months)`

Add calendar months, clamping the day to the end of the target month when needed (e.g. Jan 31 + 1 month = Feb 28/29).

Signature:

```ts
addMonths(date: Date, months: number): Date
```

Rules:

- `months` MUST be an integer.
- MUST be deterministic and timezone-stable (engines SHOULD use a consistent timezone, e.g. UTC, for date-only values).

### 3.4 `std.finance`

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

### 3.5 `std.assert`

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

### 4.2 `std.date`

- `addDays(date, days)`
- `addYears(date, years)`
- `startOfMonth(date)` / `endOfMonth(date)`
- `range(start, count, interval)` where `interval ∈ {"day","week","month","quarter","year"}`

### 4.3 `std.lookup`

- `xlookup(key, keys, values, { mode="exact", notFound=null }={})`
- `interpolate(x, xs, ys, { clamp=true }={})`
- joins (`leftJoin`, `innerJoin`) for relational spreadsheet behavior

### 4.4 `std.finance`

- `ipmt`, `ppmt`
- `npv`, `irr`
- depreciation: `sln`, `syd`
