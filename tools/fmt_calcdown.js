#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JSON_SCHEMA, load as yamlLoad } from "js-yaml";

function stripInlineComment(raw) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === `"` && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "#" && !inSingle && !inDouble) {
      return { code: raw.slice(0, i), comment: raw.slice(i + 1) };
    }
  }
  return { code: raw, comment: null };
}

function stableSortKeys(value) {
  if (Array.isArray(value)) return value.map(stableSortKeys);
  if (!value || typeof value !== "object") return value;

  const out = Object.create(null);
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    out[k] = stableSortKeys(value[k]);
  }
  return out;
}

function stableJson(value) {
  return JSON.stringify(stableSortKeys(value), null, 2);
}

function formatInputsBlock(content) {
  const lines = content.split(/\r?\n/);
  const parsed = [];
  let maxName = 0;
  let maxType = 0;

  const inputRe = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)\s*=\s*(.+)$/;

  for (const line of lines) {
    const raw = line ?? "";
    const trimmed = raw.trimEnd();
    const t = trimmed.trim();
    if (!t) {
      parsed.push({ kind: "blank", raw: "" });
      continue;
    }
    if (t.startsWith("#")) {
      parsed.push({ kind: "raw", raw: trimmed });
      continue;
    }

    const { code, comment } = stripInlineComment(trimmed);
    const m = code.trim().match(inputRe);
    if (!m) {
      parsed.push({ kind: "raw", raw: trimmed });
      continue;
    }

    const name = m[1];
    const type = m[2];
    const def = (m[3] ?? "").trim();
    if (name.length > maxName) maxName = name.length;
    if (type.length > maxType) maxType = type.length;
    parsed.push({
      kind: "input",
      name,
      type,
      def,
      comment: comment ? comment.trim() : null,
    });
  }

  const out = [];
  for (const item of parsed) {
    if (item.kind !== "input") {
      out.push(item.raw);
      continue;
    }
    let line = `${item.name.padEnd(maxName)} : ${item.type.padEnd(maxType)} = ${item.def}`;
    if (item.comment) line += `  # ${item.comment}`;
    out.push(line);
  }
  return out.join("\n").trimEnd();
}

function formatDataBlock(content) {
  const lines = content.split(/\r?\n/).map((l) => (l ?? "").trimEnd());
  const sepIdx = lines.findIndex((l) => l.trim() === "---");
  if (sepIdx === -1) return content.trimEnd();

  const headerLines = lines.slice(0, sepIdx);
  const rowLines = lines.slice(sepIdx + 1);

  let name = null;
  let primaryKey = null;
  let source = null;
  let format = null;
  let hash = null;
  const columns = [];
  const extras = [];

  for (let i = 0; i < headerLines.length; i++) {
    const raw = headerLines[i] ?? "";
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;

    if (t.startsWith("name:")) {
      name = t.slice("name:".length).trim() || null;
      continue;
    }
    if (t.startsWith("primaryKey:")) {
      primaryKey = t.slice("primaryKey:".length).trim() || null;
      continue;
    }
    if (t.startsWith("source:")) {
      source = t.slice("source:".length).trim() || null;
      continue;
    }
    if (t.startsWith("format:")) {
      format = t.slice("format:".length).trim() || null;
      continue;
    }
    if (t.startsWith("hash:")) {
      hash = t.slice("hash:".length).trim() || null;
      continue;
    }
    if (t.startsWith("columns:")) {
      for (i = i + 1; i < headerLines.length; i++) {
        const rawCol = headerLines[i] ?? "";
        const trimmedCol = rawCol.trim();
        if (!trimmedCol || trimmedCol.startsWith("#")) continue;
        if (!rawCol.startsWith(" ") && !rawCol.startsWith("\t")) {
          i = i - 1;
          break;
        }
        const m = trimmedCol.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
        if (!m) continue;
        const colName = m[1];
        const typeRaw = (m[2] ?? "").trim();
        columns.push({ colName, typeRaw });
      }
      continue;
    }

    extras.push(t);
  }

  const out = [];
  if (name) out.push(`name: ${name}`);
  if (primaryKey) out.push(`primaryKey: ${primaryKey}`);
  if (source) out.push(`source: ${source}`);
  if (format) out.push(`format: ${format}`);
  if (hash) out.push(`hash: ${hash}`);
  for (const extra of extras) out.push(extra);
  out.push("columns:");
  for (const c of columns) out.push(`  ${c.colName}: ${c.typeRaw}`);
  out.push("---");

  for (const row of rowLines) {
    const t = (row ?? "").trim();
    if (!t) {
      out.push("");
      continue;
    }
    out.push(t);
  }

  return out.join("\n").trimEnd();
}

function formatViewBlock(content) {
  const raw = content.trim();
  if (!raw) return "";

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = yamlLoad(raw, { schema: JSON_SCHEMA, maxAliasCount: 50 });
  }

  return stableJson(value);
}

function isClosingFenceLine(line, fence) {
  const raw = line ?? "";
  const trimmedLeft = raw.trimStart();
  if (!trimmedLeft) return false;
  const fenceChar = fence[0];
  if (!fenceChar) return false;
  if (trimmedLeft[0] !== fenceChar) return false;

  let count = 0;
  while (count < trimmedLeft.length && trimmedLeft[count] === fenceChar) count++;
  if (count < fence.length) return false;

  for (let i = count; i < trimmedLeft.length; i++) {
    const ch = trimmedLeft[i];
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function parseFencedBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const open = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!open) {
      out.push({ kind: "text", line });
      i++;
      continue;
    }

    const indent = open[1] ?? "";
    const fence = open[2] ?? "```";
    const info = (open[3] ?? "").trimEnd();
    const lang = info.trim().split(/\s+/)[0] ?? "";
    i++;

    const contentLines = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (isClosingFenceLine(l, fence)) {
        i++;
        break;
      }
      contentLines.push(l);
      i++;
    }

    out.push({ kind: "code", indent, fence, info, lang, content: contentLines.join("\n") });
  }

  return out;
}

function formatMarkdown(markdown) {
  const parts = parseFencedBlocks(markdown);
  const outLines = [];

  for (const p of parts) {
    if (p.kind === "text") {
      outLines.push(p.line.trimEnd());
      continue;
    }

    outLines.push(`${p.indent}${p.fence}${p.info ? ` ${p.info.trim()}` : ""}`.trimEnd());

    let nextContent = p.content;
    if (p.lang === "inputs") nextContent = formatInputsBlock(p.content);
    if (p.lang === "data") nextContent = formatDataBlock(p.content);
    if (p.lang === "view") nextContent = formatViewBlock(p.content);

    if (nextContent) {
      outLines.push(...nextContent.split("\n").map((l) => l.trimEnd()));
    }

    outLines.push(`${p.indent}${p.fence}`);
  }

  return `${outLines.join("\n").trimEnd()}\n`;
}

async function listDefaultFiles(root) {
  const dir = path.join(root, "docs", "examples");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".calc.md"))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const files = args.length ? args.map((p) => path.resolve(root, p)) : await listDefaultFiles(root);

  let changed = 0;
  for (const filePath of files) {
    const before = await fs.readFile(filePath, "utf8");
    const after = formatMarkdown(before);
    if (after !== before) {
      await fs.writeFile(filePath, after, "utf8");
      changed++;
    }
  }

  process.stdout.write(`Formatted ${files.length} file(s), changed ${changed}.\n`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exitCode = 1;
});
