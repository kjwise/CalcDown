import { parseProgram } from "./index.js";
import type { CalcdownMessage, DataTable } from "./types.js";
import { applyPatch, buildSourceMap, type PatchOp } from "./editor/patcher.js";
import { byId, createDebouncer, renderCalcdownViews, renderInputsForm, runCalcdown } from "./web/index.js";

const run = byId("run", HTMLButtonElement, "run button");
const live = byId("live", HTMLInputElement, "live checkbox");
const inputsRoot = byId("inputs", HTMLDivElement, "inputs div");
const viewsRoot = byId("views", HTMLDivElement, "views div");
const messages = byId("messages", HTMLPreElement, "messages pre");
const source = byId("source", HTMLTextAreaElement, "source textarea");

const debouncer = createDebouncer(500);

type TableSchemas = Record<string, DataTable>;
let tableSchemas: TableSchemas = Object.create(null);
let editMessages: CalcdownMessage[] = [];

function applyEditorPatch(op: PatchOp): void {
  editMessages = [];
  const parsed = parseProgram(source.value);
  const map = buildSourceMap(parsed.program);
  try {
    source.value = applyPatch(source.value, op, map);
  } catch (err) {
    editMessages.push({
      severity: "error",
      code: "CD_EDITOR_PATCH",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function scheduleRecompute(): void {
  if (!live.checked) return;
  debouncer.schedule(recompute);
}

function renderInputsFromSource(markdown: string): void {
  const parsed = parseProgram(markdown);
  renderInputsForm({
    container: inputsRoot,
    inputs: parsed.program.inputs,
    onChange: (ev) => {
      applyEditorPatch({ kind: "updateInput", name: ev.name, value: ev.value });
      scheduleRecompute();
    },
  });
}

function resetSchemasFromProgram(parsedTables: DataTable[]): void {
  tableSchemas = Object.create(null);
  for (const t of parsedTables) tableSchemas[t.name] = t;
}

function recompute(): void {
  const res = runCalcdown(source.value);
  resetSchemasFromProgram(res.program.tables);

  renderCalcdownViews({
    container: viewsRoot,
    views: res.views,
    values: res.values,
    tableSchemas,
    onEditTableCell: (ev) => {
      if (!ev.primaryKey) return;
      applyEditorPatch({
        kind: "updateTableCell",
        tableName: ev.tableName,
        primaryKey: ev.primaryKey,
        column: ev.column,
        value: ev.value,
      });
      scheduleRecompute();
    },
  });

  messages.textContent = JSON.stringify(
    {
      parseMessages: res.parseMessages,
      evalMessages: res.evalMessages,
      viewMessages: res.viewMessages,
      editMessages,
    },
    null,
    2
  );
}

async function loadDefault(): Promise<void> {
  const res = await fetch("../docs/examples/invoice.calc.md");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  source.value = await res.text();
}

run.addEventListener("click", () => {
  debouncer.cancel();
  renderInputsFromSource(source.value);
  recompute();
});

live.addEventListener("change", () => {
  if (live.checked) scheduleRecompute();
});

source.addEventListener("input", () => {
  if (!live.checked) return;
  debouncer.schedule(() => {
    renderInputsFromSource(source.value);
    recompute();
  });
});

await loadDefault();
renderInputsFromSource(source.value);
recompute();
