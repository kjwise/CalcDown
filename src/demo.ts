import { evaluateProgram, parseProgram } from "./index.js";
import { parseViewBlock } from "./views.js";
import { FencedCodeBlock } from "./types.js";

const sourceEl = document.getElementById("source");
const outputEl = document.getElementById("output");
const runEl = document.getElementById("run");
const chartsEl = document.getElementById("charts");
const liveEl = document.getElementById("live");
const chartModeEl = document.getElementById("chartMode");

if (!(sourceEl instanceof HTMLTextAreaElement)) throw new Error("Missing #source textarea");
if (!(outputEl instanceof HTMLPreElement)) throw new Error("Missing #output pre");
if (!(runEl instanceof HTMLButtonElement)) throw new Error("Missing #run button");
if (!(chartsEl instanceof HTMLDivElement)) throw new Error("Missing #charts div");
if (!(liveEl instanceof HTMLInputElement)) throw new Error("Missing #live checkbox");
if (!(chartModeEl instanceof HTMLSelectElement)) throw new Error("Missing #chartMode select");

const source = sourceEl;
const output = outputEl;
const run = runEl;
const charts = chartsEl;
const live = liveEl;
const chartModeSelect = chartModeEl;

type ChartMode = "spec" | "line" | "bar";

function readChartMode(): ChartMode {
  const v = chartModeSelect.value;
  if (v === "line" || v === "bar" || v === "spec") return v;
  return "spec";
}

const DEBOUNCE_MS = 500;
let debounceTimer: number | null = null;

async function loadDefault(source: HTMLTextAreaElement): Promise<void> {
  try {
    const res = await fetch("../docs/examples/mortgage.calc.md");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    source.value = await res.text();
  } catch {
    source.value = `---
title: Minimal
calcdown: 0.3
---

## Inputs
\`\`\`inputs
loan_amount   : number = 300000
interest_rate : percent = 5.0
term_years    : integer = 30
\`\`\`

## Calc
\`\`\`calc
const total_months = term_years * 12;
const rate_mo = std.finance.toMonthlyRate(interest_rate);
const payment = std.finance.pmt(rate_mo, total_months, -loan_amount);
\`\`\`
`;
  }
}

function stringify(obj: unknown): string {
  const summarize = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v)) {
      if (v.length <= 30) return v.map(summarize);
      return {
        _type: "array",
        length: v.length,
        head: v.slice(0, 5).map(summarize),
        tail: v.slice(-5).map(summarize),
      };
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = Object.create(null);
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = summarize(val);
      }
      return out;
    }
    return v;
  };

  return JSON.stringify(summarize(obj), null, 2);
}

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

function formatXLabel(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v;
  return String(v);
}

function renderLineChart(
  container: HTMLElement,
  title: string,
  subtitle: string,
  rows: unknown[],
  xField: string,
  yField: string
): void {
  const points: { x: number; y: number }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const x = asNumber(rec[xField]);
    const y = asNumber(rec[yField]);
    if (x === null || y === null) continue;
    points.push({ x, y });
  }

  const card = document.createElement("div");
  card.className = "chart";

  const h3 = document.createElement("h3");
  h3.className = "chart-title";
  h3.textContent = title;
  card.appendChild(h3);

  const sub = document.createElement("p");
  sub.className = "chart-subtitle";
  sub.textContent = subtitle;
  card.appendChild(sub);

  if (points.length < 2) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot ${yField} vs ${xField}.`;
    card.appendChild(msg);
    container.appendChild(card);
    return;
  }

  points.sort((a, b) => a.x - b.x);

  let xmin = points[0]!.x;
  let xmax = points[0]!.x;
  let ymin = points[0]!.y;
  let ymax = points[0]!.y;
  for (const p of points) {
    xmin = Math.min(xmin, p.x);
    xmax = Math.max(xmax, p.x);
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) ymax = ymin + 1;

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 24, left: 46 };
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

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotH} L ${margin.left + plotW} ${margin.top + plotH}`
  );
  svg.appendChild(axis);

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#4c6fff");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");

  const d = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
    .join(" ");
  path.setAttribute("d", d);
  svg.appendChild(path);

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

  card.appendChild(svg);
  container.appendChild(card);
}

function renderBarChart(
  container: HTMLElement,
  title: string,
  subtitle: string,
  rows: unknown[],
  xField: string,
  yField: string
): void {
  const points: { label: string; sortKey: number | null; y: number }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const rawX = rec[xField];
    const y = asNumber(rec[yField]);
    if (y === null) continue;

    if (rawX instanceof Date) {
      points.push({ label: formatXLabel(rawX), sortKey: rawX.getTime(), y });
      continue;
    }
    if (typeof rawX === "number" && Number.isFinite(rawX)) {
      points.push({ label: formatXLabel(rawX), sortKey: rawX, y });
      continue;
    }
    if (typeof rawX === "string") {
      points.push({ label: rawX, sortKey: null, y });
      continue;
    }
  }

  const card = document.createElement("div");
  card.className = "chart";

  const h3 = document.createElement("h3");
  h3.className = "chart-title";
  h3.textContent = title;
  card.appendChild(h3);

  const sub = document.createElement("p");
  sub.className = "chart-subtitle";
  sub.textContent = subtitle;
  card.appendChild(sub);

  if (points.length < 1) {
    const msg = document.createElement("div");
    msg.textContent = `No data to plot ${yField} by ${xField}.`;
    card.appendChild(msg);
    container.appendChild(card);
    return;
  }

  const allSortable = points.every((p) => p.sortKey !== null);
  if (allSortable) {
    points.sort((a, b) => (a.sortKey as number) - (b.sortKey as number));
  }

  let ymin = points[0]!.y;
  let ymax = points[0]!.y;
  for (const p of points) {
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  ymin = Math.min(0, ymin);
  if (ymax === ymin) ymax = ymin + 1;

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 34, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.style.display = "block";

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

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotH} L ${margin.left + plotW} ${margin.top + plotH}`
  );
  svg.appendChild(axis);

  const n = points.length;
  const band = plotW / Math.max(1, n);
  const pad = 0.2;
  const barW = band * (1 - pad);
  const x0 = margin.left + (band * pad) / 2;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const x = x0 + i * band;
    const y = sy(p.y);
    const h = margin.top + plotH - y;

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x.toFixed(2));
    rect.setAttribute("y", y.toFixed(2));
    rect.setAttribute("width", barW.toFixed(2));
    rect.setAttribute("height", Math.max(0, h).toFixed(2));
    rect.setAttribute("rx", "2");
    rect.setAttribute("fill", "#4c6fff");
    rect.setAttribute("fill-opacity", "0.85");
    svg.appendChild(rect);
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

  // X labels (limited to ~6 to reduce clutter)
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  for (let i = 0; i < points.length; i += labelEvery) {
    const p = points[i]!;
    const cx = x0 + i * band + barW / 2;
    const tx = document.createElementNS(svgNS, "text");
    tx.setAttribute("x", cx.toFixed(2));
    tx.setAttribute("y", String(margin.top + plotH + 18));
    tx.setAttribute("fill", "#6a718a");
    tx.setAttribute("font-size", "10");
    tx.setAttribute("text-anchor", "middle");
    tx.textContent = p.label;
    svg.appendChild(tx);
  }

  card.appendChild(svg);
  container.appendChild(card);
}

function renderViews(
  charts: HTMLElement,
  chartMode: ChartMode,
  programBlocks: FencedCodeBlock[],
  values: Record<string, unknown>
): {
  messages: unknown[];
} {
  const messages: unknown[] = [];
  clear(charts);

  for (const block of programBlocks) {
    if (block.lang !== "view") continue;
    const parsed = parseViewBlock(block);
    messages.push(...parsed.messages);
    if (parsed.views.length === 0) continue;

    for (const view of parsed.views) {
      if (view.type !== "chart") continue;
      if (!view.source) continue;
      if (!view.spec || typeof view.spec !== "object" || view.spec === null) continue;

      let xField: string | null = null;
      let yField: string | null = null;
      let specMark: string | null = null;
      let title = view.id ?? "Chart";

      if (view.library === "calcdown") {
        const spec = view.spec as Record<string, unknown>;
        const x = spec.x as Record<string, unknown> | undefined;
        const y = spec.y as Record<string, unknown> | undefined;
        xField = typeof x?.key === "string" ? x.key : null;
        yField = typeof y?.key === "string" ? y.key : null;
        specMark = typeof spec.kind === "string" ? spec.kind : null;
        title = typeof spec.title === "string" ? spec.title : title;
      } else {
        // Best-effort Vega-Lite-ish parsing for the demo.
        const spec = view.spec as Record<string, unknown>;
        const encoding = spec.encoding as Record<string, unknown> | undefined;
        const x = encoding?.x as Record<string, unknown> | undefined;
        const y = encoding?.y as Record<string, unknown> | undefined;
        xField = typeof x?.field === "string" ? x.field : null;
        yField = typeof y?.field === "string" ? y.field : null;
        specMark = typeof spec.mark === "string" ? spec.mark : null;
        title = typeof spec.title === "string" ? spec.title : title;
      }

      const mark = chartMode === "spec" ? specMark : chartMode;

      if (!xField || !yField) continue;

      const rows = values[view.source];
      if (!Array.isArray(rows)) continue;

      if (mark === "line") {
        renderLineChart(charts, title, `${view.source}.${yField} over ${xField}`, rows, xField, yField);
      } else if (mark === "bar" || mark === "column") {
        renderBarChart(charts, title, `${view.source}.${yField} by ${xField}`, rows, xField, yField);
      }
    }
  }

  return { messages };
}

function runOnce(source: HTMLTextAreaElement, charts: HTMLDivElement, output: HTMLPreElement): void {
  const markdown = source.value;
  const parsed = parseProgram(markdown);
  const evaluated = evaluateProgram(parsed.program);
  const chartMode = readChartMode();
  const viewRes = renderViews(
    charts,
    chartMode,
    parsed.program.blocks,
    evaluated.values as Record<string, unknown>
  );

  output.textContent = stringify({
    parseMessages: parsed.messages,
    evalMessages: evaluated.messages,
    viewMessages: viewRes.messages,
    values: evaluated.values,
  });
}

function scheduleLiveRun(): void {
  if (!live.checked) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    runOnce(source, charts, output);
  }, DEBOUNCE_MS);
}

source.addEventListener("input", () => scheduleLiveRun());
chartModeSelect.addEventListener("change", () => runOnce(source, charts, output));
live.addEventListener("change", () => {
  if (live.checked) scheduleLiveRun();
});

run.addEventListener("click", () => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  runOnce(source, charts, output);
});

await loadDefault(source);
runOnce(source, charts, output);
