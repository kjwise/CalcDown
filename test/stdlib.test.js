import assert from "node:assert/strict";
import { test } from "node:test";

import { std } from "../dist/stdlib/std.js";

function iso(date) {
  assert.ok(date instanceof Date);
  return date.toISOString().slice(0, 10);
}

function approxEqual(actual, expected, tol = 1e-9) {
  assert.ok(Number.isFinite(actual), `Expected finite actual, got ${actual}`);
  assert.ok(Number.isFinite(expected), `Expected finite expected, got ${expected}`);
  assert.ok(Math.abs(actual - expected) <= tol, `Expected ${actual} ≈ ${expected} (tol=${tol})`);
}

test("std.math.sum", () => {
  assert.equal(std.math.sum([1, 2, 3]), 6);
  assert.equal(std.math.sum([]), 0);
  assert.throws(() => std.math.sum("nope"), /sum: expected array/);
  assert.throws(() => std.math.sum([1, "2"]), /sum: expected number array/);
});

test("std.data.sequence", () => {
  assert.deepEqual(std.data.sequence(0), []);
  assert.deepEqual(std.data.sequence(5), [1, 2, 3, 4, 5]);
  assert.deepEqual(std.data.sequence(3, { start: 0 }), [0, 1, 2]);
  assert.deepEqual(std.data.sequence(4, { start: 10, step: 2 }), [10, 12, 14, 16]);

  assert.throws(() => std.data.sequence(-1), /sequence: count must be a non-negative integer/);
  assert.throws(() => std.data.sequence(1.25), /sequence: count must be a non-negative integer/);
  assert.throws(() => std.data.sequence(Number.NaN), /sequence: count must be a non-negative integer/);
});

test("std.data.filter", () => {
  assert.deepEqual(std.data.filter([1, 2, 3, 4], (x) => x % 2 === 0), [2, 4]);
  assert.deepEqual(std.data.filter([], () => true), []);
  assert.throws(() => std.data.filter("nope", () => true), /filter: expected array/);
  assert.throws(() => std.data.filter([1], "nope"), /filter: expected predicate function/);
});

test("std.data.sortBy", () => {
  const rows = [
    { id: "a", n: 2 },
    { id: "b", n: 1 },
    { id: "c", n: 2 },
    { id: "d" },
  ];
  assert.deepEqual(
    std.data.sortBy(rows, "n").map((r) => r.id),
    ["b", "a", "c", "d"]
  );
  assert.deepEqual(
    std.data.sortBy(rows, "n", "desc").map((r) => r.id),
    ["a", "c", "b", "d"]
  );

  const dateRows = [
    { id: "a", d: new Date(Date.UTC(2024, 0, 2)) },
    { id: "b", d: new Date(Date.UTC(2024, 0, 1)) },
  ];
  assert.deepEqual(
    std.data.sortBy(dateRows, "d").map((r) => r.id),
    ["b", "a"]
  );

  const strRows = [
    { id: "b", s: "b" },
    { id: "a", s: "a" },
  ];
  assert.deepEqual(
    std.data.sortBy(strRows, "s").map((r) => r.id),
    ["a", "b"]
  );

  const strTies = [
    { id: "a", s: "x" },
    { id: "b", s: "x" },
    { id: "c", s: "y" },
  ];
  assert.deepEqual(
    std.data.sortBy(strTies, "s").map((r) => r.id),
    ["a", "b", "c"]
  );

  assert.throws(() => std.data.sortBy("nope", "n"), /sortBy: expected rows array/);
  assert.throws(() => std.data.sortBy(rows, ""), /sortBy: expected key string/);
  assert.throws(() => std.data.sortBy(rows, "__proto__"), /sortBy: disallowed key/);
  assert.throws(() => std.data.sortBy(rows, "n", "nope"), /sortBy: direction must be 'asc' or 'desc'/);
  assert.throws(() => std.data.sortBy([{ n: true }], "n"), /sortBy: unsupported key type/);
  assert.throws(() => std.data.sortBy([{ n: 1 }, { n: "x" }], "n"), /sortBy: mixed key types/);
});

test("std.data.last", () => {
  assert.equal(std.data.last([1, 2, 3]), 3);
  assert.throws(() => std.data.last("nope"), /last: expected array/);
  assert.throws(() => std.data.last([]), /last: empty array/);
});

test("std.data.scan", () => {
  const items = [1, 2, 3];
  const sums = std.data.scan(items, (state, item) => state + item, 0);
  assert.deepEqual(sums, [1, 3, 6]);

  const empty = std.data.scan([], (state) => state, { seed: 123 });
  assert.deepEqual(empty, []);

  const viaSeed = std.data.scan(items, (state, item) => state + item, { seed: 10 });
  assert.deepEqual(viaSeed, [11, 13, 16]);

  const running = std.data.scan(
    items,
    (state, item) => ({ sum: state.sum + item, max: Math.max(state.max, item) }),
    { seed: { sum: 0, max: Number.NEGATIVE_INFINITY } }
  );
  assert.deepEqual(running, [
    { sum: 1, max: 1 },
    { sum: 3, max: 2 },
    { sum: 6, max: 3 },
  ]);

  const objs = std.data.scan(
    ["a", "b"],
    (state, item, index) => ({ count: state.count + 1, item, index }),
    { seed: { count: 0, item: "", index: -1 } }
  );
  assert.deepEqual(objs, [
    { count: 1, item: "a", index: 0 },
    { count: 2, item: "b", index: 1 },
  ]);

  // Reducers may ignore trailing parameters.
  const ignored = std.data.scan([0, 0, 0], (state) => state + 1, { seed: 0 });
  assert.deepEqual(ignored, [1, 2, 3]);

  assert.throws(() => std.data.scan("nope", () => 0, 0), /scan: expected array items/);
  assert.throws(() => std.data.scan([], "nope", 0), /scan: expected reducer function/);
});

test("std.table.col", () => {
  const rows = [
    { a: 1, b: "x" },
    { a: 2, b: "y" },
  ];
  assert.deepEqual(std.table.col(rows, "a"), [1, 2]);
  assert.deepEqual(std.table.col(rows, "missing"), [undefined, undefined]);
  assert.throws(() => std.table.col("nope", "a"), /col: expected rows array/);
  assert.throws(() => std.table.col(rows, ""), /col: expected key string/);
  assert.throws(() => std.table.col(rows, "__proto__"), /col: disallowed key/);
  assert.throws(() => std.table.col([null], "a"), /col: expected row objects/);
});

test("std.table.map", () => {
  const rows = [{ a: 2 }, { a: 3 }];
  const out = std.table.map(rows, (row, index) => ({ v: row.a * 10, index }));
  assert.deepEqual(out, [
    { v: 20, index: 0 },
    { v: 30, index: 1 },
  ]);
  assert.throws(() => std.table.map("nope", () => 0), /map: expected rows array/);
  assert.throws(() => std.table.map(rows, "nope"), /map: expected mapper function/);
  assert.throws(() => std.table.map([null], () => 0), /map: expected row objects/);
});

test("std.table.sum", () => {
  const rows = [{ n: 1 }, { n: 2.5 }, { n: -3 }];
  assert.equal(std.table.sum(rows, "n"), 0.5);
  assert.throws(() => std.table.sum(rows, "__proto__"), /col: disallowed key/);
  assert.throws(() => std.table.sum([{ n: "x" }], "n"), /sum: expected finite numbers/);
  assert.throws(() => std.table.sum([{ n: Number.POSITIVE_INFINITY }], "n"), /sum: expected finite numbers/);
});

test("std.date.addMonths", () => {
  const d2023 = new Date(Date.UTC(2023, 0, 31));
  assert.equal(iso(std.date.addMonths(d2023, 1)), "2023-02-28");

  const d2024 = new Date(Date.UTC(2024, 0, 31));
  assert.equal(iso(std.date.addMonths(d2024, 1)), "2024-02-29");
  assert.equal(iso(std.date.addMonths(d2024, -1)), "2023-12-31");

  const dMarch = new Date(Date.UTC(2024, 2, 31));
  assert.equal(iso(std.date.addMonths(dMarch, 1)), "2024-04-30");

  const leap = new Date(Date.UTC(2024, 1, 29));
  assert.equal(iso(std.date.addMonths(leap, 12)), "2025-02-28");

  assert.throws(() => std.date.addMonths(new Date(Number.NaN), 1), /addMonths: invalid date/);
  assert.throws(() => std.date.addMonths(new Date(Date.UTC(2024, 0, 1)), 1.5), /addMonths: months must be integer/);
  assert.throws(() => std.date.addMonths(new Date(Date.UTC(2024, 0, 1)), Number.POSITIVE_INFINITY), /addMonths: months must be integer/);
});

test("std.date.parse / std.date.format", () => {
  const d = std.date.parse("2024-01-05");
  assert.equal(iso(d), "2024-01-05");
  assert.equal(std.date.format(d, "%Y-%m-%d"), "2024-01-05");
  assert.equal(std.date.format(d, "m=%m d=%d"), "m=01 d=05");
  assert.equal(std.date.format(d, "Year=%Y"), "Year=2024");
  assert.equal(std.date.format(d, "%%Y=%Y"), "%Y=2024");

  assert.throws(() => std.date.parse(123), /parse: expected ISO date string/);
  assert.throws(() => std.date.parse("2024/01/05"), /Invalid date/);
  assert.throws(() => std.date.format(new Date(Number.NaN), "%Y"), /format: invalid date/);
  assert.throws(() => std.date.format(d, 123), /format: expected template string/);
  assert.throws(() => std.date.format(d, "%"), /format: dangling %/);
  assert.throws(() => std.date.format(d, "%q"), /format: unsupported token/);
});

test("std.finance.toMonthlyRate", () => {
  approxEqual(std.finance.toMonthlyRate(6.0), 0.06 / 12);
  assert.throws(() => std.finance.toMonthlyRate(Number.POSITIVE_INFINITY), /toMonthlyRate: annualPercent must be finite/);
});

test("std.finance.pmt", () => {
  const rate = std.finance.toMonthlyRate(5.0);
  const nper = 30 * 12;
  const pv = -300000;

  const payment = std.finance.pmt(rate, nper, pv);
  approxEqual(payment, 1610.4648690364195, 1e-9);

  // rate=0 special case
  assert.equal(std.finance.pmt(0, 10, -1000), 100);
  assert.equal(std.finance.pmt(0, 10, -1000, 100), 90);

  // fv affects the payment magnitude (non-zero rate).
  const withFv = std.finance.pmt(rate, 12, -1000, 500, 0);
  assert.ok(Number.isFinite(withFv));
  assert.ok(Math.abs(withFv) < 200, `Expected smaller magnitude payment, got ${withFv}`);

  // type affects the (1 + rate*type) term
  const pmt0 = std.finance.pmt(rate, nper, pv, 0, 0);
  const pmt1 = std.finance.pmt(rate, nper, pv, 0, 1);
  approxEqual(pmt1, pmt0 / (1 + rate), 1e-12);

  assert.throws(() => std.finance.pmt(Number.NaN, 10, 1), /pmt: invalid arguments/);
  assert.throws(() => std.finance.pmt(0.01, 10, 1, Number.NaN), /pmt: invalid arguments/);
  assert.throws(() => std.finance.pmt(0.01, 0, 1), /pmt: nper must be non-zero/);
  assert.throws(() => std.finance.pmt(0.01, 10, 1, 0, 2), /pmt: type must be 0 or 1/);
});

test("std.assert.that", () => {
  std.assert.that(true);
  assert.throws(() => std.assert.that(false), /Assertion failed/);
  assert.throws(() => std.assert.that(false, "nope"), /nope/);
});
