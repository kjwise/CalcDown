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

const MAX_VIEW_NODES = 5000;
const MAX_VIEW_DEPTH = 64;

function sanitizeValue(raw: unknown, line: number, st: { seen: WeakSet<object>; nodes: number }, depth = 0): unknown {
  if (depth > MAX_VIEW_DEPTH) throw new Error(`View is too deeply nested (max depth ${MAX_VIEW_DEPTH})`);
  if (Array.isArray(raw)) {
    if (st.seen.has(raw)) throw new Error("YAML anchors/aliases are not allowed in view blocks");
    st.seen.add(raw);
    st.nodes++;
    if (st.nodes > MAX_VIEW_NODES) throw new Error(`View is too large (max nodes ${MAX_VIEW_NODES})`);
    return raw.map((v) => sanitizeValue(v, line, st, depth + 1));
  }
  if (!raw || typeof raw !== "object") return raw;

  // Preserve Dates as-is (js-yaml JSON_SCHEMA shouldn't produce them, but be defensive).
  if (raw instanceof Date) {
    if (st.seen.has(raw)) throw new Error("YAML anchors/aliases are not allowed in view blocks");
    st.seen.add(raw);
    st.nodes++;
    if (st.nodes > MAX_VIEW_NODES) throw new Error(`View is too large (max nodes ${MAX_VIEW_NODES})`);
    return raw;
  }

  const obj = raw as Record<string, unknown>;
  if (st.seen.has(obj)) throw new Error("YAML anchors/aliases are not allowed in view blocks");
  st.seen.add(obj);
  st.nodes++;
  if (st.nodes > MAX_VIEW_NODES) throw new Error(`View is too large (max nodes ${MAX_VIEW_NODES})`);

  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(obj)) {
    if (bannedKeys.has(key)) throw new Error(`Disallowed key: ${key}`);
    out[key] = sanitizeValue(obj[key], line, st, depth + 1);
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
      code: "CD_VIEW_EMPTY_BLOCK",
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
      raw = yamlLoad(text, { schema: JSON_SCHEMA });
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
        code: "CD_VIEW_PARSE",
        message: `View blocks must be JSON or YAML. JSON error: ${jsonMsg}. YAML error: ${yamlMsg}.`,
        line: yamlLine !== null ? baseLine + yamlLine : baseLine,
        blockLang: block.lang,
      });
      return { views: [], messages };
    }
  }

  const baseLine = block.fenceLine + 1;
  try {
    raw = sanitizeValue(raw, baseLine, { seen: new WeakSet(), nodes: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      /YAML anchors\/aliases are not allowed/.test(msg)
        ? "CD_VIEW_YAML_ALIASES_NOT_ALLOWED"
        : /View is too (deeply nested|large)/.test(msg)
          ? "CD_VIEW_LIMIT"
          : "CD_VIEW_DISALLOWED_KEY";
    messages.push({
      severity: "error",
      code,
      message: msg,
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
          code: "CD_VIEW_ITEMS_OBJECT",
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
      code: "CD_VIEW_EXPECT_OBJECT_OR_ARRAY",
      message: "View JSON must be an object or an array of objects",
      line: baseLine,
      blockLang: block.lang,
    });
    return { views: [], messages };
  }

  return { views: [view], messages };
}
