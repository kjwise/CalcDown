#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateProgram, parseProgram } from "../dist/index.js";
import { coerceRowsToTable } from "../dist/data.js";
import { validateViewsFromBlocks } from "../dist/view_contract.js";
import { parseCsv } from "../dist/util/csv.js";

function usage() {
  return [
    "Usage:",
    "  tools/calcdown.js validate <entry.calc.md>",
    "  tools/calcdown.js diff <a.calc.md> <b.calc.md>",
    "  tools/calcdown.js fmt [files...]",
    "",
    "Notes:",
    "  - validate loads front matter `include` recursively (comma-separated).",
    "  - validate verifies external data sources (data.source + data.hash).",
    "  - fmt delegates to tools/fmt_calcdown.js.",
  ].join("\n");
}

function splitCommaList(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function stableSortKeys(value) {
  if (Array.isArray(value)) return value.map(stableSortKeys);
  if (!value || typeof value !== "object") return value;
  const out = Object.create(null);
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const k of keys) out[k] = stableSortKeys(value[k]);
  return out;
}

function stableJson(value) {
  return JSON.stringify(stableSortKeys(value));
}

async function readText(p) {
  return await fs.readFile(p, "utf8");
}

function isHttpUri(uri) {
  return /^https?:\/\//i.test(uri);
}

function sourceFileLabel(uri, baseDir) {
  return isHttpUri(uri) ? uri : path.resolve(baseDir, uri);
}

async function loadUriText(uri, baseDir) {
  if (isHttpUri(uri)) {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  const abs = path.resolve(baseDir, uri);
  return await readText(abs);
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
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

async function loadExternalTable(table, originFile) {
  const source = table.source;
  if (!source) return { rows: null, messages: [] };

  const messages = [];
  const baseDir = path.dirname(originFile);
  const dataFileLabel = sourceFileLabel(source.uri, baseDir);

  let text;
  try {
    text = await loadUriText(source.uri, baseDir);
  } catch (err) {
    messages.push({
      severity: "error",
      code: "CD_DATA_SOURCE_READ",
      message: `Failed to load data source: ${err instanceof Error ? err.message : String(err)}`,
      file: originFile,
      line: table.line,
      blockLang: "data",
      nodeName: table.name,
    });
    return { rows: null, messages };
  }

  const expected = source.hash;
  const expectedHex = expected.startsWith("sha256:") ? expected.slice("sha256:".length) : null;
  const actualHex = sha256Hex(text);

  if (!expectedHex || expectedHex.toLowerCase() !== actualHex.toLowerCase()) {
    messages.push({
      severity: "error",
      code: "CD_DATA_HASH_MISMATCH",
      message: `Hash mismatch for ${source.uri} (expected ${expected}, got sha256:${actualHex})`,
      file: originFile,
      line: table.line,
      blockLang: "data",
      nodeName: table.name,
    });
    return { rows: null, messages };
  }

  let rawRows = [];

  if (source.format === "csv") {
    const { header, rows } = parseCsvRowsToObjects(text);
    const declared = Object.keys(table.columns);
    for (const col of declared) {
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
        const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== "");
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
      return { rows: null, messages };
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
    return { rows: null, messages };
  }

  const coerced = coerceRowsToTable(table.name, table.primaryKey, table.columns, rawRows, {
    baseLine: source.format === "csv" ? 2 : 1,
    blockLang: "data",
    file: dataFileLabel,
  });
  messages.push(...coerced.messages);
  return { rows: coerced.rows, messages };
}

async function loadProject(entryPath) {
  const entryAbs = path.resolve(entryPath);
  const seen = new Set();
  const docs = [];

  async function visit(filePath) {
    const abs = path.resolve(filePath);
    if (seen.has(abs)) return;
    seen.add(abs);

    const markdown = await readText(abs);
    const parsed = parseProgram(markdown);
    docs.push({ file: abs, markdown, parsed });

    const includeRaw = parsed.program.frontMatter?.data?.include;
    const includes = splitCommaList(includeRaw);
    for (const rel of includes) {
      const child = path.resolve(path.dirname(abs), rel);
      await visit(child);
    }
  }

  await visit(entryAbs);
  return docs;
}

function mergeProject(docs) {
  const messages = [];
  const inputs = [];
  const tables = [];
  const nodes = [];
  const blocks = [];

  const origins = new Map();

  function addName(kind, name, file, line) {
    const prev = origins.get(name);
    if (!prev) {
      origins.set(name, { kind, file, line });
      return true;
    }
    messages.push({
      severity: "error",
      code: "CD_NAME_CONFLICT",
      message: `Duplicate name across project: ${name} (also defined as ${prev.kind} in ${prev.file}:${prev.line})`,
      file,
      line,
      nodeName: name,
    });
    return false;
  }

  for (const doc of docs) {
    const file = doc.file;
    const parsed = doc.parsed;
    messages.push(...parsed.messages.map((m) => ({ ...m, file })));

    blocks.push(...parsed.program.blocks);

    for (const inp of parsed.program.inputs) {
      if (!addName("input", inp.name, file, inp.line)) continue;
      inputs.push(inp);
    }
    for (const t of parsed.program.tables) {
      if (!addName("table", t.name, file, t.line)) continue;
      tables.push(t);
    }
    for (const n of parsed.program.nodes) {
      if (!addName("node", n.name, file, n.line)) continue;
      nodes.push(n);
    }
  }

  const frontMatter = docs.length ? docs[0].parsed.program.frontMatter : null;
  return { program: { frontMatter, blocks, inputs, tables, nodes }, messages, origins };
}

async function cmdValidate(entry) {
  const docs = await loadProject(entry);
  const merged = mergeProject(docs);

  const messages = [...merged.messages];
  const tableOrigin = new Map(docs.flatMap((d) => d.parsed.program.tables.map((t) => [t.name, d.file])));

  const overrides = Object.create(null);
  for (const t of merged.program.tables) {
    if (!t.source) continue;
    const origin = tableOrigin.get(t.name) ?? entry;
    const loaded = await loadExternalTable(t, origin);
    messages.push(...loaded.messages);
    if (loaded.rows) overrides[t.name] = loaded.rows;
  }

  const evaluated = evaluateProgram(merged.program, overrides);
  for (const m of evaluated.messages) {
    const nodeName = m && typeof m === "object" ? m.nodeName : undefined;
    const origin = typeof nodeName === "string" ? merged.origins.get(nodeName) : null;
    messages.push({
      ...m,
      ...(origin && origin.file ? { file: origin.file } : {}),
    });
  }

  const viewEntries = [];
  for (const doc of docs) {
    const res = validateViewsFromBlocks(doc.parsed.program.blocks);
    messages.push(...res.messages.map((m) => ({ ...m, file: doc.file })));
    for (const v of res.views) {
      viewEntries.push({ view: v, file: doc.file });
    }
  }

  // Cross-file checks: duplicate ids and unknown sources.
  const viewOrigins = new Map();
  for (const entry of viewEntries) {
    const v = entry.view;
    const origin = { file: entry.file, line: v.line };

    const prev = viewOrigins.get(v.id);
    if (prev) {
      messages.push({
        severity: "error",
        code: "CD_VIEW_DUPLICATE_ID",
        message: `Duplicate view id across project: ${v.id} (also defined in ${prev.file}:${prev.line})`,
        file: origin.file,
        line: origin.line,
        blockLang: "view",
        nodeName: v.id,
      });
      continue;
    }
    viewOrigins.set(v.id, origin);

    if (v.type === "table" || v.type === "chart") {
      const src = v.source;
      const known =
        merged.program.tables.some((t) => t.name === src) || merged.program.nodes.some((n) => n.name === src);
      if (!known) {
        messages.push({
          severity: "error",
          code: "CD_VIEW_UNKNOWN_SOURCE",
          message: `View source does not exist: ${src}`,
          file: origin.file,
          line: origin.line,
          blockLang: "view",
          nodeName: v.id,
        });
      }
    }
  }

  const summary = {
    entry: path.resolve(entry),
    documents: docs.map((d) => path.relative(process.cwd(), d.file)),
    errors: messages.filter((m) => m && typeof m === "object" && m.severity === "error").length,
    warnings: messages.filter((m) => m && typeof m === "object" && m.severity === "warning").length,
  };

  const payload = { summary, messages };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

  if (summary.errors > 0) process.exitCode = 1;
}

function asInputMap(program) {
  const out = Object.create(null);
  for (const i of program.inputs) {
    out[i.name] = { type: i.type.raw, defaultText: i.defaultText };
  }
  return out;
}

function asTableMap(program) {
  const out = Object.create(null);
  for (const t of program.tables) {
    const cols = Object.create(null);
    for (const [k, v] of Object.entries(t.columns)) cols[k] = v.raw;
    out[t.name] = {
      primaryKey: t.primaryKey,
      columns: cols,
      ...(t.source ? { source: t.source } : {}),
      rows: t.rows.length,
    };
  }
  return out;
}

function asNodeMap(program) {
  const out = Object.create(null);
  for (const n of program.nodes) {
    out[n.name] = { expr: n.exprText, deps: n.dependencies };
  }
  return out;
}

function asViewMap(blocks) {
  const res = validateViewsFromBlocks(blocks);
  const out = Object.create(null);
  for (const v of res.views) {
    out[v.id] = v;
  }
  return { views: out, messages: res.messages };
}

function diffMaps(a, b) {
  const added = [];
  const removed = [];
  const changed = [];

  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(b));

  for (const k of bKeys) if (!aKeys.has(k)) added.push(k);
  for (const k of aKeys) if (!bKeys.has(k)) removed.push(k);

  for (const k of aKeys) {
    if (!bKeys.has(k)) continue;
    const av = stableJson(a[k]);
    const bv = stableJson(b[k]);
    if (av !== bv) changed.push(k);
  }

  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed };
}

async function cmdDiff(aPath, bPath) {
  const aDocs = await loadProject(aPath);
  const bDocs = await loadProject(bPath);
  const aMerged = mergeProject(aDocs);
  const bMerged = mergeProject(bDocs);

  const aInputs = asInputMap(aMerged.program);
  const bInputs = asInputMap(bMerged.program);
  const aTables = asTableMap(aMerged.program);
  const bTables = asTableMap(bMerged.program);
  const aNodes = asNodeMap(aMerged.program);
  const bNodes = asNodeMap(bMerged.program);

  const aViewsRes = asViewMap(aMerged.program.blocks);
  const bViewsRes = asViewMap(bMerged.program.blocks);

  const diff = {
    inputs: diffMaps(aInputs, bInputs),
    tables: diffMaps(aTables, bTables),
    nodes: diffMaps(aNodes, bNodes),
    views: diffMaps(aViewsRes.views, bViewsRes.views),
  };

  const payload = {
    a: path.resolve(aPath),
    b: path.resolve(bPath),
    diff,
    warnings: {
      a: aMerged.messages,
      b: bMerged.messages,
      aViews: aViewsRes.messages,
      bViews: bViewsRes.messages,
    },
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function cmdFmt(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const fmtPath = path.join(root, "tools", "fmt_calcdown.js");
  const { spawn } = await import("node:child_process");

  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [fmtPath, ...args], { stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`fmt failed with exit code ${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (cmd === "validate") {
    const entry = args[1];
    if (!entry) throw new Error("validate: missing <entry.calc.md>");
    await cmdValidate(entry);
    return;
  }

  if (cmd === "diff") {
    const a = args[1];
    const b = args[2];
    if (!a || !b) throw new Error("diff: expected <a.calc.md> <b.calc.md>");
    await cmdDiff(a, b);
    return;
  }

  if (cmd === "fmt") {
    await cmdFmt(args.slice(1));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
