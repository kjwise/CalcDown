import { evaluateProgram, parseProgram } from "./index.js";
import { formatIsoDate } from "./util/date.js";
import { parseViewBlock } from "./views.js";
import { CalcdownMessage, FencedCodeBlock } from "./types.js";

const runEl = document.getElementById("run");
const liveEl = document.getElementById("live");
const inputsEl = document.getElementById("inputs");
const resultsEl = document.getElementById("results");
const messagesEl = document.getElementById("messages");
const sourceEl = document.getElementById("source");

if (!(runEl instanceof HTMLButtonElement)) throw new Error("Missing #run button");
if (!(liveEl instanceof HTMLInputElement)) throw new Error("Missing #live checkbox");
if (!(inputsEl instanceof HTMLDivElement)) throw new Error("Missing #inputs div");
if (!(resultsEl instanceof HTMLDivElement)) throw new Error("Missing #results div");
if (!(messagesEl instanceof HTMLPreElement)) throw new Error("Missing #messages pre");
if (!(sourceEl instanceof HTMLTextAreaElement)) throw new Error("Missing #source textarea");

const run = runEl;
const live = liveEl;
const inputsRoot = inputsEl;
const resultsRoot = resultsEl;
const messages = messagesEl;
const source = sourceEl;

const DEBOUNCE_MS = 500;
let debounceTimer: number | null = null;

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function formatValue(v: unknown): string {
  if (v instanceof Date) return formatIsoDate(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (Array.isArray(v)) return `[array × ${v.length}]`;
  return "[object]";
}

type OverrideValue = string | number | boolean;

function readOverrides(): Record<string, OverrideValue> {
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

type CardFormat =
  | "number"
  | "integer"
  | "percent"
  | "date"
  | { kind: "number" | "integer" | "percent" | "currency" | "date"; digits?: number; currency?: string };

function formatCardValue(v: unknown, fmt: CardFormat | undefined): string {
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

function renderCards(resultTitle: string | null, items: { key: string; label?: string; format?: CardFormat }[], values: Record<string, unknown>): void {
  clear(resultsRoot);
  if (resultTitle) {
    const title = document.createElement("div");
    title.className = "muted";
    title.style.marginBottom = "8px";
    title.textContent = resultTitle;
    resultsRoot.appendChild(title);
  }

  for (const item of items) {
    const key = item.key;
    const card = document.createElement("div");
    card.className = "card";

    const k = document.createElement("div");
    k.className = "k";
    k.textContent = item.label ?? key;

    const v = document.createElement("div");
    v.className = "v";
    v.textContent = formatCardValue(values[key], item.format);

    card.appendChild(k);
    card.appendChild(v);
    resultsRoot.appendChild(card);
  }
}

function extractCardsView(blocks: FencedCodeBlock[], values: Record<string, unknown>): {
  rendered: boolean;
  messages: CalcdownMessage[];
} {
  const messages: CalcdownMessage[] = [];

  for (const b of blocks) {
    if (b.lang !== "view") continue;
    const parsed = parseViewBlock(b);
    messages.push(...parsed.messages);
    for (const view of parsed.views) {
      if (view.type !== "cards") continue;
      if (!view.spec || typeof view.spec !== "object" || view.spec === null) continue;

      const spec = view.spec as Record<string, unknown>;
      const itemsRaw = spec.items;
      if (!Array.isArray(itemsRaw)) continue;

      const items: { key: string; label?: string; format?: CardFormat }[] = [];
      for (const it of itemsRaw) {
        if (!it || typeof it !== "object") continue;
        const obj = it as Record<string, unknown>;
        const key = typeof obj.key === "string" ? obj.key : null;
        if (!key) continue;
        const label = typeof obj.label === "string" ? obj.label : undefined;
        const format = (obj.format as CardFormat | undefined) ?? undefined;
        items.push({ key, ...(label ? { label } : {}), ...(format ? { format } : {}) });
      }

      if (items.length === 0) continue;

      const title = typeof spec.title === "string" ? spec.title : null;
      renderCards(title, items, values);
      return { rendered: true, messages };
    }
  }

  return { rendered: false, messages };
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

function recompute(): void {
  const parsed = parseProgram(source.value);
  const overrides = readOverrides();
  const evaluated = evaluateProgram(parsed.program, overrides);

  const viewRes = extractCardsView(parsed.program.blocks, evaluated.values);
  if (!viewRes.rendered) {
    const fmResults = parsed.program.frontMatter?.data?.results;
    const keys =
      desiredResultKeys(fmResults) ??
      parsed.program.nodes.map((n) => n.name).filter((k) => typeof evaluated.values[k] !== "object");
    renderCards(null, keys.slice(0, 8).map((k) => ({ key: k })), evaluated.values);
  }

  messages.textContent = JSON.stringify(
    {
      parseMessages: parsed.messages,
      evalMessages: evaluated.messages,
      viewMessages: viewRes.messages,
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
  const res = await fetch("../docs/examples/savings.calc.md");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  source.value = await res.text();
}

run.addEventListener("click", () => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
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
    renderInputsFromSource(source.value);
    recompute();
  }, DEBOUNCE_MS);
});

await loadDefault();
renderInputsFromSource(source.value);
recompute();
