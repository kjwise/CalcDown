import { compileCalcScript, type CalcNode } from "./calcscript/compile.js";
import { evaluateNodes } from "./calcscript/eval.js";
import { parseDataBlock } from "./data.js";
import { parseInputsBlock } from "./inputs.js";
import { parseCalcdownMarkdown } from "./markdown.js";
import { std } from "./stdlib/std.js";
import {
  CalcdownMessage,
  DataTable,
  FrontMatter,
  FencedCodeBlock,
  InputDefinition,
  InputValue,
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

  for (const block of parsed.codeBlocks) {
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

export function evaluateProgram(
  program: CalcdownProgram,
  overrides: Record<string, unknown> = {}
): { values: Record<string, unknown>; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];

  const inputs: Record<string, unknown> = Object.create(null);
  for (const def of program.inputs) {
    inputs[def.name] = def.defaultValue;
  }

  const tables: Record<string, unknown> = Object.create(null);
  for (const t of program.tables) {
    tables[t.name] = t.rows;
  }

  for (const [key, value] of Object.entries(overrides)) {
    const def = program.inputs.find((d) => d.name === key);
    if (!def) {
      if (key in tables) {
        tables[key] = value;
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

  const evalRes = evaluateNodes(
    program.nodes,
    Object.assign(Object.create(null), inputs, tables),
    std
  );
  messages.push(...evalRes.messages);

  const values: Record<string, unknown> = Object.assign(Object.create(null), inputs, tables, evalRes.values);
  return { values, messages };
}

export { std };
