import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgram, parseProgram } from "../dist/index.js";

test("CalcScript division-by-zero and upstream error propagation", () => {
  const src = `---\ncalcdown: 0.3\n---\n\n\`\`\`calc\nconst a = 1 / 0;\nconst b = a + 1;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const evaluated = evaluateProgram(parsed.program, {});

  const aErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "a");
  assert.ok(aErr);
  assert.match(aErr.message, /Division by zero/);

  const bErr = evaluated.messages.find((m) => m.severity === "error" && m.nodeName === "b");
  assert.ok(bErr);
  assert.match(bErr.message, /Upstream error in 'a'/);
});

test("CalcScript cannot shadow std in arrow params", () => {
  const src = `---\ncalcdown: 0.3\n---\n\n\`\`\`calc\nconst xs = std.data.sequence(1);\nconst ys = std.data.scan(xs, (std) => std, { seed: 0 });\n\`\`\`\n`;
  const parsed = parseProgram(src);
  assert.ok(parsed.messages.some((m) => m.severity === "error" && /arrow parameter/.test(m.message)));

  const evaluated = evaluateProgram(parsed.program, {});
  assert.ok(evaluated.messages.some((m) => m.severity === "error" && /arrow parameter/.test(m.message)));
});

