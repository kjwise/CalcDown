import { evaluateProgram, parseProgram } from "./index.js";
import { formatIsoDate, parseIsoDate } from "./util/date.js";
import { CalcdownMessage, DataTable } from "./types.js";
import { validateViewsFromBlocks } from "./view_contract.js";
import type { CalcdownView, LayoutItem, LayoutSpec, TableViewColumn } from "./view_contract.js";

const runEl = document.getElementById("run");
const liveEl = document.getElementById("live");
const inputsEl = document.getElementById("inputs");
const viewsEl = document.getElementById("views");
const messagesEl = document.getElementById("messages");
const sourceEl = document.getElementById("source");

if (!(runEl instanceof HTMLButtonElement)) throw new Error("Missing #run button");
if (!(liveEl instanceof HTMLInputElement)) throw new Error("Missing #live checkbox");
if (!(inputsEl instanceof HTMLDivElement)) throw new Error("Missing #inputs div");
if (!(viewsEl instanceof HTMLDivElement)) throw new Error("Missing #views div");
if (!(messagesEl instanceof HTMLPreElement)) throw new Error("Missing #messages pre");
if (!(sourceEl instanceof HTMLTextAreaElement)) throw new Error("Missing #source textarea");

const run = runEl;
const live = liveEl;
const inputsRoot = inputsEl;
const viewsRoot = viewsEl;
const messages = messagesEl;
const source = sourceEl;

const DEBOUNCE_MS = 500;
let debounceTimer: number | null = null;

type OverrideValue = string | number | boolean;

type TableState = Record<string, Record<string, unknown>[]>;
type TableSchemas = Record<string, DataTable>;

let tableState: TableState = Object.create(null);
let tableSchemas: TableSchemas = Object.create(null);

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function deepCopyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => Object.assign(Object.create(null), r));
}

function formatValue(v: unknown): string {
  if (v instanceof Date) return formatIsoDate(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (Array.isArray(v)) return `[array × ${v.length}]`;
  return "[object]";
}

type ValueFormat =
  | "number"
  | "integer"
  | "percent"
  | "date"
  | { kind: "number" | "integer" | "percent" | "currency" | "date"; digits?: number; currency?: string };

function formatFormattedValue(v: unknown, fmt: ValueFormat | undefined): string {
  if (!fmt) return formatValue(v);

  const kind = typeof fmt === "string" ? fmt : fmt.kind;
  const digits =
    typeof fmt === "string"
      ? undefined
      : typeof fmt.digits === "number" && Number.isFinite(fmt.digits)
        ? Math.max(0, Math.min(12, Math.floor(fmt.digits)))
        : undefined;

  if (kind === "date") {
    if (v instanceof Date) return formatIsoDate(v);
    if (typeof v === "string") return v;
    return formatValue(v);
  }

  if (kind === "percent") {
    if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits ?? 2,
      minimumFractionDigits: digits ?? 0,
    });
    return `${nf.format(v)}%`;
  }

  if (kind === "currency") {
    const currency = typeof fmt === "string" ? undefined : fmt.currency;
    if (typeof v !== "number" || !Number.isFinite(v) || !currency) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: digits ?? 2,
    });
    return nf.format(v);
  }

  if (kind === "integer") {
    if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    return nf.format(Math.trunc(v));
  }

  // number
  if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
  const nf = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits ?? 2,
    minimumFractionDigits: digits ?? 0,
  });
  return nf.format(v);
}

function readInputOverrides(): Record<string, OverrideValue> {
  const out: Record<string, OverrideValue> = Object.create(null);
  for (const el of Array.from(inputsRoot.querySelectorAll<HTMLInputElement>("input[data-name]"))) {
    const name = el.dataset.name;
    const kind = el.dataset.kind;
    if (!name) continue;
    if (kind === "boolean") {
      out[name] = el.checked;
      continue;
    }
    if (el.type === "date") {
      if (el.value) out[name] = el.value;
      continue;
    }
    const n = el.valueAsNumber;
    if (Number.isFinite(n)) out[name] = n;
  }
  return out;
}

function desiredResultKeys(frontMatterResults: string | undefined): string[] | null {
  if (!frontMatterResults) return null;
  const list = frontMatterResults
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function renderInputsFromSource(markdown: string): void {
  const parsed = parseProgram(markdown);
  const program = parsed.program;

  clear(inputsRoot);

  for (const def of program.inputs) {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("label");
    label.textContent = `${def.name} (${def.type.raw})`;
    field.appendChild(label);

    const input = document.createElement("input");
    input.dataset.name = def.name;

    if (def.type.name === "boolean") {
      input.type = "checkbox";
      input.dataset.kind = "boolean";
      input.checked = Boolean(def.defaultValue);
    } else if (def.type.name === "date") {
      input.type = "date";
      input.value = def.defaultValue instanceof Date ? formatIsoDate(def.defaultValue) : String(def.defaultValue);
    } else {
      input.type = "number";
      input.dataset.kind = "number";
      input.step = def.type.name === "integer" ? "1" : def.type.name === "percent" ? "0.1" : "0.01";
      input.value = typeof def.defaultValue === "number" ? String(def.defaultValue) : String(def.defaultValue);
    }

    input.addEventListener("input", () => scheduleRecompute());

    field.appendChild(input);
    inputsRoot.appendChild(field);
  }
}

function resetTablesFromProgram(parsedTables: DataTable[]): void {
  tableSchemas = Object.create(null);
  tableState = Object.create(null);

  for (const t of parsedTables) {
    tableSchemas[t.name] = t;
    tableState[t.name] = deepCopyRows(t.rows);
  }
}

function buildCardsView(title: string | null, items: { key: string; label: string; format?: ValueFormat }[], values: Record<string, unknown>): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  if (title) {
    const h = document.createElement("div");
    h.className = "view-title";
    h.textContent = title;
    view.appendChild(h);
  }

  const cards = document.createElement("div");
  cards.className = "cards";

  for (const item of items) {
    const key = item.key;
    const card = document.createElement("div");
    card.className = "card";

    const k = document.createElement("div");
    k.className = "k";
    k.textContent = item.label ?? key;

    const v = document.createElement("div");
    v.className = "v";
    v.textContent = formatFormattedValue(values[key], item.format);

    card.appendChild(k);
    card.appendChild(v);
    cards.appendChild(card);
  }

  view.appendChild(cards);
  return view;
}

function buildTableView(
  title: string | null,
  sourceName: string,
  columns: { key: string; label: string; format?: ValueFormat }[],
  rows: Record<string, unknown>[],
  editable: boolean
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  if (title) {
    const h = document.createElement("div");
    h.className = "view-title";
    h.textContent = title;
    view.appendChild(h);
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c.label;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  const schema = tableSchemas[sourceName];
  const schemaCols = schema?.columns ?? null;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const tr = document.createElement("tr");

    for (const c of columns) {
      const td = document.createElement("td");
      const value = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;

      if (editable && schemaCols && c.key in schemaCols) {
        const type = schemaCols[c.key]!;
        const input = document.createElement("input");

        if (type.name === "integer" || type.name === "number" || type.name === "decimal" || type.name === "percent" || type.name === "currency") {
          input.type = "number";
          input.step = type.name === "integer" ? "1" : "0.01";
          input.value = typeof value === "number" && Number.isFinite(value) ? String(value) : "";
          input.addEventListener("input", () => {
            const next = Number(input.value);
            if (!Number.isFinite(next)) return;
            const nextValue = type.name === "integer" ? Math.trunc(next) : next;
            tableState[sourceName]![rowIndex]![c.key] = nextValue;
            scheduleRecompute();
          });
        } else if (type.name === "date") {
          input.type = "date";
          input.value = value instanceof Date ? formatIsoDate(value) : typeof value === "string" ? value : "";
          input.addEventListener("input", () => {
            if (!input.value) return;
            try {
              tableState[sourceName]![rowIndex]![c.key] = parseIsoDate(input.value);
              scheduleRecompute();
            } catch {
              // ignore invalid
            }
          });
        } else {
          input.type = "text";
          input.value = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
          input.addEventListener("input", () => {
            tableState[sourceName]![rowIndex]![c.key] = input.value;
            scheduleRecompute();
          });
        }

        td.appendChild(input);
      } else {
        td.textContent = formatFormattedValue(value, c.format);
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  view.appendChild(table);
  return view;
}

function defaultColumnsForSource(sourceName: string, rows: Record<string, unknown>[]): TableViewColumn[] {
  const schema = tableSchemas[sourceName];
  if (schema) {
    const keys = Object.keys(schema.columns);
    return keys.map((k) => ({ key: k, label: k }));
  }
  if (rows.length === 0) return [];
  return Object.keys(rows[0] ?? {}).sort((a, b) => a.localeCompare(b)).map((k) => ({ key: k, label: k }));
}

function buildLayoutContainer(spec: LayoutSpec): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = spec.direction === "row" ? "row" : "column";
  el.style.gap = "12px";
  el.style.flexWrap = spec.direction === "row" ? "wrap" : "nowrap";
  return el;
}

function buildLayout(spec: LayoutSpec, viewById: Map<string, CalcdownView>, values: Record<string, unknown>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "view";

  if (spec.title) {
    const h = document.createElement("div");
    h.className = "view-title";
    h.textContent = spec.title;
    wrapper.appendChild(h);
  }

  const container = buildLayoutContainer(spec);
  for (const item of spec.items) {
    const child = buildLayoutItem(item, viewById, values);
    if (child) container.appendChild(child);
  }

  wrapper.appendChild(container);
  return wrapper;
}

function buildLayoutItem(item: LayoutItem, viewById: Map<string, CalcdownView>, values: Record<string, unknown>): HTMLElement | null {
  if (item.kind === "layout") return buildLayout(item.spec, viewById, values);

  const target = viewById.get(item.ref);
  if (!target) {
    const missing = document.createElement("div");
    missing.className = "view";
    const msg = document.createElement("div");
    msg.className = "view-title";
    msg.textContent = `Missing view: ${item.ref}`;
    missing.appendChild(msg);
    return missing;
  }

  if (target.type === "cards") {
    const title = target.spec.title ?? null;
    const items = target.spec.items.map((it) => ({
      key: it.key,
      label: it.label,
      ...(it.format ? { format: it.format as ValueFormat } : {}),
    }));
    return buildCardsView(title, items, values);
  }

  if (target.type === "table") {
    const sourceName = target.source;
    const raw = values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rowObjs = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];

    const columns = (target.spec.columns && target.spec.columns.length ? target.spec.columns : defaultColumnsForSource(sourceName, rowObjs)).map((c) => ({
      key: c.key,
      label: c.label,
      ...(c.format ? { format: c.format as ValueFormat } : {}),
    }));

    const editable = target.spec.editable && sourceName in tableState && sourceName in tableSchemas;
    const limit = target.spec.limit;
    const limitedRows = limit !== undefined ? rowObjs.slice(0, limit) : rowObjs;
    const title = target.spec.title ?? null;
    return buildTableView(title, sourceName, columns, limitedRows, editable);
  }

  // Demo 3 focuses on cards + tables.
  return null;
}

function recompute(): void {
  const parsed = parseProgram(source.value);

  if (Object.keys(tableSchemas).length === 0) {
    resetTablesFromProgram(parsed.program.tables);
  }

  const overrides: Record<string, unknown> = Object.assign(Object.create(null), readInputOverrides(), tableState);
  const evaluated = evaluateProgram(parsed.program, overrides);

  clear(viewsRoot);

  const validated = validateViewsFromBlocks(parsed.program.blocks);
  const viewMessages: CalcdownMessage[] = [...validated.messages];

  if (validated.views.length > 0) {
    const viewById = new Map(validated.views.map((v) => [v.id, v]));
    const rootLayout = validated.views.find((v) => v.type === "layout") ?? null;

    if (rootLayout && rootLayout.type === "layout") {
      viewsRoot.appendChild(buildLayout(rootLayout.spec, viewById, evaluated.values));
    } else {
      for (const view of validated.views) {
        if (view.type === "layout") continue;
        const el = buildLayoutItem({ kind: "ref", ref: view.id }, viewById, evaluated.values);
        if (el) viewsRoot.appendChild(el);
      }
    }
  } else {
    const fmResults = parsed.program.frontMatter?.data?.results;
    const keys =
      desiredResultKeys(fmResults) ??
      parsed.program.nodes.map((n) => n.name).filter((k) => typeof evaluated.values[k] !== "object");
    const items = keys.slice(0, 8).map((k) => ({ key: k, label: k }));
    viewsRoot.appendChild(buildCardsView(null, items, evaluated.values));
  }

  messages.textContent = JSON.stringify(
    {
      parseMessages: parsed.messages,
      evalMessages: evaluated.messages,
      viewMessages,
      overrides,
    },
    null,
    2
  );
}

function scheduleRecompute(): void {
  if (!live.checked) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    recompute();
  }, DEBOUNCE_MS);
}

async function loadDefault(): Promise<void> {
  const res = await fetch("../docs/examples/invoice.calc.md");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  source.value = await res.text();
}

run.addEventListener("click", () => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
  renderInputsFromSource(source.value);
  recompute();
});

live.addEventListener("change", () => {
  if (live.checked) scheduleRecompute();
});

source.addEventListener("input", () => {
  if (!live.checked) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    const parsed = parseProgram(source.value);
    resetTablesFromProgram(parsed.program.tables);
    renderInputsFromSource(source.value);
    recompute();
  }, DEBOUNCE_MS);
});

await loadDefault();
{
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
}
renderInputsFromSource(source.value);
recompute();
