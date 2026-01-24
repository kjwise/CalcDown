#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateProgram, parseProgram } from "../dist/index.js";
import { parseViewBlock } from "../dist/views.js";

function severityCounts(messages) {
  const out = { error: 0, warning: 0, info: 0 };
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const sev = m.severity;
    if (sev === "error") out.error++;
    else if (sev === "warning") out.warning++;
    else out.info++;
  }
  return out;
}

function firstError(messages) {
  return messages.find((m) => m && typeof m === "object" && m.severity === "error") ?? null;
}

function normalizeMessageText(msg) {
  if (!msg || typeof msg !== "object") return "Unknown error";
  const m = msg.message;
  return typeof m === "string" && m.trim() ? m.trim() : "Unknown error";
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const examplesDir = path.join(root, "docs", "examples");
  const outFile = path.join(examplesDir, "compatibility-checklist.md");

  const entries = await fs.readdir(examplesDir, { withFileTypes: true });
  const examples = entries
    .filter((e) => e.isFile() && e.name.endsWith(".calc.md"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const results = [];

  for (const name of examples) {
    const filePath = path.join(examplesDir, name);
    const markdown = await fs.readFile(filePath, "utf8");

    const parsed = parseProgram(markdown);
    const evaluated = evaluateProgram(parsed.program, {});

    const viewMessages = [];
    for (const b of parsed.program.blocks) {
      if (b.lang !== "view") continue;
      const v = parseViewBlock(b);
      viewMessages.push(...v.messages);
    }

    const messages = [...parsed.messages, ...evaluated.messages, ...viewMessages];
    const counts = severityCounts(messages);

    let status;
    if (counts.error > 0) status = "✗ broken";
    else if (counts.warning > 0) status = "⚠ partial";
    else status = "✓ works";

    const note =
      status === "✓ works"
        ? ""
        : status === "⚠ partial"
          ? `(${counts.warning} warning${counts.warning === 1 ? "" : "s"})`
          : (() => {
              const err = firstError(messages);
              return err ? `(${normalizeMessageText(err)})` : "(errors)";
            })();

    results.push({ name, status, note });
  }

  const lines = [];
  lines.push("# Compatibility checklist (examples)");
  lines.push("");
  lines.push("This file tracks whether each `docs/examples/*.calc.md` example parses and evaluates under CalcDown 0.3.");
  lines.push("");
  lines.push("Legend: ✓ works, ⚠ partial (warnings), ✗ broken (errors)");
  lines.push("");

  for (const r of results) {
    lines.push(`- \`${r.name}\` — ${r.status}${r.note ? ` ${r.note}` : ""}`);
  }
  lines.push("");

  await fs.writeFile(outFile, `${lines.join("\n")}`, "utf8");
  process.stdout.write(`Wrote: ${path.relative(root, outFile)}\n`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exitCode = 1;
});

