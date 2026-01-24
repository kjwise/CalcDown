# CalcDown Standard Library 0.1 (Draft)

**This draft is SUPERSEDED.**  
Current version → [CalcDown 0.7](calcdown-0.7.md) — [stdlib 0.7](stdlib-0.7.md)

Status: **Draft / experimental**. This is the minimal “Excel-grade” standard library expected to exist as `std` inside CalcScript evaluation.

## 1) Design rules

- **Pure + deterministic:** no I/O, no time, no randomness (unless provided as inputs).
- **Vector-first:** most functions accept scalars *or* columns and broadcast automatically.
- **Typed:** functions validate inputs where feasible (especially finance/date operations).

### 1.1 Value kinds

Implementations will differ, but CalcDown code conceptually works with:

- **Scalar**: `number | boolean | string | date | decimal | currency | percent | …`
- **Column<T>**: vector of `T` (often a typed array or columnar buffer)
- **Table<Row>**: named columns + stable row identity (`primaryKey` or internal row IDs)

### 1.2 Broadcasting (vectorization)

For functions marked “broadcasting”:

- `f(Scalar, Scalar) -> Scalar`
- `f(Column, Scalar) -> Column` (scalar broadcast)
- `f(Scalar, Column) -> Column`
- `f(Column, Column) -> Column` (elementwise; lengths must match)

Aggregation functions (like `sum`) collapse columns to scalars.

## 2) `std.math`

Broadcasting elementwise ops:

- `std.math.abs(x)`
- `std.math.round(x, digits=0)`
- `std.math.floor(x)`
- `std.math.ceil(x)`
- `std.math.min(a, b)` / `std.math.max(a, b)` (elementwise)
- `std.math.clamp(x, lo, hi)`

Aggregations:

- `std.math.sum(xs)`
- `std.math.mean(xs)`
- `std.math.count(xs)`
- `std.math.minOf(xs)` / `std.math.maxOf(xs)`

Notes:

- Implementations SHOULD support `decimal`/`currency` inputs without precision loss.
- Where mixed numeric kinds are used, implementations SHOULD define promotion rules (e.g., `currency + currency -> currency`, `currency * number -> currency`, `percent` treated as a numeric scalar by convention).

## 3) `std.data`

Sequence generation:

- `std.data.range(start, end, step=1)` → inclusive/exclusive is implementation-defined; prefer `sequence` for deterministic lengths.
- `std.data.sequence(count, { start=1, step=1 }={})` → `[start, start+step, …]` (length = `count`)
- `std.data.repeat(value, count)` → column filled with `value`

Transformations (broadcasting helpers):

- `std.data.map(xs, fn)` → column
- `std.data.filter(tableOrColumn, predicate)` → filtered table/column
- `std.data.sort(table, by, { order="asc" }={})` → stable sort
- `std.data.last(xs)` → last element (errors on empty)

Running-state / recursion replacement:

- `std.data.scan(items, reducer, { seed }={})` → table or column

`scan` is the recommended way to express amortization schedules, running totals, cumulative products, etc., without exposing loops in CalcScript.

## 4) `std.date`

Construction + parsing:

- `std.date.parse(value)` → date
- `std.date.today()` → **not allowed by default**; if supported, it MUST be surfaced as an explicit input for determinism.

Arithmetic (broadcasting):

- `std.date.addDays(d, n)`
- `std.date.addMonths(d, n)`
- `std.date.addYears(d, n)`

Boundaries:

- `std.date.startOfMonth(d)`
- `std.date.endOfMonth(d)`

Ranges:

- `std.date.range(start, count, interval)` where `interval ∈ {"day","week","month","quarter","year"}`

## 5) `std.lookup`

Columnar lookups (broadcasting where sensible):

- `std.lookup.lookup(key, keys, values, { mode="exact" }={})`
- `std.lookup.xlookup(key, keys, values, { mode="exact", notFound=null }={})`
- `std.lookup.interpolate(x, xs, ys, { clamp=true }={})`

Table indexing:

- `std.lookup.indexBy(table, keyColumn)` → index object supporting `index[key] -> row`

Joins (relational spreadsheet behavior):

- `std.lookup.leftJoin(left, right, { leftKey, rightKey, suffix="_r" })`
- `std.lookup.innerJoin(left, right, { leftKey, rightKey, suffix="_r" })`

## 6) `std.finance`

Rates:

- `std.finance.toMonthlyRate(annualPercent)` → decimal monthly rate

Loan payments (Excel-parity naming where possible):

- `std.finance.pmt(rate, nper, pv, fv=0, type=0)`
- `std.finance.ipmt(rate, per, nper, pv, fv=0, type=0)`
- `std.finance.ppmt(rate, per, nper, pv, fv=0, type=0)`

Time-value of money:

- `std.finance.npv(rate, cashflows)`
- `std.finance.irr(cashflows, { guess }={})`

Depreciation:

- `std.finance.sln(cost, salvage, life)`
- `std.finance.syd(cost, salvage, life, per)`

## 7) `std.assert` (recommended)

For constraints and model checks:

- `std.assert.that(condition, message)` → throws a deterministic model error if `condition` is false.
