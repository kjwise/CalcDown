import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("fmt handles indented closing fences and fence-like content lines", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tool = path.join(root, "tools", "fmt_calcdown.js");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "calcdown-fmt-"));
  const file = path.join(dir, "example.calc.md");

  const before = `# Example

- Item

  \`\`\`calc
  const x = 1;
  \`\`\`not a fence
  const y = 2;
  \`\`\`

After.
`;

  await fs.writeFile(file, before, "utf8");

  const res = spawnSync(process.execPath, [tool, file], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout || "fmt exited non-zero");

  const after = await fs.readFile(file, "utf8");
  assert.ok(after.includes("```not a fence"), "expected fence-like content to be preserved");
  assert.ok(after.includes("\nAfter."), "expected trailing content after the code fence to be preserved");

  const lines = after.split(/\r?\n/);
  const openIdx = lines.findIndex((l) => /^\s*```+\s+calc\b/.test(l));
  assert.ok(openIdx !== -1, "expected a calc fence opener");

  const closeRel = lines.slice(openIdx + 1).findIndex((l) => /^\s*```+\s*$/.test(l));
  assert.ok(closeRel !== -1, "expected a fence closer");
  const closeIdx = openIdx + 1 + closeRel;

  const blockContent = lines.slice(openIdx + 1, closeIdx).join("\n");
  assert.ok(blockContent.includes("```not a fence"), "expected fence-like line to remain inside the fenced block");
  assert.ok(blockContent.includes("const y = 2;"), "expected content after fence-like line to remain inside the fenced block");

  const afterFence = lines.slice(closeIdx + 1).join("\n");
  assert.ok(afterFence.includes("After."), "expected 'After.' to remain outside the fenced block");
});

