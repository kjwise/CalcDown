import { CalcdownMessage, FencedCodeBlock } from "./types.js";
import { JSON_SCHEMA, load as yamlLoad, YAMLException } from "js-yaml";

export interface ParsedView {
  raw: unknown;
  line: number;
  id?: string;
  type?: string;
  library?: string;
  source?: string;
  spec?: unknown;
}

const bannedKeys = new Set(["__proto__", "prototype", "constructor"]);

function sanitizeValue(raw: unknown, line: number): unknown {
  if (Array.isArray(raw)) return raw.map((v) => sanitizeValue(v, line));
  if (!raw || typeof raw !== "object") return raw;

  // Preserve Dates as-is (js-yaml JSON_SCHEMA shouldn't produce them, but be defensive).
  if (raw instanceof Date) return raw;

  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(obj)) {
    if (bannedKeys.has(key)) throw new Error(`Disallowed key: ${key}`);
    out[key] = sanitizeValue(obj[key], line);
  }
  return out;
}

function parseViewObject(raw: unknown, line: number): ParsedView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return {
    raw,
    line,
    ...(typeof obj.id === "string" ? { id: obj.id } : {}),
    ...(typeof obj.type === "string" ? { type: obj.type } : {}),
    ...(typeof obj.library === "string" ? { library: obj.library } : {}),
    ...(typeof obj.source === "string" ? { source: obj.source } : {}),
    ...("spec" in obj ? { spec: obj.spec } : {}),
  };
}

export function parseViewBlock(block: FencedCodeBlock): { views: ParsedView[]; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const text = block.content.trim();

  if (!text) {
    messages.push({
      severity: "error",
      message: "Empty view block",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
    return { views: [], messages };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (jsonErr) {
    try {
      raw = yamlLoad(text, { schema: JSON_SCHEMA, maxAliasCount: 50 } as any);
    } catch (yamlErr) {
      const baseLine = block.fenceLine + 1;
      const yamlLine =
        yamlErr instanceof YAMLException && typeof yamlErr.mark?.line === "number"
          ? yamlErr.mark.line
          : null;
      const yamlMsg = yamlErr instanceof Error ? yamlErr.message : String(yamlErr);
      const jsonMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
      messages.push({
        severity: "error",
        message: `View blocks must be JSON or YAML. JSON error: ${jsonMsg}. YAML error: ${yamlMsg}.`,
        line: yamlLine !== null ? baseLine + yamlLine : baseLine,
        blockLang: block.lang,
      });
      return { views: [], messages };
    }
  }

  const baseLine = block.fenceLine + 1;
  try {
    raw = sanitizeValue(raw, baseLine);
  } catch (err) {
    messages.push({
      severity: "error",
      message: err instanceof Error ? err.message : String(err),
      line: baseLine,
      blockLang: block.lang,
    });
    return { views: [], messages };
  }

  if (Array.isArray(raw)) {
    const views: ParsedView[] = [];
    for (const item of raw) {
      const view = parseViewObject(item, baseLine);
      if (!view) {
        messages.push({
          severity: "error",
          message: "View JSON array items must be objects",
          line: baseLine,
          blockLang: block.lang,
        });
        continue;
      }
      views.push(view);
    }
    return { views, messages };
  }

  const view = parseViewObject(raw, baseLine);
  if (!view) {
    messages.push({
      severity: "error",
      message: "View JSON must be an object or an array of objects",
      line: baseLine,
      blockLang: block.lang,
    });
    return { views: [], messages };
  }

  return { views: [view], messages };
}
