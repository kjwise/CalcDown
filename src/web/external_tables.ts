import { coerceRowsToTable } from "../data.js";
import { parseCsv } from "../util/csv.js";
import type { CalcdownMessage, DataTable, InputType } from "../types.js";

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

function parseCsvRowsToObjects(csvText: string): { header: string[]; rows: Record<string, string>[] } {
  const parsed = parseCsv(csvText);
  if (!parsed.header.length) return { header: [], rows: [] };

  const header = parsed.header;
  const rows: Record<string, string>[] = [];
  for (const row of parsed.rows) {
    const obj: Record<string, string> = Object.create(null);
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      if (!key) continue;
      obj[key] = row[i] ?? "";
    }
    rows.push(obj);
  }
  return { header, rows };
}

function csvCellToTyped(type: InputType | undefined, raw: unknown): unknown {
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

export interface ExternalTablesResult {
  overrides: Record<string, unknown>;
  messages: CalcdownMessage[];
  ok: boolean;
}

export async function loadExternalTables(programTables: DataTable[], originUrl: string): Promise<ExternalTablesResult> {
  const overrides: Record<string, unknown> = Object.create(null);
  const messages: CalcdownMessage[] = [];

  let ok = true;
  for (const t of programTables) {
    const source = t.source;
    if (!source) continue;

    const resolvedUrl = new URL(source.uri, originUrl).toString();
    let text: string;
    try {
      const res = await fetch(resolvedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      ok = false;
      messages.push({
        severity: "error",
        code: "CD_DATA_SOURCE_READ",
        message: `Failed to load data source: ${err instanceof Error ? err.message : String(err)}`,
        file: resolvedUrl,
        blockLang: "data",
        nodeName: t.name,
      });
      continue;
    }

    const expected = source.hash;
    const expectedHex = expected.startsWith("sha256:") ? expected.slice("sha256:".length) : null;
    const actualHex = await sha256Hex(text);
    if (!expectedHex || expectedHex.toLowerCase() !== actualHex.toLowerCase()) {
      ok = false;
      messages.push({
        severity: "error",
        code: "CD_DATA_HASH_MISMATCH",
        message: `Hash mismatch for ${source.uri} (expected ${expected}, got sha256:${actualHex})`,
        file: resolvedUrl,
        blockLang: "data",
        nodeName: t.name,
      });
      continue;
    }

    let rawRows: unknown[] = [];
    let baseLine = 1;

    if (source.format === "csv") {
      const parsed = parseCsvRowsToObjects(text);
      const declared = Object.keys(t.columns);
      for (const col of declared) {
        if (!parsed.header.includes(col)) {
          ok = false;
          messages.push({
            severity: "error",
            code: "CD_DATA_CSV_MISSING_COLUMN",
            message: `CSV source is missing declared column: ${col}`,
            file: resolvedUrl,
            line: 1,
            blockLang: "data",
            nodeName: t.name,
          });
        }
      }

      baseLine = 2;
      rawRows = parsed.rows.map((r) => {
        const row: Record<string, unknown> = Object.create(null);
        for (const [k, v] of Object.entries(r)) {
          row[k] = csvCellToTyped(t.columns[k], v);
        }
        return row;
      });
    } else if (source.format === "json") {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (err) {
        ok = false;
        messages.push({
          severity: "error",
          code: "CD_DATA_JSON_PARSE",
          message: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
          file: resolvedUrl,
          line: 1,
          blockLang: "data",
          nodeName: t.name,
        });
        continue;
      }
      if (!Array.isArray(data)) {
        ok = false;
        messages.push({
          severity: "error",
          code: "CD_DATA_JSON_NOT_ARRAY",
          message: "JSON source must be an array of objects",
          file: resolvedUrl,
          line: 1,
          blockLang: "data",
          nodeName: t.name,
        });
        continue;
      }
      rawRows = data as unknown[];
      baseLine = 1;
    }

    const coerced = coerceRowsToTable(t.name, t.primaryKey, t.columns, rawRows, {
      baseLine,
      blockLang: "data",
      file: resolvedUrl,
    });
    messages.push(...coerced.messages);
    overrides[t.name] = coerced.rows;
    if (coerced.messages.some((m) => m.severity === "error")) ok = false;
  }

  return { overrides, messages, ok };
}

