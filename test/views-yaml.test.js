import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";
import { parseViewBlock } from "../dist/views.js";

test("view blocks accept YAML (single object)", () => {
  const markdown = `---\ncalcdown: 0.5\n---\n\n\`\`\`view\nid: summary\ntype: cards\nlibrary: calcdown\nspec:\n  title: Summary\n  items:\n    - key: a\n      label: A\n      format: integer\n\`\`\`\n`;
  const parsed = parseProgram(markdown);
  const block = parsed.program.blocks.find((b) => b.lang === "view");
  assert.ok(block);

  const res = parseViewBlock(block);
  assert.equal(res.messages.length, 0);
  assert.equal(res.views.length, 1);
  assert.equal(res.views[0].id, "summary");
  assert.equal(res.views[0].type, "cards");
  assert.equal(res.views[0].library, "calcdown");
  assert.ok(res.views[0].spec && typeof res.views[0].spec === "object");
});

test("view blocks accept YAML (array of objects)", () => {
  const markdown = `---\ncalcdown: 0.5\n---\n\n\`\`\`view\n- id: one\n  type: cards\n  library: calcdown\n  spec:\n    title: One\n    items:\n      - key: a\n- id: two\n  type: table\n  library: calcdown\n  source: rows\n  spec:\n    title: Two\n    columns:\n      - key: x\n        label: X\n\`\`\`\n`;
  const parsed = parseProgram(markdown);
  const block = parsed.program.blocks.find((b) => b.lang === "view");
  assert.ok(block);

  const res = parseViewBlock(block);
  assert.equal(res.messages.length, 0);
  assert.equal(res.views.length, 2);
  assert.equal(res.views[0].id, "one");
  assert.equal(res.views[1].id, "two");
});

test("view blocks reject prototype pollution keys", () => {
  const markdown = `---\ncalcdown: 0.5\n---\n\n\`\`\`view\nid: bad\ntype: cards\nlibrary: calcdown\n__proto__:\n  polluted: true\nspec:\n  items:\n    - key: a\n\`\`\`\n`;
  const parsed = parseProgram(markdown);
  const block = parsed.program.blocks.find((b) => b.lang === "view");
  assert.ok(block);

  const res = parseViewBlock(block);
  assert.ok(res.messages.some((m) => m.severity === "error" && /Disallowed key: __proto__/.test(m.message)));
});
