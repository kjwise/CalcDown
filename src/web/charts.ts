import type { ValueFormat } from "../view_contract.js";
import { formatFormattedValue } from "./format.js";

export interface ChartCardClasses {
  container: string;
  title: string;
  subtitle: string;
}

export interface ChartSeriesSpec {
  key: string;
  label?: string;
  format?: ValueFormat;
  color?: string;
}

export interface ChartCardOptions {
  title: string;
  subtitle?: string;
  rows: Record<string, unknown>[];
  xField: string;
  xLabel?: string;
  xFormat?: ValueFormat;
  yField?: string;
  yLabel?: string;
  yFormat?: ValueFormat;
  series?: ChartSeriesSpec[];
  classes?: Partial<ChartCardClasses>;
}

const defaultClasses: ChartCardClasses = Object.freeze({
  container: "view",
  title: "view-title",
  subtitle: "muted",
});

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

function seriesFromOptions(opts: ChartCardOptions): ChartSeriesSpec[] {
  if (opts.series && opts.series.length) return opts.series;
  const key = opts.yField;
  if (!key) return [];
  const label = (opts.yLabel ?? "").trim() || key;
  return [Object.assign(Object.create(null), { key, label, ...(opts.yFormat ? { format: opts.yFormat } : {}) })];
}

const defaultSeriesColors = Object.freeze(["#4c6fff", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#06b6d4"]);

function formatXTick(x: number, opts: ChartCardOptions, xIsDate: boolean): string {
  const v: unknown = xIsDate ? new Date(x) : x;
  return formatFormattedValue(v, opts.xFormat);
}

function formatCategoryLabel(v: unknown, fmt: ValueFormat | undefined): string {
  return formatFormattedValue(v, fmt);
}

function uniqueSortedNumbers(values: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  let last: number | null = null;
  for (const v of sorted) {
    if (last === null || v !== last) out.push(v);
    last = v;
  }
  return out;
}

function pickXTicks(xs: number[], maxTicks: number): number[] {
  if (xs.length === 0) return [];
  if (xs.length <= maxTicks) return xs;
  const out: number[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const idx = Math.round((i * (xs.length - 1)) / (maxTicks - 1));
    const v = xs[idx]!;
    if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

function buildHeader(opts: ChartCardOptions): HTMLElement {
  const cls = Object.assign(Object.create(null), defaultClasses, opts.classes ?? {}) as ChartCardClasses;

  const container = document.createElement("div");
  container.className = cls.container;

  const h = document.createElement("div");
  h.className = cls.title;
  h.textContent = opts.title;
  container.appendChild(h);

  const subtitleText = opts.subtitle ?? "";
  if (subtitleText.trim()) {
    const sub = document.createElement("div");
    sub.className = cls.subtitle;
    sub.style.marginBottom = "10px";
    sub.textContent = subtitleText;
    container.appendChild(sub);
  }

  return container;
}

export function buildLineChartCard(opts: ChartCardOptions): HTMLElement {
  const view = buildHeader(opts);
  const series = seriesFromOptions(opts);
  if (series.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "Chart is missing required y series.";
    view.appendChild(msg);
    return view;
  }

  const xIsDate = opts.rows.some((r) => r[opts.xField] instanceof Date);

  const seriesPoints: { spec: ChartSeriesSpec; points: { x: number; y: number }[] }[] = [];
  const allPoints: { x: number; y: number }[] = [];

  for (const s of series) {
    const points: { x: number; y: number }[] = [];
    for (const row of opts.rows) {
      const x = asNumber(row[opts.xField]);
      const y = asNumber(row[s.key]);
      if (x === null || y === null) continue;
      points.push({ x, y });
      allPoints.push({ x, y });
    }
    if (points.length) seriesPoints.push({ spec: s, points });
  }

  if (allPoints.length < 2) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot series over ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }

  for (const sp of seriesPoints) sp.points.sort((a, b) => a.x - b.x);

  let xmin = allPoints[0]!.x;
  let xmax = allPoints[0]!.x;
  let ymin = allPoints[0]!.y;
  let ymax = allPoints[0]!.y;
  for (const p of allPoints) {
    xmin = Math.min(xmin, p.x);
    xmax = Math.max(xmax, p.x);
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) ymax = ymin + 1;

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 40, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const sx = (x: number) => margin.left + ((x - xmin) / (xmax - xmin)) * plotW;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.style.display = "block";

  const xTicks = pickXTicks(
    uniqueSortedNumbers(allPoints.map((p) => p.x)),
    6
  );

  const grid = document.createElementNS(svgNS, "path");
  grid.setAttribute("fill", "none");
  grid.setAttribute("stroke", "#eef0f6");
  grid.setAttribute("stroke-width", "1");
  const gridLines: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (plotH * i) / 4;
    gridLines.push(`M ${margin.left} ${y} L ${margin.left + plotW} ${y}`);
  }
  grid.setAttribute("d", gridLines.join(" "));
  svg.appendChild(grid);

  const vgrid = document.createElementNS(svgNS, "path");
  vgrid.setAttribute("fill", "none");
  vgrid.setAttribute("stroke", "#f4f5fa");
  vgrid.setAttribute("stroke-width", "1");
  const vgridLines: string[] = [];
  for (const tx of xTicks) {
    const x = sx(tx);
    vgridLines.push(`M ${x.toFixed(2)} ${margin.top.toFixed(2)} L ${x.toFixed(2)} ${(margin.top + plotH).toFixed(2)}`);
  }
  vgrid.setAttribute("d", vgridLines.join(" "));
  svg.appendChild(vgrid);

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotH} L ${margin.left + plotW} ${margin.top + plotH}`
  );
  svg.appendChild(axis);

  for (let si = 0; si < seriesPoints.length; si++) {
    const sp = seriesPoints[si]!;
    const color = sp.spec.color ?? defaultSeriesColors[si % defaultSeriesColors.length]!;

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute(
      "d",
      sp.points
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
        .join(" ")
    );
    svg.appendChild(path);
  }

  for (const tx of xTicks) {
    const x = sx(tx);

    const tick = document.createElementNS(svgNS, "path");
    tick.setAttribute("fill", "none");
    tick.setAttribute("stroke", "#c9cedf");
    tick.setAttribute("stroke-width", "1");
    tick.setAttribute("d", `M ${x.toFixed(2)} ${(margin.top + plotH).toFixed(2)} L ${x.toFixed(2)} ${(margin.top + plotH + 4).toFixed(2)}`);
    svg.appendChild(tick);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", String(margin.top + plotH + 18));
    label.setAttribute("fill", "#6a718a");
    label.setAttribute("font-size", "10");
    label.setAttribute("text-anchor", "middle");
    label.textContent = formatXTick(tx, opts, xIsDate);
    svg.appendChild(label);
  }

  if (seriesPoints.length > 1) {
    const legend = document.createElementNS(svgNS, "g");
    const startX = margin.left + plotW - 6;
    let y = margin.top + 8;
    for (let si = 0; si < seriesPoints.length; si++) {
      const sp = seriesPoints[si]!;
      const color = sp.spec.color ?? defaultSeriesColors[si % defaultSeriesColors.length]!;

      const line = document.createElementNS(svgNS, "path");
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "2");
      line.setAttribute("d", `M ${(startX - 46).toFixed(2)} ${y.toFixed(2)} L ${(startX - 32).toFixed(2)} ${y.toFixed(2)}`);
      legend.appendChild(line);

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", String(startX - 28));
      label.setAttribute("y", String(y + 3));
      label.setAttribute("fill", "#6a718a");
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "start");
      label.textContent = (sp.spec.label ?? sp.spec.key).trim() || sp.spec.key;
      legend.appendChild(label);

      y += 14;
    }
    svg.appendChild(legend);
  }

  const xAxisLabel = (opts.xLabel ?? "").trim() || opts.xField;
  const xLabel = document.createElementNS(svgNS, "text");
  xLabel.setAttribute("x", String(margin.left + plotW));
  xLabel.setAttribute("y", String(margin.top + plotH + 34));
  xLabel.setAttribute("fill", "#6a718a");
  xLabel.setAttribute("font-size", "10");
  xLabel.setAttribute("text-anchor", "end");
  xLabel.textContent = xAxisLabel;
  svg.appendChild(xLabel);

  const yLabel = document.createElementNS(svgNS, "text");
  yLabel.setAttribute("x", String(margin.left));
  yLabel.setAttribute("y", String(margin.top + 10));
  yLabel.setAttribute("fill", "#6a718a");
  yLabel.setAttribute("font-size", "11");
  yLabel.textContent = `${ymax.toFixed(2)}`;
  svg.appendChild(yLabel);

  const yLabelMin = document.createElementNS(svgNS, "text");
  yLabelMin.setAttribute("x", String(margin.left));
  yLabelMin.setAttribute("y", String(margin.top + plotH));
  yLabelMin.setAttribute("fill", "#6a718a");
  yLabelMin.setAttribute("font-size", "11");
  yLabelMin.textContent = `${ymin.toFixed(2)}`;
  svg.appendChild(yLabelMin);

  view.appendChild(svg);
  return view;
}

export function buildBarChartCard(opts: ChartCardOptions): HTMLElement {
  const view = buildHeader(opts);
  const series = seriesFromOptions(opts);
  if (series.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "Chart is missing required y series.";
    view.appendChild(msg);
    return view;
  }

  const categories: { label: string; ys: (number | null)[] }[] = [];
  for (const row of opts.rows) {
    const label = formatCategoryLabel(row[opts.xField], opts.xFormat);
    const ys = series.map((s) => asNumber(row[s.key]));
    if (ys.every((v) => v === null)) continue;
    categories.push({ label, ys });
  }

  if (categories.length < 1) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot series by ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 30, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  let ymin = 0;
  let ymax = 0;
  let found = false;
  for (const c of categories) {
    for (const y of c.ys) {
      if (y === null) continue;
      if (!found) {
        ymin = y;
        ymax = y;
        found = true;
        continue;
      }
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
    }
  }
  if (!found) ymin = 0;
  if (ymax === ymin) ymax = ymin + 1;

  const groupBand = plotW / categories.length;
  const seriesBand = groupBand / series.length;
  const barW = Math.max(2, seriesBand * 0.7);
  const groupX0 = margin.left;
  const barXInset = (seriesBand - barW) / 2;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.style.display = "block";

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotH} L ${margin.left + plotW} ${margin.top + plotH}`
  );
  svg.appendChild(axis);

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]!;
    const groupX = groupX0 + i * groupBand;
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!;
      const yv = c.ys[si] ?? null;
      if (yv === null) continue;
      const color = s.color ?? defaultSeriesColors[si % defaultSeriesColors.length]!;

      const x = groupX + si * seriesBand + barXInset;
      const y = sy(yv);
      const h = margin.top + plotH - y;

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", x.toFixed(2));
      rect.setAttribute("y", y.toFixed(2));
      rect.setAttribute("width", barW.toFixed(2));
      rect.setAttribute("height", h.toFixed(2));
      rect.setAttribute("fill", color);
      rect.setAttribute("rx", "3");
      svg.appendChild(rect);
    }
  }

  const yLabel = document.createElementNS(svgNS, "text");
  yLabel.setAttribute("x", String(margin.left));
  yLabel.setAttribute("y", String(margin.top + 10));
  yLabel.setAttribute("fill", "#6a718a");
  yLabel.setAttribute("font-size", "11");
  yLabel.textContent = `${ymax.toFixed(2)}`;
  svg.appendChild(yLabel);

  const yLabelMin = document.createElementNS(svgNS, "text");
  yLabelMin.setAttribute("x", String(margin.left));
  yLabelMin.setAttribute("y", String(margin.top + plotH));
  yLabelMin.setAttribute("fill", "#6a718a");
  yLabelMin.setAttribute("font-size", "11");
  yLabelMin.textContent = `${ymin.toFixed(2)}`;
  svg.appendChild(yLabelMin);

  if (series.length > 1) {
    const legend = document.createElementNS(svgNS, "g");
    const startX = margin.left + plotW - 6;
    let y = margin.top + 8;
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!;
      const color = s.color ?? defaultSeriesColors[si % defaultSeriesColors.length]!;

      const swatch = document.createElementNS(svgNS, "rect");
      swatch.setAttribute("x", String(startX - 46));
      swatch.setAttribute("y", String(y - 6));
      swatch.setAttribute("width", "10");
      swatch.setAttribute("height", "10");
      swatch.setAttribute("fill", color);
      swatch.setAttribute("rx", "2");
      legend.appendChild(swatch);

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", String(startX - 32));
      label.setAttribute("y", String(y + 3));
      label.setAttribute("fill", "#6a718a");
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "start");
      label.textContent = (s.label ?? s.key).trim() || s.key;
      legend.appendChild(label);

      y += 14;
    }
    svg.appendChild(legend);
  }

  const labelEvery = Math.max(1, Math.ceil(categories.length / 6));
  for (let i = 0; i < categories.length; i += labelEvery) {
    const c = categories[i]!;
    const cx = groupX0 + i * groupBand + groupBand / 2;
    const tx = document.createElementNS(svgNS, "text");
    tx.setAttribute("x", cx.toFixed(2));
    tx.setAttribute("y", String(margin.top + plotH + 22));
    tx.setAttribute("fill", "#6a718a");
    tx.setAttribute("font-size", "10");
    tx.setAttribute("text-anchor", "middle");
    tx.textContent = c.label;
    svg.appendChild(tx);
  }

  view.appendChild(svg);
  return view;
}
