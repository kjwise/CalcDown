#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateProgram, parseProgram } from "../dist/index.js";
import crypto from "node:crypto";

import { coerceRowsToTable } from "../dist/data.js";
import { validateViewsFromBlocks } from "../dist/view_contract.js";
import { parseCsv } from "../dist/util/csv.js";
import { CURRENT_CALCDOWN_VERSION } from "./version.js";

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

function sha256Hex(text) {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function isHttpUri(uri) {
  return /^https?:\/\//i.test(uri);
}

async function loadUriText(uri, baseDir) {
  if (isHttpUri(uri)) {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  const abs = path.resolve(baseDir, uri);
  return await fs.readFile(abs, "utf8");
}

function sourceFileLabel(uri, baseDir) {
  return isHttpUri(uri) ? uri : path.resolve(baseDir, uri);
}

function parseCsvRowsToObjects(csvText) {
  const parsed = parseCsv(csvText);
  if (!parsed.header.length) return { header: [], rows: [] };

  const header = parsed.header;
  const rows = [];
  for (const row of parsed.rows) {
    const obj = Object.create(null);
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      if (!key) continue;
      obj[key] = row[i] ?? "";
    }
    rows.push(obj);
  }
  return { header, rows };
}

function csvCellToTyped(type, raw) {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw);
  if (!text) return undefined;
  const t = type?.name ?? "string";

  if (t === "string") return text;
  if (t === "date" || t === "datetime") return text;

  if (t === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "1") return true;
    if (text === "0") return false;
    return text;
  }

  if (t === "integer") {
    const n = Number(text);
    return Number.isFinite(n) ? Math.trunc(n) : text;
  }

  if (t === "number" || t === "decimal" || t === "percent" || t === "currency") {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }

  return text;
}

async function loadExternalTablesForProgram(program, originFile) {
  const overrides = Object.create(null);
  const messages = [];

  for (const table of program.tables) {
    const source = table.source;
    if (!source) continue;

    const baseDir = path.dirname(originFile);
    const dataFileLabel = sourceFileLabel(source.uri, baseDir);

    let text;
    try {
      text = await loadUriText(source.uri, baseDir);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_DATA_SOURCE_READ",
        message: `Failed to read data source: ${err instanceof Error ? err.message : String(err)}`,
        file: originFile,
        line: table.line,
        blockLang: "data",
        nodeName: table.name,
      });
      continue;
    }

    const expectedHex = source.hash.startsWith("sha256:") ? source.hash.slice("sha256:".length) : null;
    const actualHex = sha256Hex(text);
    if (!expectedHex || expectedHex.toLowerCase() !== actualHex.toLowerCase()) {
      messages.push({
        severity: "error",
        code: "CD_DATA_HASH_MISMATCH",
        message: `Hash mismatch for ${source.uri} (expected ${source.hash}, got sha256:${actualHex})`,
        file: originFile,
        line: table.line,
        blockLang: "data",
        nodeName: table.name,
      });
      continue;
    }

    let rawRows = [];

    if (source.format === "csv") {
      const { header, rows } = parseCsvRowsToObjects(text);
      for (const col of Object.keys(table.columns)) {
        if (!header.includes(col)) {
          messages.push({
            severity: "error",
            code: "CD_DATA_CSV_MISSING_COLUMN",
            message: `CSV source is missing declared column: ${col}`,
            file: dataFileLabel,
            line: 1,
            blockLang: "data",
            nodeName: table.name,
          });
        }
      }
      rawRows = rows.map((r) => {
        const out = Object.create(null);
        for (const [k, v] of Object.entries(r)) {
          const type = table.columns[k];
          out[k] = type ? csvCellToTyped(type, v) : v;
        }
        return out;
      });
    } else if (source.format === "json") {
      const trimmed = text.trim();
      try {
        if (trimmed.startsWith("[")) {
          const arr = JSON.parse(trimmed);
          if (!Array.isArray(arr)) throw new Error("Expected JSON array");
          rawRows = arr;
        } else {
          const lines = trimmed.split(/\\r?\\n/).filter((l) => l.trim() !== "");
          rawRows = lines.map((l) => JSON.parse(l));
        }
      } catch (err) {
        messages.push({
          severity: "error",
          code: "CD_DATA_JSON_PARSE",
          message: err instanceof Error ? err.message : String(err),
          file: dataFileLabel,
          line: 1,
          blockLang: "data",
          nodeName: table.name,
        });
        continue;
      }
    } else {
      messages.push({
        severity: "error",
        code: "CD_DATA_FORMAT",
        message: `Unsupported data source format: ${source.format}`,
        file: originFile,
        line: table.line,
        blockLang: "data",
        nodeName: table.name,
      });
      continue;
    }

    const coerced = coerceRowsToTable(table.name, table.primaryKey, table.columns, rawRows, {
      baseLine: source.format === "csv" ? 2 : 1,
      blockLang: "data",
      file: dataFileLabel,
    });
    messages.push(...coerced.messages);
    overrides[table.name] = coerced.rows;
  }

  return { overrides, messages };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const check = args.includes("--check");

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
    const external = await loadExternalTablesForProgram(parsed.program, filePath);
    const evaluated = evaluateProgram(parsed.program, external.overrides);

    const viewRes = validateViewsFromBlocks(parsed.program.blocks);
    const viewMessages = viewRes.messages;

    const messages = [...parsed.messages, ...external.messages, ...evaluated.messages, ...viewMessages];
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
  lines.push(
    `This file tracks whether each \`docs/examples/*.calc.md\` example parses and evaluates under CalcDown ${CURRENT_CALCDOWN_VERSION}.`
  );
  lines.push("");
  lines.push("Legend: ✓ works, ⚠ partial (warnings), ✗ broken (errors)");
  lines.push("");

  for (const r of results) {
    lines.push(`- \`${r.name}\` — ${r.status}${r.note ? ` ${r.note}` : ""}`);
  }
  lines.push("");

  const next = `${lines.join("\n")}`;

  if (check) {
    let current = null;
    try {
      current = await fs.readFile(outFile, "utf8");
    } catch {
      current = null;
    }
    if (current !== next) {
      process.stdout.write(`Out of date: ${path.relative(root, outFile)}\n`);
      process.stdout.write("Run: node tools/check_examples.js\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`OK: ${path.relative(root, outFile)}\n`);
    return;
  }

  await fs.writeFile(outFile, next, "utf8");
  process.stdout.write(`Wrote: ${path.relative(root, outFile)}\n`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exitCode = 1;
});
