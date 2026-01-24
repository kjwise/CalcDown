import { CalcdownMessage, DataTable, FencedCodeBlock, InputType } from "./types.js";
import { parseIsoDate } from "./util/date.js";

function parseType(raw: string): InputType {
  const trimmed = raw.trim();
  const open = trimmed.indexOf("(");
  if (open === -1) return { name: trimmed, args: [], raw: trimmed };
  const close = trimmed.lastIndexOf(")");
  if (close === -1 || close < open) return { name: trimmed, args: [], raw: trimmed };
  const name = trimmed.slice(0, open).trim();
  const argsText = trimmed.slice(open + 1, close).trim();
  const args = argsText ? argsText.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return { name, args, raw: trimmed };
}

function parseScalarByType(type: InputType, value: unknown): unknown {
  switch (type.name) {
    case "string":
      if (typeof value !== "string") throw new Error(`Expected string, got ${typeof value}`);
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`Expected boolean, got ${typeof value}`);
      return value;
    case "integer":
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error("Expected integer");
      }
      return value;
    case "number":
    case "decimal":
    case "percent":
    case "currency":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected number");
      return value;
    case "date":
      if (typeof value !== "string") throw new Error("Expected ISO date string");
      return parseIsoDate(value);
    case "datetime": {
      if (typeof value !== "string") throw new Error("Expected datetime string");
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime");
      return d;
    }
    default:
      return value;
  }
}

function isIdent(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function parseDataBlock(block: FencedCodeBlock): { table: DataTable | null; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const lines = block.content.split(/\r?\n/);

  const sepIdx = lines.findIndex((l) => (l ?? "").trim() === "---");
  if (sepIdx === -1) {
    messages.push({
      severity: "error",
      message: "Data block is missing '---' separator between header and rows",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
    return { table: null, messages };
  }

  const headerLines = lines.slice(0, sepIdx);
  const rowLines = lines.slice(sepIdx + 1);

  let name: string | null = null;
  let primaryKey: string | null = null;
  const columns: Record<string, InputType> = Object.create(null);

  for (let i = 0; i < headerLines.length; i++) {
    const raw = headerLines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) {
      messages.push({
        severity: "error",
        message: `Invalid data header line: ${trimmed}`,
        line: block.fenceLine + 1 + i,
        blockLang: block.lang,
      });
      continue;
    }

    const key = m[1] ?? "";
    const value = m[2] ?? "";

    if (key === "name") {
      name = value.trim() || null;
      continue;
    }
    if (key === "primaryKey") {
      primaryKey = value.trim() || null;
      continue;
    }
    if (key === "columns") {
      // Read indented column lines until a non-indented key (or end).
      for (i = i + 1; i < headerLines.length; i++) {
        const rawCol = headerLines[i] ?? "";
        const trimmedCol = rawCol.trim();
        if (!trimmedCol || trimmedCol.startsWith("#")) continue;
        if (!rawCol.startsWith(" ") && !rawCol.startsWith("\t")) {
          i = i - 1;
          break;
        }
        const cm = trimmedCol.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
        if (!cm) {
          messages.push({
            severity: "error",
            message: `Invalid columns entry: ${trimmedCol}`,
            line: block.fenceLine + 1 + i,
            blockLang: block.lang,
          });
          continue;
        }
        const colName = cm[1] ?? "";
        const typeRaw = cm[2] ?? "";
        columns[colName] = parseType(typeRaw);
      }
      continue;
    }

    messages.push({
      severity: "warning",
      message: `Unknown data header key: ${key}`,
      line: block.fenceLine + 1 + i,
      blockLang: block.lang,
    });
  }

  if (!name) {
    messages.push({
      severity: "error",
      message: "Data header is missing required key: name",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
  } else if (!isIdent(name)) {
    messages.push({
      severity: "error",
      message: `Invalid table name: ${name}`,
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: name,
    });
  } else if (name === "std") {
    messages.push({
      severity: "error",
      message: "The identifier 'std' is reserved and cannot be used as a table name",
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: name,
    });
  }

  if (!primaryKey) {
    messages.push({
      severity: "error",
      message: "Data header is missing required key: primaryKey",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
  }

  if (Object.keys(columns).length === 0) {
    messages.push({
      severity: "error",
      message: "Data header is missing required key: columns",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
  } else if (primaryKey && !(primaryKey in columns)) {
    messages.push({
      severity: "error",
      message: `primaryKey '${primaryKey}' must be declared in columns`,
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: primaryKey,
    });
  }

  const tableName = name;
  const pk = primaryKey;
  if (!tableName || !pk || Object.keys(columns).length === 0 || !isIdent(tableName) || tableName === "std") {
    return { table: null, messages };
  }

  const seenKeys = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < rowLines.length; i++) {
    const raw = rowLines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      messages.push({
        severity: "error",
        message: err instanceof Error ? err.message : "Invalid JSON row",
        line: block.fenceLine + 1 + sepIdx + 1 + i,
        blockLang: block.lang,
        nodeName: tableName,
      });
      continue;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      messages.push({
        severity: "error",
        message: "Data row must be a JSON object",
        line: block.fenceLine + 1 + sepIdx + 1 + i,
        blockLang: block.lang,
        nodeName: tableName,
      });
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, pk)) {
      messages.push({
        severity: "error",
        message: `Data row is missing primaryKey '${pk}'`,
        line: block.fenceLine + 1 + sepIdx + 1 + i,
        blockLang: block.lang,
        nodeName: tableName,
      });
      continue;
    }

    const pkValue = obj[pk];
    const pkString = typeof pkValue === "string" ? pkValue : typeof pkValue === "number" ? String(pkValue) : null;
    if (!pkString) {
      messages.push({
        severity: "error",
        message: `primaryKey '${pk}' must be a string or number`,
        line: block.fenceLine + 1 + sepIdx + 1 + i,
        blockLang: block.lang,
        nodeName: tableName,
      });
      continue;
    }
    if (seenKeys.has(pkString)) {
      messages.push({
        severity: "error",
        message: `Duplicate primaryKey '${pkString}'`,
        line: block.fenceLine + 1 + sepIdx + 1 + i,
        blockLang: block.lang,
        nodeName: tableName,
      });
      continue;
    }
    seenKeys.add(pkString);

    const row: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(obj)) {
      if (k in columns) {
        try {
          row[k] = parseScalarByType(columns[k]!, v);
        } catch (err) {
          messages.push({
            severity: "error",
            message: `Invalid value for column '${k}': ${err instanceof Error ? err.message : String(err)}`,
            line: block.fenceLine + 1 + sepIdx + 1 + i,
            blockLang: block.lang,
            nodeName: tableName,
          });
          row[k] = v;
        }
      } else {
        row[k] = v;
      }
    }

    rows.push(row);
  }

  const table: DataTable = {
    name: tableName,
    primaryKey: pk,
    columns,
    rows,
    line: block.fenceLine + 1,
  };

  return { table, messages };
}
