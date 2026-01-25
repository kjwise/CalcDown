import type { InputDefinition } from "../types.js";
import { formatIsoDate } from "../util/date.js";

export type OverrideValue = string | number | boolean;

export interface InputChangeEvent {
  name: string;
  value: OverrideValue;
}

export interface RenderInputsOptions {
  container: HTMLElement;
  inputs: InputDefinition[];
  onChange?: (ev: InputChangeEvent) => void;
}

export function renderInputsForm(opts: RenderInputsOptions): void {
  const root = opts.container;
  while (root.firstChild) root.removeChild(root.firstChild);

  for (const def of opts.inputs) {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("label");
    label.textContent = `${def.name} (${def.type.raw})`;
    field.appendChild(label);

    const input = document.createElement("input");
    input.dataset.name = def.name;

    const fire = (value: OverrideValue) => opts.onChange?.({ name: def.name, value });

    const typeName = def.type.name;
    if (typeName === "boolean") {
      input.type = "checkbox";
      input.dataset.kind = "boolean";
      input.checked = Boolean(def.defaultValue);
      input.addEventListener("change", () => fire(input.checked));
    } else if (typeName === "date") {
      input.type = "date";
      input.value = def.defaultValue instanceof Date ? formatIsoDate(def.defaultValue) : String(def.defaultValue);
      input.addEventListener("input", () => {
        if (!input.value) return;
        fire(input.value);
      });
    } else if (
      typeName === "integer" ||
      typeName === "number" ||
      typeName === "decimal" ||
      typeName === "percent" ||
      typeName === "currency" ||
      typeof def.defaultValue === "number"
    ) {
      input.type = "number";
      input.dataset.kind = "number";
      input.step = typeName === "integer" ? "1" : typeName === "percent" ? "0.1" : "0.01";
      input.value = typeof def.defaultValue === "number" ? String(def.defaultValue) : String(def.defaultValue);
      input.addEventListener("input", () => {
        const n = input.valueAsNumber;
        if (!Number.isFinite(n)) return;
        const value = typeName === "integer" ? Math.trunc(n) : n;
        fire(value);
      });
    } else {
      input.type = "text";
      input.value = typeof def.defaultValue === "string" ? def.defaultValue : String(def.defaultValue);
      input.addEventListener("input", () => fire(input.value));
    }

    field.appendChild(input);
    root.appendChild(field);
  }
}

export function readInputOverrides(root: HTMLElement): Record<string, OverrideValue> {
  const out: Record<string, OverrideValue> = Object.create(null);
  for (const el of Array.from(root.querySelectorAll<HTMLInputElement>("input[data-name]"))) {
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
    if (el.type === "number") {
      const n = el.valueAsNumber;
      if (Number.isFinite(n)) out[name] = n;
      continue;
    }
    out[name] = el.value;
  }
  return out;
}

