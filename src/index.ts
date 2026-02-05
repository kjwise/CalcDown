import { compileCalcScript, type CalcNode } from "./calcscript/compile.js";
import { calcErrorCodeForMessage, evaluateExpression, evaluateNodes } from "./calcscript/eval.js";
import type { Expr } from "./calcscript/ast.js";
import { parseExpression } from "./calcscript/parser.js";
import { CalcScriptSyntaxError } from "./calcscript/tokenizer.js";
import { parseDataBlock } from "./data.js";
import { parseInputsBlock } from "./inputs.js";
import { parseCalcdownMarkdown } from "./markdown.js";
import { createStd, type StdRuntimeContext, std } from "./stdlib/std.js";
import {
  CalcdownMessage,
  DataTable,
  FrontMatter,
  FencedCodeBlock,
  InputDefinition,
  InputValue,
  InputType,
} from "./types.js";
import { parseIsoDate } from "./util/date.js";

export interface CalcdownProgram {
  frontMatter: FrontMatter | null;
  blocks: FencedCodeBlock[];
  inputs: InputDefinition[];
  tables: DataTable[];
  nodes: CalcNode[];
}

export function parseProgram(markdown: string): { program: CalcdownProgram; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const parsed = parseCalcdownMarkdown(markdown);

  const inputs: InputDefinition[] = [];
  const tables: DataTable[] = [];
  const nodes: CalcNode[] = [];

  const seenInputs = new Set<string>();
  const seenTables = new Set<string>();
  const seenNodes = new Set<string>();
  const allowedBlockLangs = new Set(["inputs", "data", "calc", "view"]);

  for (const block of parsed.codeBlocks) {
    if (!allowedBlockLangs.has(block.lang)) {
      messages.push({
        severity: "error",
        code: block.lang ? "CD_BLOCK_UNKNOWN_LANG" : "CD_BLOCK_MISSING_LANG",
        message: block.lang
          ? `Unknown fenced code block language: ${block.lang}. In .calc.md, fenced code blocks are reserved for CalcDown blocks (inputs|data|calc|view).`
          : "Fenced code block is missing a language tag. In .calc.md, fenced code blocks are reserved for CalcDown blocks (inputs|data|calc|view).",
        line: block.fenceLine,
        ...(block.lang ? { blockLang: block.lang } : {}),
      });
    }

    if (block.lang === "inputs") {
      const res = parseInputsBlock(block);
      messages.push(...res.messages);
      for (const input of res.inputs) {
        if (input.name === "std") {
          messages.push({
            severity: "error",
            code: "CD_NAME_RESERVED_STD",
            message: "The identifier 'std' is reserved and cannot be used as an input name",
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        if (seenInputs.has(input.name)) {
          messages.push({
            severity: "error",
            code: "CD_INPUT_DUPLICATE_ACROSS_BLOCKS",
            message: `Duplicate input name across blocks: ${input.name}`,
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        if (seenNodes.has(input.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_INPUT_NODE",
            message: `Name conflict: '${input.name}' is defined as both an input and a calc node`,
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        if (seenTables.has(input.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_INPUT_TABLE",
            message: `Name conflict: '${input.name}' is defined as both an input and a data table`,
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        seenInputs.add(input.name);
        inputs.push(input);
      }
    }

    if (block.lang === "data") {
      const res = parseDataBlock(block);
      messages.push(...res.messages);
      const table = res.table;
      if (!table) continue;

      if (seenTables.has(table.name)) {
        messages.push({
          severity: "error",
          code: "CD_DATA_DUPLICATE_TABLE_NAME",
          message: `Duplicate table name across data blocks: ${table.name}`,
          line: table.line,
          blockLang: block.lang,
          nodeName: table.name,
        });
        continue;
      }
      if (seenInputs.has(table.name)) {
        messages.push({
          severity: "error",
          code: "CD_NAME_CONFLICT_TABLE_INPUT",
          message: `Name conflict: '${table.name}' is defined as both a data table and an input`,
          line: table.line,
          blockLang: block.lang,
          nodeName: table.name,
        });
        continue;
      }
      if (seenNodes.has(table.name)) {
        messages.push({
          severity: "error",
          code: "CD_NAME_CONFLICT_TABLE_NODE",
          message: `Name conflict: '${table.name}' is defined as both a data table and a calc node`,
          line: table.line,
          blockLang: block.lang,
          nodeName: table.name,
        });
        continue;
      }

      seenTables.add(table.name);
      tables.push(table);
    }

    if (block.lang === "calc") {
      const baseLine = block.fenceLine + 1;
      const compiled = compileCalcScript(block.content, baseLine);
      messages.push(...compiled.messages.map((m) => ({ ...m, blockLang: "calc" as const })));
      for (const node of compiled.nodes) {
        if (node.name === "std") {
          messages.push({
            severity: "error",
            code: "CD_NAME_RESERVED_STD",
            message: "The identifier 'std' is reserved and cannot be used as a node name",
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        if (seenNodes.has(node.name)) {
          messages.push({
            severity: "error",
            code: "CD_CALC_DUPLICATE_NODE_ACROSS_BLOCKS",
            message: `Duplicate node name across calc blocks: ${node.name}`,
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        if (seenInputs.has(node.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_NODE_INPUT",
            message: `Name conflict: '${node.name}' is defined as both a calc node and an input`,
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        if (seenTables.has(node.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_NODE_TABLE",
            message: `Name conflict: '${node.name}' is defined as both a calc node and a data table`,
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        seenNodes.add(node.name);
        nodes.push(node);
      }
    }
  }

  return {
    program: {
      frontMatter: parsed.frontMatter,
      blocks: parsed.codeBlocks,
      inputs,
      tables,
      nodes,
    },
    messages,
  };
}

function normalizeOverrideValue(def: InputDefinition, value: unknown): InputValue {
  if (def.type.name === "date") {
    if (value instanceof Date) return value;
    if (typeof value === "string") return parseIsoDate(value);
    throw new Error(`Invalid override for ${def.name} (expected date string)`);
  }

  if (def.type.name === "integer") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid override for ${def.name} (expected integer)`);
      return Math.trunc(value);
    }
    if (typeof value === "string") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid override for ${def.name} (expected integer)`);
      return Math.trunc(n);
    }
    throw new Error(`Invalid override for ${def.name} (expected integer)`);
  }

  if (def.type.name === "number" || def.type.name === "decimal" || def.type.name === "percent" || def.type.name === "currency") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return value;
    }
    if (typeof value === "string") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return n;
    }
    throw new Error(`Invalid override for ${def.name} (expected number)`);
  }

  // Fallback: if the default value is numeric, accept numeric overrides for unknown/custom types.
  if (typeof def.defaultValue === "number") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return value;
    }
    if (typeof value === "string") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return n;
    }
    throw new Error(`Invalid override for ${def.name} (expected number)`);
  }

  if (typeof def.defaultValue === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    throw new Error(`Invalid override for ${def.name} (expected boolean)`);
  }

  if (typeof def.defaultValue === "string") {
    if (typeof value === "string") return value;
    return String(value);
  }

  return def.defaultValue;
}

const bannedKeys = new Set(["__proto__", "prototype", "constructor"]);

function toPkString(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function cloneTableRows(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((row) => {
    if (row instanceof Date) return row;
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const out: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(row as Record<string, unknown>)) out[k] = (row as Record<string, unknown>)[k];
    return out;
  });
}

function coerceTableCellValue(type: InputType, value: unknown): unknown {
  const t = type.name;

  if (t === "string") return typeof value === "string" ? value : String(value);

  if (t === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;
    throw new Error("Expected boolean value");
  }

  if (t === "integer") {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) throw new Error("Expected integer value");
    return Math.trunc(n);
  }

  if (t === "number" || t === "decimal" || t === "percent" || t === "currency") {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) throw new Error("Expected numeric value");
    return n;
  }

  if (t === "date") {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error("Expected valid Date");
      return value;
    }
    if (typeof value === "string") return parseIsoDate(value);
    throw new Error("Expected date value");
  }

  if (t === "datetime") {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error("Expected valid Date");
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const d = new Date(value.trim());
      if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime");
      return d;
    }
    throw new Error("Expected datetime value");
  }

  return value;
}

type TablePatchSelector = { kind: "index"; index1: number } | { kind: "primaryKey"; value: string };

interface TablePatch {
  tableName: string;
  selector: TablePatchSelector;
  column: string;
  expr: Expr;
  line: number;
}

function parsePatchSelector(text: string): TablePatchSelector | null {
  const t = text.trim();

  if (/^[0-9]+$/.test(t)) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1) return null;
    return { kind: "index", index1: Math.trunc(n) };
  }

  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      const v = JSON.parse(t) as unknown;
      return typeof v === "string" ? { kind: "primaryKey", value: v } : null;
    } catch {
      return null;
    }
  }

  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return { kind: "primaryKey", value: t.slice(1, -1) };
  }

  return null;
}

function parseTablePatchesFromCalcBlock(block: FencedCodeBlock): { patches: TablePatch[]; messages: CalcdownMessage[] } {
  const patches: TablePatch[] = [];
  const messages: CalcdownMessage[] = [];

  // `<table>[<row>].<col> = <expr>;` where <row> is either:
  // - 1-based integer index, or
  // - JSON string literal primaryKey (recommended): "some pk"
  const patchRe =
    /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*([^\]]+)\s*\]\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*;\s*$/;

  const lines = block.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//")) continue;

    const m = trimmed.match(patchRe);
    if (!m) continue;

    const tableName = m[1] ?? "";
    const selectorText = m[2] ?? "";
    const column = m[3] ?? "";
    const exprText = (m[4] ?? "").trim();
    const lineNumber = block.fenceLine + 1 + i;

    const selector = parsePatchSelector(selectorText);
    if (!selector) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_INVALID_SELECTOR",
        message: `Invalid table patch selector: [${selectorText.trim()}]`,
        line: lineNumber,
        blockLang: "calc",
        nodeName: `${tableName}[${selectorText.trim()}].${column}`,
      });
      continue;
    }

    let expr: Expr;
    try {
      expr = parseExpression(exprText);
    } catch (err) {
      const eqIdx = rawLine.indexOf("=");
      const afterEq = eqIdx === -1 ? "" : rawLine.slice(eqIdx + 1);
      const ws = afterEq.match(/^\s*/)?.[0] ?? "";
      const exprStartOffset = eqIdx === -1 ? 0 : eqIdx + 1 + ws.length;
      const exprStartCol = exprStartOffset + 1;
      const columnNumber =
        err instanceof CalcScriptSyntaxError ? exprStartCol + err.pos : exprStartCol;

      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_PARSE_EXPR",
        message: err instanceof Error ? err.message : String(err),
        line: lineNumber,
        column: columnNumber,
        blockLang: "calc",
        nodeName: `${tableName}[${selectorText.trim()}].${column}`,
      });
      continue;
    }

    patches.push({ tableName, selector, column, expr, line: lineNumber });
  }

  return { patches, messages };
}

export function evaluateProgram(
  program: CalcdownProgram,
  overrides: Record<string, unknown> = {},
  context: StdRuntimeContext = {}
): { values: Record<string, unknown>; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];

  const inputs: Record<string, unknown> = Object.create(null);
  for (const def of program.inputs) {
    inputs[def.name] = def.defaultValue;
  }

  const tables: Record<string, unknown> = Object.create(null);
  for (const t of program.tables) {
    tables[t.name] = cloneTableRows(t.rows);
  }

  const patchParseMessages: CalcdownMessage[] = [];
  const patches: TablePatch[] = [];
  for (const block of program.blocks) {
    if (block.lang !== "calc") continue;
    const parsed = parseTablePatchesFromCalcBlock(block);
    patchParseMessages.push(...parsed.messages);
    patches.push(...parsed.patches);
  }
  messages.push(...patchParseMessages);

  for (const [key, value] of Object.entries(overrides)) {
    const def = program.inputs.find((d) => d.name === key);
    if (!def) {
      if (key in tables) {
        tables[key] = cloneTableRows(value);
        continue;
      }
      messages.push({ severity: "warning", code: "CD_OVERRIDE_UNKNOWN", message: `Unknown override: ${key}` });
      continue;
    }
    try {
      inputs[key] = normalizeOverrideValue(def, value);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_OVERRIDE_INVALID",
        message: err instanceof Error ? err.message : String(err),
        nodeName: key,
      });
    }
  }

  let currentDateTime: Date;
  const overrideNow = context.currentDateTime;
  if (overrideNow === undefined) {
    currentDateTime = new Date();
  } else if (!(overrideNow instanceof Date) || Number.isNaN(overrideNow.getTime())) {
    messages.push({
      severity: "error",
      code: "CD_CONTEXT_INVALID_DATETIME",
      message: "Invalid currentDateTime override (expected a valid Date)",
    });
    currentDateTime = new Date();
  } else {
    currentDateTime = overrideNow;
  }

  const runtimeStd = createStd({ currentDateTime });

  // Optional runtime row ordering for tables.
  // Storage is canonicalized by primaryKey via `calcdown fmt`; `sortBy` controls presentation order.
  const stdDataSortBy = (runtimeStd as any)?.data?.sortBy;
  if (typeof stdDataSortBy === "function") {
    for (const t of program.tables) {
      const key = t.sortBy;
      if (!key) continue;
      const rows = tables[t.name];
      if (!Array.isArray(rows)) continue;
      try {
        tables[t.name] = stdDataSortBy(rows, key);
      } catch (err) {
        messages.push({
          severity: "error",
          code: "CD_DATA_SORTBY_RUNTIME",
          message: err instanceof Error ? err.message : String(err),
          line: t.line,
          nodeName: t.name,
          blockLang: "data",
        });
      }
    }
  }

  const tablePkByArray = new WeakMap<object, { primaryKey: string }>();
  for (const t of program.tables) {
    const rows = tables[t.name];
    if (Array.isArray(rows)) tablePkByArray.set(rows, { primaryKey: t.primaryKey });
  }

  const evalRes = evaluateNodes(
    program.nodes,
    Object.assign(Object.create(null), inputs, tables),
    runtimeStd,
    tablePkByArray
  );
  messages.push(...evalRes.messages);

  const schemaByName = new Map<string, DataTable>();
  for (const t of program.tables) schemaByName.set(t.name, t);

  const warnedPositional = new Set<string>();

  for (const p of patches) {
    const schema = schemaByName.get(p.tableName);
    if (!schema) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_UNKNOWN_TABLE",
        message: `Table patch target does not exist: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    if (schema.source) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_EXTERNAL_TABLE",
        message: `External data tables are read-only and cannot be patched: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    if (bannedKeys.has(p.column)) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_DISALLOWED_KEY",
        message: `Disallowed column key in patch: ${p.column}`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}.${p.column}`,
      });
      continue;
    }

    if (!(p.column in schema.columns)) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_UNKNOWN_COLUMN",
        message: `Unknown column '${p.column}' for table '${p.tableName}'`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}.${p.column}`,
      });
      continue;
    }
    if (p.column === schema.primaryKey) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_PRIMARYKEY",
        message: `Patching primaryKey '${schema.primaryKey}' is not supported`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}.${p.column}`,
      });
      continue;
    }

    const rows = tables[p.tableName];
    if (!Array.isArray(rows)) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_TARGET_NOT_TABLE",
        message: `Patch target is not a table: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    let rowIndex = -1;
    if (p.selector.kind === "index") {
      if (!warnedPositional.has(p.tableName)) {
        warnedPositional.add(p.tableName);
        messages.push({
          severity: "warning",
          code: "CD_CALC_PATCH_POSITIONAL",
          message: `Table patches by row index are fragile; prefer primaryKey selectors like ${p.tableName}[\"...\"]`,
          line: p.line,
          blockLang: "calc",
          nodeName: p.tableName,
        });
      }
      rowIndex = p.selector.index1 - 1;
    } else {
      const pkKey = schema.primaryKey;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r || typeof r !== "object" || Array.isArray(r)) continue;
        const pk = toPkString((r as Record<string, unknown>)[pkKey]);
        if (pk === p.selector.value) {
          rowIndex = i;
          break;
        }
      }
    }

    if (rowIndex < 0 || rowIndex >= rows.length) {
      const selectorText = p.selector.kind === "index" ? String(p.selector.index1) : JSON.stringify(p.selector.value);
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_ROW_NOT_FOUND",
        message: `Row not found for patch: ${p.tableName}[${selectorText}]`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}[${selectorText}].${p.column}`,
      });
      continue;
    }

    const row = rows[rowIndex];
    if (!row || typeof row !== "object" || Array.isArray(row) || row instanceof Date) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_ROW_INVALID",
        message: `Target row is not an object for patch: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    let computed: unknown;
    try {
      computed = evaluateExpression(p.expr, evalRes.env, runtimeStd, tablePkByArray);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const selectorText = p.selector.kind === "index" ? String(p.selector.index1) : JSON.stringify(p.selector.value);
      messages.push({
        severity: "error",
        code: calcErrorCodeForMessage(msg),
        message: msg,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}[${selectorText}].${p.column}`,
      });
      continue;
    }

    let nextValue: unknown;
    try {
      nextValue = coerceTableCellValue(schema.columns[p.column]!, computed);
    } catch (err) {
      const selectorText = p.selector.kind === "index" ? String(p.selector.index1) : JSON.stringify(p.selector.value);
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_TYPE",
        message: err instanceof Error ? err.message : String(err),
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}[${selectorText}].${p.column}`,
      });
      continue;
    }

    const nextRow: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(row as Record<string, unknown>)) nextRow[k] = (row as Record<string, unknown>)[k];
    nextRow[p.column] = nextValue;
    rows[rowIndex] = nextRow;
  }

  const values: Record<string, unknown> = Object.assign(Object.create(null), inputs, tables, evalRes.values);
  return { values, messages };
}

export { createStd, std };
