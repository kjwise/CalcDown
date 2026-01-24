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

test("std.data.last", () => {
  assert.equal(std.data.last([1, 2, 3]), 3);
  assert.throws(() => std.data.last("nope"), /last: expected array/);
  assert.throws(() => std.data.last([]), /last: empty array/);
});

test("std.data.scan", () => {
  const items = [1, 2, 3];
  const sums = std.data.scan(items, (state, item) => state + item, 0);
  assert.deepEqual(sums, [1, 3, 6]);

  const viaSeed = std.data.scan(items, (state, item) => state + item, { seed: 10 });
  assert.deepEqual(viaSeed, [11, 13, 16]);

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

test("std.date.addMonths", () => {
  const d2023 = new Date(Date.UTC(2023, 0, 31));
  assert.equal(iso(std.date.addMonths(d2023, 1)), "2023-02-28");

  const d2024 = new Date(Date.UTC(2024, 0, 31));
  assert.equal(iso(std.date.addMonths(d2024, 1)), "2024-02-29");
  assert.equal(iso(std.date.addMonths(d2024, -1)), "2023-12-31");

  const dMarch = new Date(Date.UTC(2024, 2, 31));
  assert.equal(iso(std.date.addMonths(dMarch, 1)), "2024-04-30");

  assert.throws(() => std.date.addMonths(new Date(Number.NaN), 1), /addMonths: invalid date/);
  assert.throws(() => std.date.addMonths(new Date(Date.UTC(2024, 0, 1)), 1.5), /addMonths: months must be integer/);
  assert.throws(() => std.date.addMonths(new Date(Date.UTC(2024, 0, 1)), Number.POSITIVE_INFINITY), /addMonths: months must be integer/);
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

  // type affects the (1 + rate*type) term
  const pmt0 = std.finance.pmt(rate, nper, pv, 0, 0);
  const pmt1 = std.finance.pmt(rate, nper, pv, 0, 1);
  approxEqual(pmt1, pmt0 / (1 + rate), 1e-12);

  assert.throws(() => std.finance.pmt(Number.NaN, 10, 1), /pmt: invalid arguments/);
  assert.throws(() => std.finance.pmt(0.01, 0, 1), /pmt: nper must be non-zero/);
});

test("std.assert.that", () => {
  std.assert.that(true);
  assert.throws(() => std.assert.that(false), /Assertion failed/);
  assert.throws(() => std.assert.that(false, "nope"), /nope/);
});

