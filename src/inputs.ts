import {
  CalcdownMessage,
  FencedCodeBlock,
  InputDefinition,
  InputType,
  InputValue,
} from "./types.js";
import { parseIsoDate } from "./util/date.js";

function parseInputType(raw: string): InputType {
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

function parseDefaultValue(type: InputType, text: string): InputValue {
  const t = text.trim();
  switch (type.name) {
    case "string": {
      const m = t.match(/^"(.*)"$/) ?? t.match(/^'(.*)'$/);
      return m ? (m[1] ?? "") : t;
    }
    case "boolean": {
      if (t === "true") return true;
      if (t === "false") return false;
      throw new Error(`Invalid boolean default: ${t}`);
    }
    case "date": {
      return parseIsoDate(t);
    }
    case "integer": {
      const n = Number(t);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`Invalid integer default: ${t}`);
      return n;
    }
    case "number":
    case "decimal":
    case "percent":
    case "currency": {
      const n = Number(t);
      if (!Number.isFinite(n)) throw new Error(`Invalid numeric default: ${t}`);
      return n;
    }
    default: {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
      return t;
    }
  }
}

export function parseInputsBlock(block: FencedCodeBlock): {
  inputs: InputDefinition[];
  messages: CalcdownMessage[];
} {
  const messages: CalcdownMessage[] = [];
  const inputs: InputDefinition[] = [];

  const seen = new Set<string>();
  const lines = block.content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const lineNumber = block.fenceLine + 1 + i;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const commentIdx = rawLine.indexOf("#");
    const withoutComment = (commentIdx === -1 ? rawLine : rawLine.slice(0, commentIdx)).trim();
    if (!withoutComment) continue;

    const m = withoutComment.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)\s*=\s*(.+)$/
    );
    if (!m) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_INVALID_LINE",
        message: `Invalid input line: ${withoutComment}`,
        line: lineNumber,
        blockLang: block.lang,
      });
      continue;
    }

    const name = m[1];
    const typeRaw = m[2];
    const defaultGroup = m[3];
    if (!name || !typeRaw || defaultGroup === undefined) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_INVALID_LINE",
        message: `Invalid input line: ${withoutComment}`,
        line: lineNumber,
        blockLang: block.lang,
      });
      continue;
    }

    const type = parseInputType(typeRaw);
    const defaultText = defaultGroup.trim();

    if (seen.has(name)) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_DUPLICATE_NAME",
        message: `Duplicate input name: ${name}`,
        line: lineNumber,
        blockLang: block.lang,
        nodeName: name,
      });
      continue;
    }
    seen.add(name);

    try {
      const defaultValue = parseDefaultValue(type, defaultText);
      inputs.push({ name, type, defaultText, defaultValue, line: lineNumber });
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_INVALID_DEFAULT",
        message: err instanceof Error ? err.message : String(err),
        line: lineNumber,
        blockLang: block.lang,
        nodeName: name,
      });
    }
  }

  return { inputs, messages };
}
