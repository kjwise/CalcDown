import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";
import { validateViewsFromBlocks } from "../dist/view_contract.js";
import { formatFormattedValue, formatValue } from "../dist/web/format.js";

test("formatValue: year-like integers do not use grouping separators", () => {
  const out = formatValue(2004);
  assert.match(out, /^\p{Number}{4}$/u);
});

test("formatFormattedValue: integer years do not use grouping separators", () => {
  const out = formatFormattedValue(2025, "integer");
  assert.match(out, /^\p{Number}{4}$/u);
});

test("formatFormattedValue: percent scale formats ratio values", () => {
  const out = formatFormattedValue(0.13, { kind: "percent", scale: 100, digits: 0 });
  assert.match(out, /^\p{Number}{2}%$/u);
});

test("formatFormattedValue: percent01 formats ratio values", () => {
  const out = formatFormattedValue(0.13, "percent01");
  assert.match(out, /^\p{Number}{2}%$/u);
});

test("view formats accept percent01 and percent scale", () => {
  const markdown =
    `---\ncalcdown: 0.9\n---\n\n` +
    "```view\n" +
    JSON.stringify(
      {
        id: "v",
        type: "cards",
        library: "calcdown",
        spec: {
          items: [
            { key: "a", format: "percent01" },
            { key: "b", format: { kind: "percent", scale: 100 } },
          ],
        },
      },
      null,
      2
    ) +
    "\n```\n";

  const parsed = parseProgram(markdown);
  const validated = validateViewsFromBlocks(parsed.program.blocks);
  assert.deepEqual(validated.messages, []);
});

