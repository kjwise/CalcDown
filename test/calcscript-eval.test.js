import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgram, parseProgram } from "../dist/index.js";

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
