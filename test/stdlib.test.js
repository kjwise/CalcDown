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
  assert.throws(() => std.math.sum([1, "2"]), /sum: expected finite number array/);
  assert.throws(() => std.math.sum([1, Number.POSITIVE_INFINITY]), /sum: expected finite number array/);
});

test("std.math.mean / minOf / maxOf / round", () => {
  assert.equal(std.math.mean([2, 4, 6]), 4);
  assert.throws(() => std.math.mean([]), /mean: empty array/);
  assert.throws(() => std.math.mean([1, Number.POSITIVE_INFINITY]), /mean: expected finite number array/);

  assert.equal(std.math.minOf([2, -1, 5]), -1);
  assert.equal(std.math.maxOf([2, -1, 5]), 5);
  assert.throws(() => std.math.minOf([]), /minOf: empty array/);
  assert.throws(() => std.math.maxOf([]), /maxOf: empty array/);

  assert.equal(std.math.round(1.2345, 2), 1.23);
  assert.equal(std.math.round(1.235, 2), 1.24);
  assert.equal(std.math.round(-1.5, 0), -2); // half away from zero
  assert.equal(std.math.round(150, -2), 200);

  assert.throws(() => std.math.round(Number.NaN), /round: x must be finite/);
  assert.throws(() => std.math.round(1, 1.5), /round: digits must be integer/);
  assert.throws(() => std.math.round(1, 99), /round: digits out of range/);
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

test("std.table.filter / std.table.sortBy", () => {
  const rows = [{ id: "a", n: 2 }, { id: "b", n: 1 }];
  assert.deepEqual(std.table.filter(rows, (r) => r.n > 1).map((r) => r.id), ["a"]);
  assert.deepEqual(std.table.sortBy(rows, "n").map((r) => r.id), ["b", "a"]);
  assert.throws(() => std.table.filter("nope", () => true), /filter: expected rows array/);
  assert.throws(() => std.table.filter(rows, "nope"), /filter: expected predicate function/);
  assert.throws(() => std.table.filter([null], () => true), /filter: expected row objects/);
});

test("std.table.sum", () => {
  const rows = [{ n: 1 }, { n: 2.5 }, { n: -3 }];
  assert.equal(std.table.sum(rows, "n"), 0.5);
  assert.throws(() => std.table.sum(rows, "__proto__"), /col: disallowed key/);
  assert.throws(() => std.table.sum([{ n: "x" }], "n"), /sum: expected finite numbers/);
  assert.throws(() => std.table.sum([{ n: Number.POSITIVE_INFINITY }], "n"), /sum: expected finite numbers/);
});

test("std.table.groupBy / std.table.agg", () => {
  const rows = [
    { id: "a", cat: "Food", amount: 10 },
    { id: "b", cat: "Travel", amount: 5 },
    { id: "c", cat: "Food", amount: 2 },
  ];

  const groups = std.table.groupBy(rows, "cat");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "Food");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[1].key, "Travel");

  const viaFn = std.table.groupBy(rows, (r) => r.cat);
  assert.deepEqual(viaFn.map((g) => g.key), ["Food", "Travel"]);

  const summary = std.table.agg(groups, (g) => ({
    cat: g.key,
    total: std.table.sum(g.rows, "amount"),
    count: g.rows.length,
  }));
  assert.deepEqual(
    summary.map((r) => Object.fromEntries(Object.entries(r))),
    [
      { cat: "Food", total: 12, count: 2 },
      { cat: "Travel", total: 5, count: 1 },
    ]
  );

  const numeric = std.table.groupBy(
    [
      { id: "x", n: 1 },
      { id: "y", n: 2 },
      { id: "z", n: 1 },
    ],
    "n"
  );
  assert.deepEqual(numeric.map((g) => g.key), [1, 2]);

  assert.throws(() => std.table.groupBy("nope", "cat"), /groupBy: expected rows array/);
  assert.throws(() => std.table.groupBy([null], "cat"), /groupBy: expected row objects/);
  assert.throws(() => std.table.groupBy(rows, 123), /groupBy: key must be a string or function/);
  assert.throws(() => std.table.groupBy(rows, "__proto__"), /groupBy: disallowed key/);
  assert.throws(() => std.table.groupBy(rows, () => ({})), /groupBy: key values must be strings or numbers/);
  assert.throws(
    () => std.table.groupBy(rows, () => Number.POSITIVE_INFINITY),
    /groupBy: key values must be finite numbers/
  );

  assert.throws(() => std.table.agg("nope", () => ({})), /agg: expected groups array/);
  assert.throws(() => std.table.agg(groups, "nope"), /agg: expected mapper function/);
  assert.throws(
    () => std.table.agg([{ key: "x", rows: [] }], () => 123),
    /agg: mapper must return an object/
  );
  assert.throws(
    () => std.table.agg([{ key: "x", rows: "nope" }], () => ({})),
    /agg: group.rows must be an array/
  );
  assert.throws(
    () => std.table.agg([{ key: Number.POSITIVE_INFINITY, rows: [] }], () => ({})),
    /agg: group.key must be string or finite number/
  );
});

test("std.table.join", () => {
  const left = [
    { id: "a", n: 1 },
    { id: "b", n: 2 },
  ];
  const right = [
    { id: "a", label: "A" },
    { id: "c", label: "C" },
  ];

  const inner = std.table.join(left, right, { leftKey: "id", rightKey: "id" });
  assert.deepEqual(inner.map((r) => Object.fromEntries(Object.entries(r))), [
    { id: "a", n: 1, right_id: "a", label: "A" },
  ]);

  const leftJoin = std.table.join(left, right, { leftKey: "id", rightKey: "id", how: "left" });
  assert.deepEqual(
    leftJoin.map((r) => Object.fromEntries(Object.entries(r))),
    [
      { id: "a", n: 1, right_id: "a", label: "A" },
      { id: "b", n: 2 },
    ]
  );

  const rightCollision = [{ id: "a", n: 999 }];
  const withPrefix = std.table.join(left, rightCollision, { leftKey: "id", rightKey: "id", rightPrefix: "r_" });
  assert.deepEqual(withPrefix.map((r) => Object.fromEntries(Object.entries(r))), [{ id: "a", n: 1, r_id: "a", r_n: 999 }]);

  // Collision after prefixing.
  assert.throws(
    () =>
      std.table.join([{ id: "a", right_id: "already" }], [{ id: "a" }], {
        leftKey: "id",
        rightKey: "id",
      }),
    /join: key collision/
  );

  // Numeric key join (covers numeric key paths).
  const joinedNum = std.table.join([{ id: 1, n: 1 }], [{ id: 1, label: "one" }], { leftKey: "id", rightKey: "id" });
  assert.deepEqual(joinedNum.map((r) => Object.fromEntries(Object.entries(r))), [{ id: 1, n: 1, right_id: 1, label: "one" }]);

  assert.throws(() => std.table.join("nope", right, { leftKey: "id", rightKey: "id" }), /join: expected leftRows array/);
  assert.throws(() => std.table.join(left, "nope", { leftKey: "id", rightKey: "id" }), /join: expected rightRows array/);
  assert.throws(() => std.table.join(left, right, null), /join: expected opts object/);
  assert.throws(() => std.table.join(left, right, { leftKey: "", rightKey: "id" }), /join: expected key string/);
  assert.throws(() => std.table.join([{ id: {} }], right, { leftKey: "id", rightKey: "id" }), /join: left key values must be string or finite number/);
});

test("std.lookup.index / std.lookup.get / std.lookup.xlookup", () => {
  const rows = [
    { code: "A", value: 10 },
    { code: "B", value: 20 },
    { code: "B", value: 21 },
  ];

  const idx = std.lookup.index(rows, "code");
  assert.deepEqual(std.lookup.get(idx, "A"), { code: "A", value: 10 });
  assert.deepEqual(std.lookup.get(idx, "B"), { code: "B", value: 20 });
  assert.throws(() => std.lookup.get(idx, "Z"), /lookup.get: key not found/);

  assert.equal(std.lookup.xlookup("A", rows, "code", "value"), 10);
  assert.equal(std.lookup.xlookup("Z", rows, "code", "value", 0), 0);
  assert.throws(() => std.lookup.xlookup("Z", rows, "code", "value"), /lookup.xlookup: key not found/);

  const nidx = std.lookup.index([{ id: 1, v: "one" }], "id");
  assert.deepEqual(std.lookup.get(nidx, 1), { id: 1, v: "one" });
  assert.throws(() => std.lookup.get(nidx, Number.POSITIVE_INFINITY), /lookup.get: key must be string or finite number/);

  assert.throws(() => std.lookup.index("nope", "code"), /lookup.index: expected rows array/);
  assert.throws(() => std.lookup.index(rows, "__proto__"), /lookup.index: disallowed key/);
  assert.throws(() => std.lookup.get({}, "A"), /lookup.get: invalid index/);
  assert.throws(() => std.lookup.xlookup("A", "nope", "code", "value"), /lookup.xlookup: expected rows array/);
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
