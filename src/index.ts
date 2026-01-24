import { compileCalcScript, type CalcNode } from "./calcscript/compile.js";
import { evaluateNodes } from "./calcscript/eval.js";
import { parseInputsBlock } from "./inputs.js";
import { parseCalcdownMarkdown } from "./markdown.js";
import { std } from "./stdlib/std.js";
import {
  CalcdownMessage,
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
  nodes: CalcNode[];
}

export function parseProgram(markdown: string): { program: CalcdownProgram; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const parsed = parseCalcdownMarkdown(markdown);

  const inputs: InputDefinition[] = [];
  const nodes: CalcNode[] = [];

  const seenInputs = new Set<string>();
  const seenNodes = new Set<string>();

  for (const block of parsed.codeBlocks) {
    if (block.lang === "inputs") {
      const res = parseInputsBlock(block);
      messages.push(...res.messages);
      for (const input of res.inputs) {
        if (input.name === "std") {
          messages.push({
            severity: "error",
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
            message: `Name conflict: '${input.name}' is defined as both an input and a calc node`,
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

    if (block.lang === "calc") {
      const baseLine = block.fenceLine + 1;
      const compiled = compileCalcScript(block.content, baseLine);
      messages.push(...compiled.messages.map((m) => ({ ...m, blockLang: "calc" as const })));
      for (const node of compiled.nodes) {
        if (node.name === "std") {
          messages.push({
            severity: "error",
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
            message: `Name conflict: '${node.name}' is defined as both a calc node and an input`,
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

  if (typeof def.defaultValue === "number") {
    if (typeof value === "number") return value;
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

  for (const [key, value] of Object.entries(overrides)) {
    const def = program.inputs.find((d) => d.name === key);
    if (!def) {
      messages.push({ severity: "warning", message: `Unknown input override: ${key}` });
      continue;
    }
    try {
      inputs[key] = normalizeOverrideValue(def, value);
    } catch (err) {
      messages.push({
        severity: "error",
        message: err instanceof Error ? err.message : String(err),
        nodeName: key,
      });
    }
  }

  const evalRes = evaluateNodes(program.nodes, inputs, std);
  messages.push(...evalRes.messages);

  const values: Record<string, unknown> = Object.assign(Object.create(null), inputs, evalRes.values);
  return { values, messages };
}

export { std };
