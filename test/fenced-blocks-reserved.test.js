import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";

test("fenced code blocks are reserved for CalcDown (missing lang)", () => {
  const markdown = "---\ncalcdown: 0.9\n---\n\n```\nhello\n```\n";
  const res = parseProgram(markdown);
  assert.ok(res.messages.some((m) => m.severity === "error" && m.code === "CD_BLOCK_MISSING_LANG"));
});

test("fenced code blocks are reserved for CalcDown (unknown lang)", () => {
  const markdown = "---\ncalcdown: 0.9\n---\n\n```js\nconsole.log(1)\n```\n";
  const res = parseProgram(markdown);
  assert.ok(res.messages.some((m) => m.severity === "error" && m.code === "CD_BLOCK_UNKNOWN_LANG"));
});

