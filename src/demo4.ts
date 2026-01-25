import { parseProgram } from "./index.js";
import type { DataTable } from "./types.js";
import { parseIsoDate } from "./util/date.js";
import type { MountCalcdownHandle } from "./web/mount.js";
import {
  byId,
  createDebouncer,
  mountCalcdown,
  readInputOverrides,
  renderInputsForm,
  type ChartMode,
  type TableEditEvent,
} from "./web/index.js";

const run = byId("run", HTMLButtonElement, "run button");
const live = byId("live", HTMLInputElement, "live checkbox");
const exampleSelect = byId("example", HTMLSelectElement, "example select");
const chartModeSelect = byId("chartMode", HTMLSelectElement, "chartMode select");
const inputsRoot = byId("inputs", HTMLDivElement, "inputs div");
const viewsRoot = byId("views", HTMLDivElement, "views div");
const messages = byId("messages", HTMLPreElement, "messages pre");
const source = byId("source", HTMLTextAreaElement, "source textarea");

const debouncer = createDebouncer(500);
let mounted: MountCalcdownHandle | null = null;

type TableState = Record<string, Record<string, unknown>[]>;
type TableSchemas = Record<string, DataTable>;

let tableSchemas: TableSchemas = Object.create(null);
let tableState: TableState = Object.create(null);

const EXAMPLES: Record<string, string> = Object.freeze({
  mortgage: "../docs/examples/mortgage.calc.md",
  savings: "../docs/examples/savings.calc.md",
  invoice: "../docs/examples/invoice.calc.md",
  cashflow: "../docs/examples/simple-cashflow.calc.md",
});

function readChartMode(): ChartMode {
  const v = chartModeSelect.value;
  if (v === "line" || v === "bar" || v === "spec") return v;
  return "spec";
}

function deepCopyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => Object.assign(Object.create(null), r));
}

function resetTablesFromProgram(parsedTables: DataTable[]): void {
  tableSchemas = Object.create(null);
  tableState = Object.create(null);

  for (const t of parsedTables) {
    tableSchemas[t.name] = t;
    if (t.source) continue;
    tableState[t.name] = deepCopyRows(t.rows);
  }
}

function updateTableStateByPrimaryKey(ev: TableEditEvent): void {
  const schema = tableSchemas[ev.tableName];
  const pkKey = schema?.primaryKey;
  if (!schema || !pkKey || !ev.primaryKey) return;

  const rows = tableState[ev.tableName];
  if (!rows) return;

  const idx = rows.findIndex((r) => {
    const raw = r[pkKey];
    const pk = typeof raw === "string" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : null;
    return pk === ev.primaryKey;
  });
  if (idx === -1) return;

  const colType = schema.columns[ev.column];
  let nextValue: unknown = ev.value;
  if (colType?.name === "date" && typeof ev.value === "string") {
    nextValue = parseIsoDate(ev.value);
  }

  rows[idx]![ev.column] = nextValue;
}

function scheduleRecompute(): void {
  if (!live.checked) return;
  debouncer.schedule(recompute);
}

function renderInputsFromSource(markdown: string): void {
  const parsed = parseProgram(markdown);
  renderInputsForm({ container: inputsRoot, inputs: parsed.program.inputs, onChange: () => scheduleRecompute() });
}

function recompute(): void {
  const overrides: Record<string, unknown> = Object.assign(Object.create(null), readInputOverrides(inputsRoot), tableState);
  if (!mounted) mounted = mountCalcdown(viewsRoot, source.value, { showMessages: false });
  mounted.update(source.value, {
    overrides,
    chartMode: readChartMode(),
    onEditTableCell: (ev) => {
      updateTableStateByPrimaryKey(ev);
      scheduleRecompute();
    },
  });

  messages.textContent = JSON.stringify(
    {
      messages: mounted.lastMessages(),
      overrides,
    },
    null,
    2
  );
}

async function loadSelectedExample(): Promise<void> {
  const key = exampleSelect.value;
  const url = EXAMPLES[key];
  if (!url) throw new Error(`Unknown example: ${key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  source.value = await res.text();
}

function resetFromSource(): void {
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
  renderInputsFromSource(source.value);
}

exampleSelect.addEventListener("change", async () => {
  debouncer.cancel();
  await loadSelectedExample();
  resetFromSource();
  recompute();
});

chartModeSelect.addEventListener("change", () => recompute());

run.addEventListener("click", () => {
  debouncer.cancel();
  resetFromSource();
  recompute();
});

live.addEventListener("change", () => {
  if (live.checked) scheduleRecompute();
});

source.addEventListener("input", () => {
  if (!live.checked) return;
  debouncer.schedule(() => {
    resetFromSource();
    recompute();
  });
});

await loadSelectedExample();
resetFromSource();
recompute();
