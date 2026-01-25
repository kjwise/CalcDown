import { parseProgram } from "./index.js";
import type { MountCalcdownHandle } from "./web/mount.js";
import { byId, createDebouncer, mountCalcdown, readInputOverrides, renderInputsForm } from "./web/index.js";

const run = byId("run", HTMLButtonElement, "run button");
const live = byId("live", HTMLInputElement, "live checkbox");
const inputsRoot = byId("inputs", HTMLDivElement, "inputs div");
const resultsRoot = byId("results", HTMLDivElement, "results div");
const messages = byId("messages", HTMLPreElement, "messages pre");
const source = byId("source", HTMLTextAreaElement, "source textarea");

const debouncer = createDebouncer(500);
let mounted: MountCalcdownHandle | null = null;

function recompute(): void {
  const overrides = readInputOverrides(inputsRoot);
  if (!mounted) mounted = mountCalcdown(resultsRoot, source.value, { showMessages: false });
  mounted.update(source.value, { overrides });

  messages.textContent = JSON.stringify(
    {
      messages: mounted.lastMessages(),
      overrides,
    },
    null,
    2
  );
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
    onChange: () => scheduleRecompute(),
  });
}

async function loadDefault(): Promise<void> {
  const res = await fetch("../docs/examples/savings.calc.md");
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
