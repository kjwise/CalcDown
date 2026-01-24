import { CalcdownMessage, FencedCodeBlock } from "./types.js";
import { ParsedView, parseViewBlock } from "./views.js";

export type CalcdownViewType = "cards" | "table" | "chart" | "layout";

export type ValueFormat =
  | "number"
  | "integer"
  | "percent"
  | "currency"
  | "date"
  | {
      kind: "number" | "integer" | "percent" | "currency" | "date";
      digits?: number;
      currency?: string;
    };

export interface CardsViewSpecItem {
  key: string;
  label: string;
  format?: ValueFormat;
}

export interface CalcdownCardsView {
  id: string;
  type: "cards";
  library: "calcdown";
  spec: {
    title?: string;
    items: CardsViewSpecItem[];
  };
  line: number;
}

export interface TableViewColumn {
  key: string;
  label: string;
  format?: ValueFormat;
}

export interface CalcdownTableView {
  id: string;
  type: "table";
  library: "calcdown";
  source: string;
  spec: {
    title?: string;
    columns?: TableViewColumn[];
    editable: boolean;
    limit?: number;
  };
  line: number;
}

export interface ChartAxisSpec {
  key: string;
  label: string;
  format?: ValueFormat;
}

export interface CalcdownChartView {
  id: string;
  type: "chart";
  library: "calcdown";
  source: string;
  spec: {
    title?: string;
    kind: "line" | "bar";
    x: ChartAxisSpec;
    y: ChartAxisSpec;
  };
  line: number;
}

export type LayoutItem = { kind: "ref"; ref: string } | { kind: "layout"; spec: LayoutSpec };

export interface LayoutSpec {
  title?: string;
  direction: "row" | "column";
  items: LayoutItem[];
}

export interface CalcdownLayoutView {
  id: string;
  type: "layout";
  library: "calcdown";
  spec: LayoutSpec;
  line: number;
}

export type CalcdownView = CalcdownCardsView | CalcdownTableView | CalcdownChartView | CalcdownLayoutView;

function err(
  messages: CalcdownMessage[],
  line: number,
  code: string,
  message: string,
  extra?: Omit<CalcdownMessage, "severity" | "message" | "line">
): void {
  messages.push({ severity: "error", code, message, line, ...(extra ?? {}) });
}

function warn(
  messages: CalcdownMessage[],
  line: number,
  code: string,
  message: string,
  extra?: Omit<CalcdownMessage, "severity" | "message" | "line">
): void {
  messages.push({ severity: "warning", code, message, line, ...(extra ?? {}) });
}

const bannedKeys = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function sanitizeId(id: string): string {
  return id.trim();
}

function validateDigits(raw: unknown): number | null {
  if (raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(12, n));
}

function validateFormat(raw: unknown, line: number, messages: CalcdownMessage[]): ValueFormat | null {
  if (raw === undefined) return null;

  if (typeof raw === "string") {
    if (raw === "number" || raw === "integer" || raw === "percent" || raw === "currency" || raw === "date") return raw;
    return null;
  }

  if (!isPlainObject(raw)) return null;
  const kind = asString(raw.kind);
  if (!kind) return null;
  if (kind !== "number" && kind !== "integer" && kind !== "percent" && kind !== "currency" && kind !== "date") return null;

  const digits = validateDigits(raw.digits);
  const currency = asString(raw.currency);

  if (kind === "currency" && !currency) {
    err(messages, line, "CD_VIEW_FORMAT_CURRENCY_REQUIRED", "format.currency is required when format.kind is 'currency'");
    return null;
  }

  return Object.assign(Object.create(null), {
    kind,
    ...(digits !== null ? { digits } : {}),
    ...(currency ? { currency } : {}),
  }) as ValueFormat;
}

function validateCardsView(view: ParsedView, messages: CalcdownMessage[]): CalcdownCardsView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "cards view is missing required field: id");
    return null;
  }
  const specRaw = view.spec;
  if (!isPlainObject(specRaw)) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "cards view is missing required object: spec");
    return null;
  }

  const title = asString(specRaw.title) ?? undefined;
  const itemsRaw = specRaw.items;
  if (!Array.isArray(itemsRaw)) {
    err(messages, line, "CD_VIEW_CARDS_ITEMS_ARRAY", "cards.spec.items must be an array");
    return null;
  }

  const items: CardsViewSpecItem[] = [];
  for (const it of itemsRaw) {
    if (!isPlainObject(it)) continue;
    const key = asString(it.key);
    if (!key) continue;
    const label = asString(it.label) ?? key;
    const format = validateFormat(it.format, line, messages) ?? undefined;
    items.push(Object.assign(Object.create(null), { key, label, ...(format ? { format } : {}) }));
  }

  if (items.length === 0) {
    err(messages, line, "CD_VIEW_CARDS_ITEMS_EMPTY", "cards.spec.items must include at least one item with a string 'key'");
    return null;
  }

  return {
    id,
    type: "cards",
    library: "calcdown",
    spec: Object.assign(Object.create(null), { ...(title ? { title } : {}), items }),
    line,
  };
}

function validateTableColumns(raw: unknown, line: number, messages: CalcdownMessage[]): TableViewColumn[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const cols: TableViewColumn[] = [];
  for (const c of raw) {
    if (!isPlainObject(c)) continue;
    const key = asString(c.key);
    if (!key) continue;
    if (bannedKeys.has(key)) {
      err(messages, line, "CD_VIEW_SCHEMA_DISALLOWED_KEY", `Disallowed column key: ${key}`);
      continue;
    }
    const label = asString(c.label) ?? key;
    const format = validateFormat(c.format, line, messages) ?? undefined;
    cols.push(Object.assign(Object.create(null), { key, label, ...(format ? { format } : {}) }));
  }
  return cols.length ? cols : null;
}

function validateTableView(view: ParsedView, messages: CalcdownMessage[]): CalcdownTableView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "table view is missing required field: id");
    return null;
  }
  const source = view.source ? view.source.trim() : null;
  if (!source) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SOURCE", "table view is missing required field: source");
    return null;
  }
  const specRaw = view.spec;
  if (!isPlainObject(specRaw)) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "table view is missing required object: spec");
    return null;
  }

  const title = asString(specRaw.title) ?? undefined;
  const columns = validateTableColumns(specRaw.columns, line, messages) ?? undefined;
  const editable = typeof specRaw.editable === "boolean" ? specRaw.editable : false;
  const limit =
    typeof specRaw.limit === "number" && Number.isFinite(specRaw.limit) && Number.isInteger(specRaw.limit) && specRaw.limit >= 0
      ? specRaw.limit
      : undefined;

  return {
    id,
    type: "table",
    library: "calcdown",
    source,
    spec: Object.assign(Object.create(null), { ...(title ? { title } : {}), ...(columns ? { columns } : {}), editable, ...(limit !== undefined ? { limit } : {}) }),
    line,
  };
}

function validateAxisSpec(raw: unknown, line: number, messages: CalcdownMessage[]): ChartAxisSpec | null {
  if (!isPlainObject(raw)) return null;
  const key = asString(raw.key);
  if (!key) return null;
  if (bannedKeys.has(key)) {
    err(messages, line, "CD_VIEW_SCHEMA_DISALLOWED_KEY", `Disallowed axis key: ${key}`);
    return null;
  }
  const label = asString(raw.label) ?? key;
  const format = validateFormat(raw.format, line, messages) ?? undefined;
  return Object.assign(Object.create(null), { key, label, ...(format ? { format } : {}) });
}

function validateChartView(view: ParsedView, messages: CalcdownMessage[]): CalcdownChartView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "chart view is missing required field: id");
    return null;
  }
  const source = view.source ? view.source.trim() : null;
  if (!source) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SOURCE", "chart view is missing required field: source");
    return null;
  }
  const specRaw = view.spec;
  if (!isPlainObject(specRaw)) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "chart view is missing required object: spec");
    return null;
  }

  const title = asString(specRaw.title) ?? undefined;
  const kindRaw = asString(specRaw.kind);
  const kind = kindRaw === "line" ? "line" : kindRaw === "bar" || kindRaw === "column" ? "bar" : null;
  if (!kind) {
    err(messages, line, "CD_VIEW_CHART_KIND", "chart.spec.kind must be 'line' or 'bar'");
    return null;
  }

  const x = validateAxisSpec(specRaw.x, line, messages);
  const y = validateAxisSpec(specRaw.y, line, messages);
  if (!x || !y) {
    err(messages, line, "CD_VIEW_CHART_AXES", "chart.spec.x and chart.spec.y are required objects with a string 'key'");
    return null;
  }

  return {
    id,
    type: "chart",
    library: "calcdown",
    source,
    spec: Object.assign(Object.create(null), { ...(title ? { title } : {}), kind, x, y }),
    line,
  };
}

function validateLayoutSpec(raw: unknown, line: number, messages: CalcdownMessage[]): LayoutSpec | null {
  if (!isPlainObject(raw)) return null;

  const title = asString(raw.title) ?? undefined;
  const directionRaw = asString(raw.direction);
  const direction = directionRaw === "row" || directionRaw === "column" ? directionRaw : "column";

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) return null;

  const items: LayoutItem[] = [];
  for (const it of itemsRaw) {
    if (!isPlainObject(it)) continue;
    const ref = asString(it.ref);
    if (ref) {
      items.push({ kind: "ref", ref });
      continue;
    }
    const nested = validateLayoutSpec(it, line, messages);
    if (nested) items.push({ kind: "layout", spec: nested });
  }

  if (items.length === 0) {
    err(messages, line, "CD_VIEW_LAYOUT_ITEMS", "layout.spec.items must include at least one {ref} entry (or nested layout object)");
    return null;
  }

  return Object.assign(Object.create(null), { ...(title ? { title } : {}), direction, items });
}

function validateLayoutView(view: ParsedView, messages: CalcdownMessage[]): CalcdownLayoutView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "layout view is missing required field: id");
    return null;
  }
  const spec = validateLayoutSpec(view.spec, line, messages);
  if (!spec) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "layout view is missing required object: spec");
    return null;
  }
  return { id, type: "layout", library: "calcdown", spec, line };
}

function normalizeParsedView(raw: ParsedView): ParsedView {
  const library = raw.library ? raw.library : "calcdown";
  return Object.assign(Object.create(null), raw, { library });
}

export function validateViewsFromBlocks(blocks: FencedCodeBlock[]): { views: CalcdownView[]; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const out: CalcdownView[] = [];
  const seenIds = new Set<string>();

  for (const b of blocks) {
    if (b.lang !== "view") continue;
    const parsed = parseViewBlock(b);
    messages.push(...parsed.messages);
    for (const rawView of parsed.views) {
      const view = normalizeParsedView(rawView);
      const id = view.id ? sanitizeId(view.id) : null;
      const type = view.type ? view.type.trim() : null;
      const library = view.library ?? "calcdown";

      const line = view.line;
      if (id) {
      if (seenIds.has(id)) {
        err(messages, line, "CD_VIEW_DUPLICATE_ID", `Duplicate view id: ${id}`);
        continue;
      }
        seenIds.add(id);
      }

      if (library !== "calcdown") {
        // External view dialects are allowed but not validated by this contract.
        warn(messages, line, "CD_VIEW_UNSUPPORTED_LIBRARY", `Skipping validation for non-calcdown view library: ${library}`, {
          ...(id ? { nodeName: id } : {}),
        });
        continue;
      }

      if (!type || (type !== "cards" && type !== "table" && type !== "chart" && type !== "layout")) {
        err(messages, line, "CD_VIEW_UNKNOWN_TYPE", `Unknown calcdown view type: ${type ?? "(missing)"}`);
        continue;
      }

      let validated: CalcdownView | null = null;
      if (type === "cards") validated = validateCardsView(view, messages);
      if (type === "table") validated = validateTableView(view, messages);
      if (type === "chart") validated = validateChartView(view, messages);
      if (type === "layout") validated = validateLayoutView(view, messages);
      if (!validated) continue;
      out.push(validated);
    }
  }

  return { views: out, messages };
}
