import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgram, parseProgram } from "../dist/index.js";

test("CalcScript '&' concatenation (scalar/array) and precedence", () => {
  const src = `---\ncalcdown: 0.7\n---\n\n\`\`\`calc\nconst a = "A" & 1 + 2;\nconst xs = std.data.sequence(3);\nconst ys = std.text.concat("X", xs);\nconst zs = ys & "-";\nconst ws = ys & std.text.concat("Y", xs);\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  assert.equal(evaluated.values.a, "A3");
  assert.deepEqual(evaluated.values.ys, ["X1", "X2", "X3"]);
  assert.deepEqual(evaluated.values.zs, ["X1-", "X2-", "X3-"]);
  assert.deepEqual(evaluated.values.ws, ["X1Y1", "X2Y2", "X3Y3"]);
});

test("CalcScript column projection + numeric vectorization", () => {
  const src = `---\ncalcdown: 0.7\n---\n\n\`\`\`data\nname: items\nprimaryKey: id\ncolumns:\n  id: string\n  qty: integer\n  unit_price: number\n---\n{\"id\":\"a\",\"qty\":2,\"unit_price\":10}\n{\"id\":\"b\",\"qty\":1,\"unit_price\":5}\n\`\`\`\n\n\`\`\`calc\nconst qty = items.qty;\nconst prices = items.unit_price;\nconst totals = qty * prices;\nconst subtotal = std.math.sum(totals);\nconst doubled = totals * 2;\nconst neg = -qty;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  assert.deepEqual(evaluated.values.qty, [2, 1]);
  assert.deepEqual(evaluated.values.prices, [10, 5]);
  assert.deepEqual(evaluated.values.totals, [20, 5]);
  assert.equal(evaluated.values.subtotal, 25);
  assert.deepEqual(evaluated.values.doubled, [40, 10]);
  assert.deepEqual(evaluated.values.neg, [-2, -1]);
});

test("CalcScript column projection reports missing keys with row index", () => {
  const src = `---\ncalcdown: 0.7\n---\n\n\`\`\`data\nname: items\nprimaryKey: id\ncolumns:\n  id: string\n  qty: integer\n  unit_price: number\n---\n{\"id\":\"a\",\"qty\":2,\"unit_price\":10}\n{\"id\":\"b\",\"qty\":1}\n\`\`\`\n\n\`\`\`calc\nconst bad = items.unit_price;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const err = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "bad");
  assert.ok(err);
  assert.equal(err.code, "CD_CALC_UNKNOWN_PROPERTY");
  assert.match(err.message, /Row 1:/);
  assert.match(err.message, /Unknown property: unit_price/);
});

test("CalcScript vector length mismatch errors and propagates", () => {
  const src = `---\ncalcdown: 0.7\n---\n\n\`\`\`calc\nconst a = std.data.sequence(2);\nconst b = std.data.sequence(3);\nconst bad = a + b;\nconst after = bad + 1;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const badErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "bad");
  assert.ok(badErr);
  assert.equal(badErr.code, "CD_CALC_EVAL");
  assert.match(badErr.message, /Vector length mismatch/);

  const afterErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "after");
  assert.ok(afterErr);
  assert.equal(afterErr.code, "CD_CALC_UPSTREAM_ERROR");
});

test("data.sortBy orders table rows deterministically", () => {
  const src = `---\ncalcdown: 0.7\n---\n\n\`\`\`data\nname: t\nprimaryKey: id\nsortBy: n\ncolumns:\n  id: string\n  n: integer\n---\n{\"id\":\"a\",\"n\":2}\n{\"id\":\"b\",\"n\":1}\n{\"id\":\"c\",\"n\":2}\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const rows = evaluated.values.t;
  assert.ok(Array.isArray(rows));
  assert.deepEqual(rows.map((r) => r.id), ["b", "a", "c"]);
});

test("CalcScript '&' errors on vector length mismatch", () => {
  const src = `---\ncalcdown: 0.7\n---\n\n\`\`\`calc\nconst a = std.text.concat("A", std.data.sequence(2));\nconst b = std.text.concat("B", std.data.sequence(3));\nconst bad = a & b;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const badErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "bad");
  assert.ok(badErr);
  assert.equal(badErr.code, "CD_CALC_EVAL");
  assert.match(badErr.message, /vector length mismatch/);
});

test("CalcScript division-by-zero and upstream error propagation", () => {
  const src = `---\ncalcdown: 0.5\n---\n\n\`\`\`calc\nconst a = 1 / 0;\nconst b = a + 1;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const aErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "a");
  assert.ok(aErr);
  assert.equal(aErr.code, "CD_CALC_DIV_ZERO");
  assert.match(aErr.message, /Division by zero/);

  const bErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "b");
  assert.ok(bErr);
  assert.equal(bErr.code, "CD_CALC_UPSTREAM_ERROR");
  assert.match(bErr.message, /Upstream error in 'a'/);
});

test("CalcScript cannot shadow std in arrow params", () => {
  const src = `---\ncalcdown: 0.5\n---\n\n\`\`\`calc\nconst xs = std.data.sequence(1);\nconst ys = std.data.scan(xs, (std) => std, { seed: 0 });\n\`\`\`\n`;
  const parsed = parseProgram(src);
  assert.ok(parsed.messages.some((m) => m.severity === "error" && /arrow parameter/.test(m.message)));

  const evaluated = evaluateProgram(parsed.program, {});
  assert.ok(evaluated.messages.some((m) => m.severity === "error" && /arrow parameter/.test(m.message)));
});

test("CalcScript errors on non-finite numeric results", () => {
  const src = `---\ncalcdown: 0.5\n---\n\n\`\`\`calc\nconst a = 1e308 * 1e308;\nconst b = a + 1;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const aErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "a");
  assert.ok(aErr);
  assert.equal(aErr.code, "CD_CALC_NONFINITE");
  assert.match(aErr.message, /Non-finite numeric result/);

  const bErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "b");
  assert.ok(bErr);
  assert.equal(bErr.code, "CD_CALC_UPSTREAM_ERROR");
});

test("CalcScript member access is own-properties only", () => {
  const src = `---\ncalcdown: 0.5\n---\n\n\`\`\`calc\nconst xs = std.data.sequence(3);\nconst n = xs.length;\nconst bad = xs.map;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  assert.equal(evaluated.values.n, 3);
  const badErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "bad");
  assert.ok(badErr);
  assert.equal(badErr.code, "CD_CALC_UNKNOWN_PROPERTY");
  assert.match(badErr.message, /Unknown property: map/);
});
