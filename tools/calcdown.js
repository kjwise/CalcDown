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
    "  tools/calcdown.js validate <entry.calc.md|calcdown.json> [--lock calcdown.lock.json]",
    "  tools/calcdown.js diff <a.calc.md> <b.calc.md>",
    "  tools/calcdown.js lock <entry.calc.md|calcdown.json> [out.lock.json]",
    "  tools/calcdown.js export <entry.calc.md|calcdown.json> [--out out.json] [--lock calcdown.lock.json]",
    "  tools/calcdown.js fmt [files...]",
    "",
    "Notes:",
    "  - validate loads front matter `include` recursively (comma-separated).",
    "  - validate verifies external data sources (data.source + data.hash).",
    "  - validate can also check a lock file (--lock) or manifest.lock.",
    "  - lock writes a deterministic lock file for docs + external data sources.",
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
  if (value instanceof Date) return value.toISOString();
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

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isHttpUri(uri) {
  return /^https?:\/\//i.test(uri);
}

function sourceFileLabel(uri, baseDir) {
  return isHttpUri(uri) ? uri : path.resolve(baseDir, uri);
}

function projectRelative(p) {
  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : p;
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

function normalizeIncludeList(raw) {
  if (typeof raw === "string") return splitCommaList(raw);
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  return [];
}

async function tryLoadManifest(entryPath) {
  if (!entryPath.toLowerCase().endsWith(".json")) return null;
  let text;
  try {
    text = await readText(entryPath);
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(data)) return null;
  if (typeof data.entry !== "string" || !data.entry.trim()) return null;
  return { file: entryPath, data };
}

async function resolveEntry(entryArg) {
  const abs = path.resolve(entryArg);
  const manifest = await tryLoadManifest(abs);
  if (!manifest) {
    return { kind: "doc", entryAbs: abs, manifestAbs: null, baseDir: path.dirname(abs), extraDocAbs: [], lockAbs: null };
  }

  const baseDir = path.dirname(manifest.file);
  const entryAbs = path.resolve(baseDir, manifest.data.entry.trim());
  const extra = normalizeIncludeList(manifest.data.include).map((p) => path.resolve(baseDir, p));
  const lockRaw = typeof manifest.data.lock === "string" ? manifest.data.lock.trim() : "";
  const lockAbs = lockRaw ? path.resolve(baseDir, lockRaw) : null;
  return { kind: "manifest", entryAbs, manifestAbs: manifest.file, baseDir, extraDocAbs: extra, lockAbs };
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

async function loadProject(entryArg) {
  const resolved = await resolveEntry(entryArg);
  const entryAbs = resolved.entryAbs;
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
    const includes = normalizeIncludeList(includeRaw);
    for (const rel of includes) {
      const child = path.resolve(path.dirname(abs), rel);
      await visit(child);
    }
  }

  await visit(entryAbs);
  for (const extra of resolved.extraDocAbs ?? []) {
    await visit(extra);
  }
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

function stableJsonPretty(value) {
  return JSON.stringify(stableSortKeys(value), null, 2);
}

async function readLockFile(lockPath) {
  const abs = path.resolve(lockPath);
  const raw = await readText(abs);
  const data = JSON.parse(raw);
  if (!isPlainObject(data)) throw new Error("Lock file must be a JSON object");
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const hasDataSources = Object.prototype.hasOwnProperty.call(data, "dataSources");
  const dataSources = Array.isArray(data.dataSources) ? data.dataSources : [];
  return { abs, data, documents, dataSources, hasDataSources };
}

async function checkLock({ lockPath, docs, merged, tableOrigin }) {
  const messages = [];

  let lock;
  try {
    lock = await readLockFile(lockPath);
  } catch (err) {
    messages.push({
      severity: "error",
      code: "CD_LOCK_READ",
      message: `Failed to read lock file: ${err instanceof Error ? err.message : String(err)}`,
      file: path.resolve(lockPath),
    });
    return { messages };
  }

  const lockDocs = [];
  for (const d of lock.documents) {
    if (!isPlainObject(d)) continue;
    if (typeof d.path !== "string" || !d.path.trim()) continue;
    if (typeof d.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(d.sha256)) continue;
    lockDocs.push({ path: d.path.trim(), sha256: d.sha256.toLowerCase() });
  }

  const currentDocs = docs.map((d) => ({ rel: projectRelative(d.file), sha256: sha256Hex(d.markdown) }));
  const currentDocMap = new Map(currentDocs.map((d) => [d.rel, d.sha256]));
  const currentDocSet = new Set(currentDocs.map((d) => d.rel));
  const lockDocSet = new Set(lockDocs.map((d) => d.path));

  for (const ld of lockDocs) {
    const actual = currentDocMap.get(ld.path);
    if (!actual) {
      messages.push({
        severity: "error",
        code: "CD_LOCK_DOC_MISSING",
        message: `Lock file references missing document: ${ld.path}`,
        file: lock.abs,
      });
      continue;
    }
    if (actual.toLowerCase() !== ld.sha256) {
      messages.push({
        severity: "error",
        code: "CD_LOCK_DOC_HASH_MISMATCH",
        message: `Document changed since lock: ${ld.path}`,
        file: lock.abs,
      });
    }
  }

  for (const rel of currentDocSet) {
    if (lockDocSet.has(rel)) continue;
    messages.push({
      severity: "error",
      code: "CD_LOCK_DOC_EXTRA",
      message: `Document not present in lock: ${rel}`,
      file: lock.abs,
    });
  }

  if (!lock.hasDataSources) {
    return { messages };
  }

  const lockSources = [];
  for (const s of lock.dataSources) {
    if (!isPlainObject(s)) continue;
    if (typeof s.table !== "string" || !s.table.trim()) continue;
    if (typeof s.source !== "string" || !s.source.trim()) continue;
    if (typeof s.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(s.sha256)) continue;
    const format = typeof s.format === "string" ? s.format : null;
    lockSources.push({ table: s.table.trim(), source: s.source.trim(), sha256: s.sha256.toLowerCase(), format });
  }

  const currentSources = [];
  for (const t of merged.program.tables) {
    if (!t.source) continue;
    const origin = tableOrigin.get(t.name) ?? docs[0]?.file ?? process.cwd();
    const baseDir = path.dirname(origin);
    const resolvedLabel = isHttpUri(t.source.uri) ? t.source.uri : projectRelative(path.resolve(baseDir, t.source.uri));
    currentSources.push({
      table: t.name,
      source: resolvedLabel,
      uri: t.source.uri,
      format: t.source.format,
      originFile: origin,
      baseDir,
    });
  }

  const currentSourceMap = new Map(currentSources.map((s) => [`${s.table}::${s.source}`, s]));
  const currentSourceSet = new Set(currentSources.map((s) => `${s.table}::${s.source}`));
  const lockSourceSet = new Set(lockSources.map((s) => `${s.table}::${s.source}`));

  for (const ls of lockSources) {
    const cur = currentSourceMap.get(`${ls.table}::${ls.source}`);
    if (!cur) {
      messages.push({
        severity: "error",
        code: "CD_LOCK_SOURCE_MISSING",
        message: `Lock file references missing data source: ${ls.table} -> ${ls.source}`,
        file: lock.abs,
      });
      continue;
    }
    let text;
    try {
      text = await loadUriText(cur.uri, cur.baseDir);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_LOCK_SOURCE_READ",
        message: `Failed to load data source for lock check: ${ls.source} (${err instanceof Error ? err.message : String(err)})`,
        file: lock.abs,
      });
      continue;
    }
    const actual = sha256Hex(text);
    if (actual.toLowerCase() !== ls.sha256) {
      messages.push({
        severity: "error",
        code: "CD_LOCK_SOURCE_HASH_MISMATCH",
        message: `Data source changed since lock: ${ls.source}`,
        file: lock.abs,
      });
    }
  }

  for (const key of currentSourceSet) {
    if (lockSourceSet.has(key)) continue;
    const [tableName, sourceLabel] = key.split("::");
    messages.push({
      severity: "error",
      code: "CD_LOCK_SOURCE_EXTRA",
      message: `Data source not present in lock: ${tableName} -> ${sourceLabel}`,
      file: lock.abs,
    });
  }

  return { messages };
}

async function cmdValidate(entry, opts = {}) {
  const resolved = await resolveEntry(entry);
  const docs = await loadProject(entry);
  const merged = mergeProject(docs);

  const messages = [...merged.messages];
  const tableOrigin = new Map(docs.flatMap((d) => d.parsed.program.tables.map((t) => [t.name, d.file])));

  const overrides = Object.create(null);
  for (const t of merged.program.tables) {
    if (!t.source) continue;
    const origin = tableOrigin.get(t.name) ?? resolved.entryAbs;
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
    entry: projectRelative(resolved.entryAbs),
    ...(resolved.manifestAbs ? { manifest: projectRelative(resolved.manifestAbs) } : {}),
    documents: docs.map((d) => path.relative(process.cwd(), d.file)),
    errors: messages.filter((m) => m && typeof m === "object" && m.severity === "error").length,
    warnings: messages.filter((m) => m && typeof m === "object" && m.severity === "warning").length,
  };

  const lockPathRaw = typeof opts.lockPath === "string" && opts.lockPath.trim() ? opts.lockPath.trim() : null;
  const lockPath = lockPathRaw ?? resolved.lockAbs;
  if (lockPath) {
    const lockRes = await checkLock({ lockPath, docs, merged, tableOrigin });
    messages.push(...lockRes.messages);
    summary.errors = messages.filter((m) => m && typeof m === "object" && m.severity === "error").length;
    summary.warnings = messages.filter((m) => m && typeof m === "object" && m.severity === "warning").length;
  }

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

function normalizeJsonValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (!value || typeof value !== "object") return value;

  const out = Object.create(null);
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const k of keys) out[k] = normalizeJsonValue(value[k]);
  return out;
}

function stableValue(value) {
  return JSON.stringify(normalizeJsonValue(value));
}

function diffRowKeys(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const changed = [];
  for (const k of [...keys].sort((x, y) => x.localeCompare(y))) {
    const av = a ? stableValue(a[k]) : "undefined";
    const bv = b ? stableValue(b[k]) : "undefined";
    if (av !== bv) changed.push(k);
  }
  return changed;
}

function pkString(row, primaryKey) {
  if (!row || typeof row !== "object") return null;
  const v = row[primaryKey];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function diffTableRows(primaryKey, aRows, bRows) {
  const aMap = new Map();
  for (const r of aRows) {
    const k = pkString(r, primaryKey);
    if (!k) continue;
    if (!aMap.has(k)) aMap.set(k, r);
  }

  const bMap = new Map();
  for (const r of bRows) {
    const k = pkString(r, primaryKey);
    if (!k) continue;
    if (!bMap.has(k)) bMap.set(k, r);
  }

  const aKeys = new Set(aMap.keys());
  const bKeys = new Set(bMap.keys());

  const added = [];
  const removed = [];
  const changed = [];
  const changedKeys = Object.create(null);

  for (const k of [...bKeys].sort((x, y) => x.localeCompare(y))) if (!aKeys.has(k)) added.push(k);
  for (const k of [...aKeys].sort((x, y) => x.localeCompare(y))) if (!bKeys.has(k)) removed.push(k);

  for (const k of [...aKeys].sort((x, y) => x.localeCompare(y))) {
    if (!bKeys.has(k)) continue;
    const aRow = aMap.get(k);
    const bRow = bMap.get(k);
    if (stableValue(aRow) !== stableValue(bRow)) {
      changed.push(k);
      changedKeys[k] = diffRowKeys(aRow, bRow);
    }
  }

  return { primaryKey, added, removed, changed, changedKeys };
}

async function materializeTableRows(merged, docs, entryArg) {
  const messages = [];
  const tableOrigin = new Map(docs.flatMap((d) => d.parsed.program.tables.map((t) => [t.name, d.file])));
  const rowsByName = Object.create(null);

  for (const t of merged.program.tables) {
    if (!t.source) {
      rowsByName[t.name] = t.rows;
      continue;
    }
    const origin = tableOrigin.get(t.name) ?? entryArg;
    const loaded = await loadExternalTable(t, origin);
    messages.push(...loaded.messages);
    rowsByName[t.name] = loaded.rows;
  }

  return { rowsByName, messages };
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

  const aTablesRowsRes = await materializeTableRows(aMerged, aDocs, aPath);
  const bTablesRowsRes = await materializeTableRows(bMerged, bDocs, bPath);

  const tableRows = Object.create(null);
  for (const name of Object.keys(aTables)) {
    if (!(name in bTables)) continue;
    const aTable = aMerged.program.tables.find((t) => t.name === name);
    const bTable = bMerged.program.tables.find((t) => t.name === name);
    if (!aTable || !bTable) continue;
    if (aTable.primaryKey !== bTable.primaryKey) continue;

    const aRows = aTablesRowsRes.rowsByName[name];
    const bRows = bTablesRowsRes.rowsByName[name];
    if (!Array.isArray(aRows) || !Array.isArray(bRows)) continue;
    tableRows[name] = diffTableRows(aTable.primaryKey, aRows, bRows);
  }

  const diff = {
    inputs: diffMaps(aInputs, bInputs),
    tables: diffMaps(aTables, bTables),
    tableRows,
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
      aData: aTablesRowsRes.messages,
      bData: bTablesRowsRes.messages,
      aViews: aViewsRes.messages,
      bViews: bViewsRes.messages,
    },
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function cmdLock(entryArg, outPath) {
  const resolved = await resolveEntry(entryArg);
  const docs = await loadProject(entryArg);
  const merged = mergeProject(docs);

  const messages = [...merged.messages];
  const tableOrigin = new Map(docs.flatMap((d) => d.parsed.program.tables.map((t) => [t.name, d.file])));

  const documents = docs
    .map((d) => ({ path: projectRelative(d.file), sha256: sha256Hex(d.markdown) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const dataSources = [];
  for (const t of merged.program.tables) {
    if (!t.source) continue;

    const origin = tableOrigin.get(t.name) ?? docs[0]?.file ?? process.cwd();
    const baseDir = path.dirname(origin);
    const label = isHttpUri(t.source.uri) ? t.source.uri : projectRelative(path.resolve(baseDir, t.source.uri));

    let text;
    try {
      text = await loadUriText(t.source.uri, baseDir);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_LOCK_SOURCE_READ",
        message: `Failed to load data source: ${label} (${err instanceof Error ? err.message : String(err)})`,
        file: origin,
        line: t.line,
        blockLang: "data",
        nodeName: t.name,
      });
      continue;
    }

    const actualHex = sha256Hex(text);
    const expected = t.source.hash;
    const expectedHex = expected.startsWith("sha256:") ? expected.slice("sha256:".length) : null;
    if (!expectedHex || expectedHex.toLowerCase() !== actualHex.toLowerCase()) {
      messages.push({
        severity: "error",
        code: "CD_DATA_HASH_MISMATCH",
        message: `Hash mismatch for ${t.source.uri} (expected ${expected}, got sha256:${actualHex})`,
        file: origin,
        line: t.line,
        blockLang: "data",
        nodeName: t.name,
      });
    }

    dataSources.push({
      table: t.name,
      source: label,
      format: t.source.format,
      declaredHash: t.source.hash,
      sha256: actualHex,
    });
  }

  dataSources.sort((a, b) => `${a.table}::${a.source}`.localeCompare(`${b.table}::${b.source}`));

  const lock = {
    calcdown: "0.6",
    entry: projectRelative(resolved.entryAbs),
    ...(resolved.manifestAbs ? { manifest: projectRelative(resolved.manifestAbs) } : {}),
    documents,
    dataSources,
  };

  const outAbs = path.resolve(outPath || "calcdown.lock.json");
  await fs.writeFile(outAbs, `${stableJsonPretty(lock)}\n`, "utf8");

  const errors = messages.filter((m) => m && typeof m === "object" && m.severity === "error").length;
  if (errors > 0) {
    process.stdout.write(`${JSON.stringify({ wrote: projectRelative(outAbs), errors, messages }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${JSON.stringify({ wrote: projectRelative(outAbs) }, null, 2)}\n`);
}

async function cmdExport(entryArg, opts = {}) {
  const resolved = await resolveEntry(entryArg);
  const docs = await loadProject(entryArg);
  const merged = mergeProject(docs);

  const messages = [...merged.messages];
  const tableOrigin = new Map(docs.flatMap((d) => d.parsed.program.tables.map((t) => [t.name, d.file])));

  const overrides = Object.create(null);
  for (const t of merged.program.tables) {
    if (!t.source) continue;
    const origin = tableOrigin.get(t.name) ?? resolved.entryAbs;
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
  const viewsOut = [];
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

    viewsOut.push(v);
  }

  const lockPathRaw = typeof opts.lockPath === "string" && opts.lockPath.trim() ? opts.lockPath.trim() : null;
  const lockPath = lockPathRaw ?? resolved.lockAbs;
  if (lockPath) {
    const lockRes = await checkLock({ lockPath, docs, merged, tableOrigin });
    messages.push(...lockRes.messages);
  }

  const values = evaluated.values;

  const inputs = Object.create(null);
  for (const def of merged.program.inputs) inputs[def.name] = values[def.name];

  const tables = Object.create(null);
  for (const t of merged.program.tables) tables[t.name] = values[t.name];

  const nodes = Object.create(null);
  for (const n of merged.program.nodes) nodes[n.name] = values[n.name];

  const views = viewsOut.map((v) => {
    const out = Object.create(null);
    for (const [k, val] of Object.entries(v)) {
      if (k === "line") continue;
      out[k] = val;
    }
    return out;
  });

  const out = {
    calcdown: "0.6",
    entry: projectRelative(resolved.entryAbs),
    ...(resolved.manifestAbs ? { manifest: projectRelative(resolved.manifestAbs) } : {}),
    documents: docs.map((d) => projectRelative(d.file)),
    values: { inputs, tables, nodes },
    views,
    messages,
  };

  const text = `${stableJsonPretty(out)}\n`;

  const outPath = typeof opts.outPath === "string" && opts.outPath.trim() ? opts.outPath.trim() : null;
  if (outPath) {
    const abs = path.resolve(outPath);
    await fs.writeFile(abs, text, "utf8");
    process.stdout.write(`${JSON.stringify({ wrote: projectRelative(abs) }, null, 2)}\n`);
  } else {
    process.stdout.write(text);
  }

  const errors = messages.filter((m) => m && typeof m === "object" && m.severity === "error").length;
  if (errors > 0) process.exitCode = 1;
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
    if (!entry) throw new Error("validate: missing <entry.calc.md|calcdown.json>");
    const lockIdx = args.indexOf("--lock");
    const lockPath = lockIdx !== -1 ? args[lockIdx + 1] : null;
    await cmdValidate(entry, { lockPath });
    return;
  }

  if (cmd === "diff") {
    const a = args[1];
    const b = args[2];
    if (!a || !b) throw new Error("diff: expected <a.calc.md> <b.calc.md>");
    await cmdDiff(a, b);
    return;
  }

  if (cmd === "lock") {
    const entry = args[1];
    if (!entry) throw new Error("lock: missing <entry.calc.md|calcdown.json>");
    const out = args[2] ?? null;
    await cmdLock(entry, out);
    return;
  }

  if (cmd === "export") {
    const entry = args[1];
    if (!entry) throw new Error("export: missing <entry.calc.md|calcdown.json>");
    const outIdx = args.indexOf("--out");
    const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
    const lockIdx = args.indexOf("--lock");
    const lockPath = lockIdx !== -1 ? args[lockIdx + 1] : null;
    await cmdExport(entry, { outPath, lockPath });
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
