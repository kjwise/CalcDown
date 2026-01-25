export interface ChartCardClasses {
  container: string;
  title: string;
  subtitle: string;
}

export interface ChartCardOptions {
  title: string;
  subtitle?: string;
  rows: Record<string, unknown>[];
  xField: string;
  yField: string;
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

function formatXLabel(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v;
  return String(v);
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
  const points: { x: number; y: number }[] = [];
  for (const row of opts.rows) {
    const x = asNumber(row[opts.xField]);
    const y = asNumber(row[opts.yField]);
    if (x === null || y === null) continue;
    points.push({ x, y });
  }

  if (points.length < 2) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot ${opts.yField} vs ${opts.xField}.`;
    view.appendChild(msg);
    return view;
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
  path.setAttribute(
    "d",
    points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(" ")
  );
  svg.appendChild(path);

  const xLabel = document.createElementNS(svgNS, "text");
  xLabel.setAttribute("x", String(margin.left));
  xLabel.setAttribute("y", String(margin.top + plotH + 18));
  xLabel.setAttribute("fill", "#6a718a");
  xLabel.setAttribute("font-size", "11");
  xLabel.textContent = formatXLabel(opts.rows[0]?.[opts.xField]);
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
  const points: { label: string; y: number }[] = [];
  for (const row of opts.rows) {
    const y = asNumber(row[opts.yField]);
    if (y === null) continue;
    points.push({ label: formatXLabel(row[opts.xField]), y });
  }

  if (points.length < 1) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot ${opts.yField} by ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 30, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  let ymin = points[0]!.y;
  let ymax = points[0]!.y;
  for (const p of points) {
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  if (ymax === ymin) ymax = ymin + 1;

  const band = plotW / points.length;
  const barW = Math.max(2, band * 0.7);
  const x0 = margin.left + (band - barW) / 2;
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

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const x = x0 + i * band;
    const y = sy(p.y);
    const h = margin.top + plotH - y;

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x.toFixed(2));
    rect.setAttribute("y", y.toFixed(2));
    rect.setAttribute("width", barW.toFixed(2));
    rect.setAttribute("height", h.toFixed(2));
    rect.setAttribute("fill", "#4c6fff");
    rect.setAttribute("rx", "3");
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

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  for (let i = 0; i < points.length; i += labelEvery) {
    const p = points[i]!;
    const cx = x0 + i * band + barW / 2;
    const tx = document.createElementNS(svgNS, "text");
    tx.setAttribute("x", cx.toFixed(2));
    tx.setAttribute("y", String(margin.top + plotH + 22));
    tx.setAttribute("fill", "#6a718a");
    tx.setAttribute("font-size", "10");
    tx.setAttribute("text-anchor", "middle");
    tx.textContent = p.label;
    svg.appendChild(tx);
  }

  view.appendChild(svg);
  return view;
}

