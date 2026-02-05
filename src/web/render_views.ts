import type { DataTable } from "../types.js";
import { defaultLabelForKey, type CalcdownView, type LayoutItem, type LayoutSpec, type TableViewColumn, type ValueFormat } from "../view_contract.js";
import { formatFormattedValue } from "./format.js";
import { buildBarChartCard, buildLineChartCard, type ChartCardClasses, type ChartSeriesSpec } from "./charts.js";

export type ChartMode = "spec" | "line" | "bar";

export interface TableEditEvent {
  tableName: string;
  primaryKey: string | null;
  column: string;
  value: unknown;
}

export interface RenderViewsOptions {
  container: HTMLElement;
  views: CalcdownView[];
  values: Record<string, unknown>;
  chartMode?: ChartMode;
  tableSchemas?: Record<string, DataTable>;
  onEditTableCell?: (ev: TableEditEvent) => void;
}

export interface RenderInlineViewsOptions {
  container: HTMLElement;
  views: CalcdownView[]; // all known views (for layout refs)
  render: string[]; // view ids to render in order
  values: Record<string, unknown>;
  chartMode?: ChartMode;
  tableSchemas?: Record<string, DataTable>;
  onEditTableCell?: (ev: TableEditEvent) => void;
}

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function viewTitle(title: string): HTMLDivElement {
  const h = document.createElement("div");
  h.className = "view-title";
  h.textContent = title;
  return h;
}

function buildCardsView(title: string | null, items: { key: string; label: string; format?: ValueFormat }[], values: Record<string, unknown>): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  if (title) view.appendChild(viewTitle(title));

  const cards = document.createElement("div");
  cards.className = "cards";
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "card";

    const k = document.createElement("div");
    k.className = "k";
    k.textContent = item.label ?? item.key;

    const v = document.createElement("div");
    v.className = "v";
    v.textContent = formatFormattedValue(values[item.key], item.format);

    card.appendChild(k);
    card.appendChild(v);
    cards.appendChild(card);
  }

  view.appendChild(cards);
  return view;
}

function defaultColumnsForSource(sourceName: string, rows: Record<string, unknown>[], schemas: Record<string, DataTable> | undefined): TableViewColumn[] {
  const schema = schemas ? schemas[sourceName] : undefined;
  if (schema) {
    const keys = Object.keys(schema.columns);
    return keys.map((k) => ({ key: k, label: defaultLabelForKey(k) }));
  }
  if (rows.length === 0) return [];
  return Object.keys(rows[0] ?? {})
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ key: k, label: defaultLabelForKey(k) }));
}

function inferredFormatForType(t: DataTable["columns"][string] | undefined): ValueFormat | undefined {
  if (!t) return undefined;
  if (t.name === "integer") return "integer";
  if (t.name === "number" || t.name === "decimal") return "number";
  if (t.name === "percent") return "percent";
  if (t.name === "date") return "date";
  if (t.name === "currency") {
    const code = t.args[0];
    return code ? ({ kind: "currency", currency: code } satisfies ValueFormat) : "number";
  }
  return undefined;
}

function buildTableView(
  title: string | null,
  sourceName: string,
  columns: { key: string; label: string; format?: ValueFormat }[],
  rows: Record<string, unknown>[],
  opts: { editable: boolean; schema?: DataTable; onEditTableCell?: (ev: TableEditEvent) => void }
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";
  if (title) view.appendChild(viewTitle(title));

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

  const schemaCols = opts.schema?.columns ?? null;
  const pkKey = opts.schema?.primaryKey ?? null;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const pkRaw = pkKey ? row[pkKey] : undefined;
    const pk =
      typeof pkRaw === "string" ? pkRaw : typeof pkRaw === "number" && Number.isFinite(pkRaw) ? String(pkRaw) : null;

    const tr = document.createElement("tr");

    for (const c of columns) {
      const td = document.createElement("td");
      const value = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;

      if (opts.editable && opts.onEditTableCell && pkKey && pk && schemaCols && c.key in schemaCols) {
        const type = schemaCols[c.key]!;
        const input = document.createElement("input");

        if (type.name === "integer" || type.name === "number" || type.name === "decimal" || type.name === "percent" || type.name === "currency") {
          input.type = "number";
          input.step = type.name === "integer" ? "1" : "0.01";
          input.value = typeof value === "number" && Number.isFinite(value) ? String(value) : "";
          input.addEventListener("input", () => {
            const next = input.valueAsNumber;
            if (input.value !== "" && !Number.isFinite(next)) return;
            const nextValue = input.value === "" ? undefined : type.name === "integer" ? Math.trunc(next) : next;
            opts.onEditTableCell?.({ tableName: sourceName, primaryKey: pk, column: c.key, value: nextValue });
          });
        } else if (type.name === "date") {
          input.type = "date";
          input.value = value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "string" ? value : "";
          input.addEventListener("input", () => {
            if (!input.value) return;
            opts.onEditTableCell?.({ tableName: sourceName, primaryKey: pk, column: c.key, value: input.value });
          });
        } else {
          input.type = "text";
          input.value = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
          input.addEventListener("input", () => {
            opts.onEditTableCell?.({ tableName: sourceName, primaryKey: pk, column: c.key, value: input.value });
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

function buildLayoutContainer(spec: LayoutSpec): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = spec.direction === "row" ? "row" : "column";
  el.style.gap = "12px";
  el.style.flexWrap = spec.direction === "row" ? "wrap" : "nowrap";
  return el;
}

function buildLayout(
  spec: LayoutSpec,
  viewById: Map<string, CalcdownView>,
  ctx: { values: Record<string, unknown>; chartMode: ChartMode; schemas?: Record<string, DataTable>; onEditTableCell?: (ev: TableEditEvent) => void }
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "view";
  if (spec.title) wrapper.appendChild(viewTitle(spec.title));

  const container = buildLayoutContainer(spec);
  for (const item of spec.items) {
    const el = buildLayoutItem(item, viewById, ctx);
    if (el) container.appendChild(el);
  }
  wrapper.appendChild(container);
  return wrapper;
}

function buildMissingView(ref: string): HTMLElement {
  const missing = document.createElement("div");
  missing.className = "view";
  missing.appendChild(viewTitle(`Missing view: ${ref}`));
  return missing;
}

function buildLayoutItem(
  item: LayoutItem,
  viewById: Map<string, CalcdownView>,
  ctx: { values: Record<string, unknown>; chartMode: ChartMode; schemas?: Record<string, DataTable>; onEditTableCell?: (ev: TableEditEvent) => void }
): HTMLElement | null {
  if (item.kind === "layout") return buildLayout(item.spec, viewById, ctx);

  const target = viewById.get(item.ref);
  if (!target) return buildMissingView(item.ref);

  if (target.type === "cards") {
    const title = target.spec.title ?? null;
    const items = target.spec.items.map((it) => ({
      key: it.key,
      label: it.label,
      ...(it.format ? { format: it.format as ValueFormat } : {}),
    }));
    return buildCardsView(title, items, ctx.values);
  }

  if (target.type === "table") {
    const sourceName = target.source;
    const raw = ctx.values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rowObjs = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];

    const schema = ctx.schemas ? ctx.schemas[sourceName] : undefined;
    const schemaCols = schema?.columns ?? null;

    const cols = (target.spec.columns && target.spec.columns.length ? target.spec.columns : defaultColumnsForSource(sourceName, rowObjs, ctx.schemas)).map((c) => {
      const fmt = c.format ? (c.format as ValueFormat) : schemaCols ? inferredFormatForType(schemaCols[c.key]) : undefined;
      return Object.assign(Object.create(null), { key: c.key, label: c.label }, fmt ? { format: fmt } : {});
    });

    const editable = Boolean(target.spec.editable && schema && !schema.source);

    const limit = target.spec.limit;
    const limitedRows = limit !== undefined ? rowObjs.slice(0, limit) : rowObjs;
    const title = target.spec.title ?? null;

    const tableOpts: { editable: boolean; schema?: DataTable; onEditTableCell?: (ev: TableEditEvent) => void } = { editable };
    if (schema) tableOpts.schema = schema;
    if (ctx.onEditTableCell) tableOpts.onEditTableCell = ctx.onEditTableCell;
    return buildTableView(title, sourceName, cols, limitedRows, tableOpts);
  }

  if (target.type === "chart") {
    const sourceName = target.source;
    const raw = ctx.values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rows = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
    const xField = target.spec.x.key;
    const ySpecs = Array.isArray(target.spec.y) ? target.spec.y : [target.spec.y];

    const schema = ctx.schemas ? ctx.schemas[sourceName] : undefined;
    const schemaCols = schema?.columns ?? null;

    const series: ChartSeriesSpec[] = ySpecs.map((s) => {
      const fmt = s.format ? (s.format as ValueFormat) : schemaCols ? inferredFormatForType(schemaCols[s.key]) : undefined;
      return Object.assign(Object.create(null), { key: s.key, label: s.label }, fmt ? { format: fmt } : {});
    });
    const title = target.spec.title ?? target.id;
    const mark = ctx.chartMode === "spec" ? target.spec.kind : ctx.chartMode;
    const ySummary = series.map((s) => s.key).join(", ");
    const subtitle =
      mark === "line" ? `${sourceName}.${ySummary} over ${xField}` : `${sourceName}.${ySummary} by ${xField}`;

    const classes: Partial<ChartCardClasses> = Object.assign(Object.create(null), { container: "view", title: "view-title", subtitle: "muted" });
    const xFormat = target.spec.x.format
      ? (target.spec.x.format as ValueFormat)
      : schemaCols
        ? inferredFormatForType(schemaCols[xField])
        : undefined;

    const chartOpts = {
      title,
      subtitle,
      rows,
      xField,
      xLabel: target.spec.x.label,
      series,
      classes,
      ...(xFormat ? { xFormat } : {}),
    };
    if (mark === "line") return buildLineChartCard(chartOpts);
    if (mark === "bar") return buildBarChartCard(chartOpts);
    return null;
  }

  if (target.type === "layout") return buildLayout(target.spec, viewById, ctx);

  return null;
}

export function renderCalcdownViews(opts: RenderViewsOptions): void {
  const chartMode: ChartMode = opts.chartMode ?? "spec";
  clear(opts.container);
  if (opts.views.length === 0) return;

  const viewById = new Map(opts.views.map((v) => [v.id, v]));
  const rootLayout = opts.views.find((v) => v.type === "layout") ?? null;

  const ctx: {
    values: Record<string, unknown>;
    chartMode: ChartMode;
    schemas?: Record<string, DataTable>;
    onEditTableCell?: (ev: TableEditEvent) => void;
  } = { values: opts.values, chartMode };
  if (opts.tableSchemas) ctx.schemas = opts.tableSchemas;
  if (opts.onEditTableCell) ctx.onEditTableCell = opts.onEditTableCell;

  if (rootLayout && rootLayout.type === "layout") {
    opts.container.appendChild(buildLayout(rootLayout.spec, viewById, ctx));
    return;
  }

  for (const v of opts.views) {
    if (v.type === "layout") continue;
    const el = buildLayoutItem({ kind: "ref", ref: v.id }, viewById, ctx);
    if (el) opts.container.appendChild(el);
  }
}

export function renderCalcdownViewsInline(opts: RenderInlineViewsOptions): void {
  const chartMode: ChartMode = opts.chartMode ?? "spec";
  clear(opts.container);
  if (opts.views.length === 0) return;

  const viewById = new Map(opts.views.map((v) => [v.id, v]));

  const ctx: {
    values: Record<string, unknown>;
    chartMode: ChartMode;
    schemas?: Record<string, DataTable>;
    onEditTableCell?: (ev: TableEditEvent) => void;
  } = { values: opts.values, chartMode };
  if (opts.tableSchemas) ctx.schemas = opts.tableSchemas;
  if (opts.onEditTableCell) ctx.onEditTableCell = opts.onEditTableCell;

  for (const id of opts.render) {
    const el = buildLayoutItem({ kind: "ref", ref: id }, viewById, ctx);
    if (el) opts.container.appendChild(el);
  }
}
