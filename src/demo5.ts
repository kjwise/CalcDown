import { parseProgram } from "./index.js";
import type { CalcdownMessage } from "./types.js";
import type { MountCalcdownHandle } from "./web/mount.js";
import {
  byId,
  createDebouncer,
  loadExternalTables,
  mountCalcdown,
  readInputOverrides,
  renderInputsForm,
} from "./web/index.js";

const run = byId("run", HTMLButtonElement, "run button");
const live = byId("live", HTMLInputElement, "live checkbox");
const status = byId("status", HTMLSpanElement, "status span");
const inputsRoot = byId("inputs", HTMLDivElement, "inputs div");
const viewsRoot = byId("views", HTMLDivElement, "views div");
const messages = byId("messages", HTMLPreElement, "messages pre");
const source = byId("source", HTMLTextAreaElement, "source textarea");

const debouncer = createDebouncer(500);
let mounted: MountCalcdownHandle | null = null;

let currentDocUrl: string | null = null;
let runSeq = 0;

function setStatus(kind: "idle" | "ok" | "err", text: string): void {
  const dot = status.querySelector(".dot");
  const textEl = status.querySelector("span:last-child");
  if (!(dot instanceof HTMLSpanElement) || !(textEl instanceof HTMLSpanElement)) return;
  dot.classList.remove("ok", "err");
  if (kind === "ok") dot.classList.add("ok");
  if (kind === "err") dot.classList.add("err");
  textEl.textContent = text;
}

function scheduleRecompute(): void {
  if (!live.checked) return;
  debouncer.schedule(() => void recompute());
}

function renderInputsFromSource(markdown: string): void {
  const parsed = parseProgram(markdown);
  renderInputsForm({ container: inputsRoot, inputs: parsed.program.inputs, onChange: () => scheduleRecompute() });
}

async function recompute(): Promise<void> {
  const seq = ++runSeq;

  const originUrl = currentDocUrl;
  if (!originUrl) {
    setStatus("err", "Missing document URL (reload page).");
    return;
  }

  const parsed = parseProgram(source.value);

  setStatus("idle", "Loading external data…");
  const external = await loadExternalTables(parsed.program.tables, originUrl);
  if (seq !== runSeq) return;

  setStatus(external.ok ? "ok" : "err", external.ok ? "External data OK (hash verified)" : "External data errors");

  const overrides: Record<string, unknown> = Object.assign(Object.create(null), readInputOverrides(inputsRoot), external.overrides);
  if (!mounted) mounted = mountCalcdown(viewsRoot, source.value, { showMessages: false });
  mounted.update(source.value, { overrides });

  const allMessages: CalcdownMessage[] = [...external.messages, ...mounted.lastMessages()];
  messages.textContent = JSON.stringify(
    {
      messages: allMessages,
      overrides,
    },
    null,
    2
  );
}

async function loadDefault(): Promise<void> {
  const res = await fetch("../docs/examples/invoice-external.calc.md");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  currentDocUrl = res.url;
  source.value = await res.text();
}

run.addEventListener("click", () => {
  debouncer.cancel();
  renderInputsFromSource(source.value);
  void recompute();
});

live.addEventListener("change", () => {
  if (live.checked) scheduleRecompute();
});

source.addEventListener("input", () => {
  if (!live.checked) return;
  debouncer.schedule(() => {
    renderInputsFromSource(source.value);
    void recompute();
  });
});

await loadDefault();
renderInputsFromSource(source.value);
setStatus("idle", "Loading external data…");
await recompute();

