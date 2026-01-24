import assert from "node:assert/strict";
import { test } from "node:test";

import { addMonthsUTC, formatIsoDate, parseIsoDate } from "../dist/util/date.js";

function iso(date) {
  assert.ok(date instanceof Date);
  return date.toISOString().slice(0, 10);
}

test("parseIsoDate", () => {
  assert.equal(iso(parseIsoDate("2024-01-02")), "2024-01-02");
  assert.throws(() => parseIsoDate("2024/01/02"), /Invalid date \(expected YYYY-MM-DD\):/);
  assert.throws(() => parseIsoDate("2024-02-30"), /Invalid calendar date:/);
});

test("formatIsoDate", () => {
  assert.equal(formatIsoDate(new Date(Date.UTC(2024, 0, 2))), "2024-01-02");
  assert.equal(formatIsoDate(new Date(Date.UTC(999, 8, 9))), "0999-09-09");
});

test("addMonthsUTC", () => {
  assert.equal(iso(addMonthsUTC(new Date(Date.UTC(2024, 0, 31)), 1)), "2024-02-29");
  assert.equal(iso(addMonthsUTC(new Date(Date.UTC(2023, 0, 31)), 1)), "2023-02-28");
  assert.equal(iso(addMonthsUTC(new Date(Date.UTC(2024, 2, 31)), 1)), "2024-04-30");
  assert.equal(iso(addMonthsUTC(new Date(Date.UTC(2024, 2, 31)), -1)), "2024-02-29");
});
