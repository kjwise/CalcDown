import {
  buildBarChartCard,
  buildLineChartCard,
  byId,
  createDebouncer,
  runCalcdown,
  type ChartMode,
} from "./web/index.js";

const source = byId("source", HTMLTextAreaElement, "source textarea");
const output = byId("output", HTMLPreElement, "output pre");
const run = byId("run", HTMLButtonElement, "run button");
const charts = byId("charts", HTMLDivElement, "charts div");
const live = byId("live", HTMLInputElement, "live checkbox");
const chartModeSelect = byId("chartMode", HTMLSelectElement, "chartMode select");

const debouncer = createDebouncer(500);

function readChartMode(): ChartMode {
  const v = chartModeSelect.value;
  if (v === "line" || v === "bar" || v === "spec") return v;
  return "spec";
}

async function loadDefault(): Promise<void> {
  try {
    const res = await fetch(new URL("../docs/examples/mortgage.calc.md", import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    source.value = await res.text();
  } catch {
    source.value = `---\n` + `title: Minimal\n` + `calcdown: 0.9\n` + `---\n\n` + `\`\`\`inputs\n` + `loan_amount   : number = 300000\n` + `interest_rate : percent = 5.0\n` + `term_years    : integer = 30\n` + `\`\`\`\n\n` + `\`\`\`calc\n` + `const total_months = term_years * 12;\n` + `const rate_mo = std.finance.toMonthlyRate(interest_rate);\n` + `const payment = std.finance.pmt(rate_mo, total_months, -loan_amount);\n` + `\`\`\`\n`;
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

function renderCharts(res: ReturnType<typeof runCalcdown>, chartMode: ChartMode): void {
  clear(charts);

  for (const view of res.views) {
    if (view.type !== "chart") continue;

    const sourceName = view.source;
    const raw = res.values[sourceName];
    if (!Array.isArray(raw)) continue;
    const rows = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];

    const xField = view.spec.x.key;
    const ySpecs = Array.isArray(view.spec.y) ? view.spec.y : [view.spec.y];
    const series = ySpecs.map((s) => ({
      key: s.key,
      label: s.label,
      ...(s.format ? { format: s.format } : {}),
    }));
    const title = view.spec.title ?? view.id;
    const specKind = view.spec.kind;
    const mark = chartMode === "spec" ? specKind : chartMode;
    const ySummary = series.map((s) => s.key).join(", ");
    const subtitle = mark === "line" ? `${sourceName}.${ySummary} over ${xField}` : `${sourceName}.${ySummary} by ${xField}`;

    const classes = { container: "chart", title: "chart-title", subtitle: "chart-subtitle" };
    const chartOpts = {
      title,
      subtitle,
      rows,
      xField,
      xLabel: view.spec.x.label,
      series,
      classes,
      ...(view.spec.x.format ? { xFormat: view.spec.x.format } : {}),
    };
    const chart =
      mark === "line"
        ? buildLineChartCard(chartOpts)
        : buildBarChartCard(chartOpts);
    charts.appendChild(chart);
  }
}

function runOnce(): void {
  const res = runCalcdown(source.value);
  const chartMode = readChartMode();
  renderCharts(res, chartMode);

  output.textContent = stringify({
    parseMessages: res.parseMessages,
    evalMessages: res.evalMessages,
    viewMessages: res.viewMessages,
    values: res.values,
  });
}

function scheduleLiveRun(): void {
  if (!live.checked) return;
  debouncer.schedule(runOnce);
}

source.addEventListener("input", () => scheduleLiveRun());
chartModeSelect.addEventListener("change", () => runOnce());
live.addEventListener("change", () => {
  if (live.checked) scheduleLiveRun();
});

run.addEventListener("click", () => {
  debouncer.cancel();
  runOnce();
});

await loadDefault();
runOnce();
