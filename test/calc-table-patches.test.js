import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgram, parseProgram } from "../dist/index.js";

test("CalcScript table patches update inline data tables (index + primaryKey)", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`inputs\na : number = 1\n\`\`\`\n\n\`\`\`data\nname: t\nprimaryKey: id\ncolumns:\n  id: string\n  x: number\n---\n{\"id\":\"r1\",\"x\":0}\n{\"id\":\"r2\",\"x\":0}\n\`\`\`\n\n\`\`\`calc\nconst y = a + 1;\n\n# Not a comment in calc blocks, but should be ignored by patch parser.\n\nt[1].x = y;\nt[2].x = y;\nt[\"r2\"].x = a + 10;\n\`\`\`\n`;

  const parsed = parseProgram(src);
  assert.deepEqual(parsed.messages, []);

  const evaluated = evaluateProgram(parsed.program, {});

  const positionalWarnings = evaluated.messages.filter((m) => m.severity === "warning" && m.code === "CD_CALC_PATCH_POSITIONAL");
  assert.equal(positionalWarnings.length, 1);

  const rows = evaluated.values.t;
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.x, 2);
  assert.equal(rows[1]?.x, 11);
});

test("CalcScript table patch errors include unknown targets/columns", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`data\nname: t\nprimaryKey: id\ncolumns:\n  id: string\n  x: number\n---\n{\"id\":\"r1\",\"x\":0}\n\`\`\`\n\n\`\`\`calc\nmissing[1].x = 1;\nt[1].y = 2;\nt[1].id = \"no\";\n\`\`\`\n`;

  const parsed = parseProgram(src);
  assert.deepEqual(parsed.messages, []);

  const evaluated = evaluateProgram(parsed.program, {});
  const codes = new Set(evaluated.messages.filter((m) => m.severity === "error").map((m) => m.code));
  assert.ok(codes.has("CD_CALC_PATCH_UNKNOWN_TABLE"));
  assert.ok(codes.has("CD_CALC_PATCH_UNKNOWN_COLUMN"));
  assert.ok(codes.has("CD_CALC_PATCH_PRIMARYKEY"));
});

test("CalcScript table patch selector parsing errors surface cleanly", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`data\nname: t\nprimaryKey: id\ncolumns:\n  id: string\n  x: number\n---\n{\"id\":\"r1\",\"x\":0}\n\`\`\`\n\n\`\`\`calc\nt[bad].x = 1;\n\`\`\`\n`;

  const parsed = parseProgram(src);
  assert.deepEqual(parsed.messages, []);

  const evaluated = evaluateProgram(parsed.program, {});
  const err = evaluated.messages.find((m) => m.severity === "error" && m.code === "CD_CALC_PATCH_INVALID_SELECTOR");
  assert.ok(err);
});

