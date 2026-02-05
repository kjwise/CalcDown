import { parseInputsBlock } from "../inputs.js";
import { extractFrontMatter } from "../markdown.js";
import type { CalcdownMessage, DataTable, FencedCodeBlock } from "../types.js";
import type { CalcdownView, LayoutItem } from "../view_contract.js";
import { parseViewBlock } from "../views.js";
import type { CalcdownRunResult } from "./run.js";
import { renderInputsForm, type InputChangeEvent, type OverrideValue } from "./inputs_form.js";
import type { ChartMode, TableEditEvent } from "./render_views.js";
import { renderCalcdownViewsInline } from "./render_views.js";
import { renderMarkdownText } from "./markdown_render.js";

export interface CalcdownDocumentViewSlot {
  container: HTMLElement;
  renderIds: string[];
}

export interface RenderCalcdownDocumentOptions {
  container: HTMLElement;
  markdown: string;
  run: CalcdownRunResult;
  chartMode?: ChartMode;
  tableSchemas?: Record<string, DataTable>;
  overrides?: Record<string, unknown>;
  onInputChange?: (ev: InputChangeEvent) => void;
  onEditTableCell?: (ev: TableEditEvent) => void;
  showSourceBlocks?: boolean;
}

export interface CalcdownDocumentState {
  viewSlots: CalcdownDocumentViewSlot[];
  messages: CalcdownMessage[];
}

type DocPart = { kind: "text"; text: string } | { kind: "block"; block: FencedCodeBlock };

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function buildParts(body: string, bodyStartLine: number, blocks: FencedCodeBlock[]): DocPart[] {
  const lines = body.split(/\r?\n/);
  const parts: DocPart[] = [];

  let cursor = 0; // 0-based line index in body

  for (const block of blocks) {
    const openIdx = block.fenceLine - bodyStartLine;
    if (openIdx > cursor) {
      const text = lines.slice(cursor, openIdx).join("\n");
      parts.push({ kind: "text", text });
    }

    parts.push({ kind: "block", block });

    const closeLine = block.closeFenceLine ?? bodyStartLine + lines.length - 1;
    const closeIdx = closeLine - bodyStartLine;
    cursor = Math.min(lines.length, Math.max(cursor, closeIdx + 1));
  }

  if (cursor < lines.length) {
    parts.push({ kind: "text", text: lines.slice(cursor).join("\n") });
  }

  return parts;
}

function renderCodeBlock(container: HTMLElement, block: FencedCodeBlock): void {
  const wrapper = document.createElement("div");
  wrapper.className = "calcdown-code";

  const header = document.createElement("div");
  header.className = "calcdown-code-title";
  header.textContent = block.info ? block.info.trim() : block.lang ? block.lang : "code";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = block.content;
  pre.appendChild(code);

  wrapper.appendChild(header);
  wrapper.appendChild(pre);
  container.appendChild(wrapper);
}

function collectLayoutRefs(items: LayoutItem[], out: Set<string>): void {
  for (const it of items) {
    if (it.kind === "ref") out.add(it.ref);
    else collectLayoutRefs(it.spec.items, out);
  }
}

function calcdownLibrary(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : "calcdown";
}

function viewIdsInBlock(block: FencedCodeBlock): { idsInOrder: string[]; hasLayout: boolean } {
  const parsed = parseViewBlock(block);
  const ids: string[] = [];
  const seen = new Set<string>();
  let hasLayout = false;

  for (const v of parsed.views) {
    if (!v.id) continue;
    const id = v.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    const lib = calcdownLibrary(v.library);
    if (lib === "calcdown" && v.type && v.type.trim() === "layout") hasLayout = true;
  }

  return { idsInOrder: ids, hasLayout };
}

function computeRenderIdsForViewBlock(opts: {
  block: FencedCodeBlock;
  allViews: CalcdownView[];
  viewById: Map<string, CalcdownView>;
  anyLayout: boolean;
  layoutRefs: Set<string>;
}): string[] {
  const { idsInOrder, hasLayout } = viewIdsInBlock(opts.block);
  if (idsInOrder.length === 0) return [];

  const layoutIds: string[] = [];
  const nonLayoutIds: string[] = [];

  for (const id of idsInOrder) {
    const v = opts.viewById.get(id);
    if (!v) continue;
    if (v.type === "layout") layoutIds.push(id);
    else nonLayoutIds.push(id);
  }

  if (hasLayout && layoutIds.length > 0) return layoutIds;

  if (opts.anyLayout) {
    return nonLayoutIds.filter((id) => !opts.layoutRefs.has(id));
  }

  return nonLayoutIds;
}

export function renderCalcdownDocument(opts: RenderCalcdownDocumentOptions): CalcdownDocumentState {
  clear(opts.container);

  const { body, bodyStartLine } = extractFrontMatter(opts.markdown);
  const parts = buildParts(body, bodyStartLine, opts.run.program.blocks);

  const allViews = opts.run.views;
  const viewById = new Map(allViews.map((v) => [v.id, v]));

  const layoutRefs = new Set<string>();
  const anyLayout = allViews.some((v) => v.type === "layout");
  if (anyLayout) {
    for (const v of allViews) {
      if (v.type !== "layout") continue;
      collectLayoutRefs(v.spec.items, layoutRefs);
    }
  }

  const viewSlots: CalcdownDocumentViewSlot[] = [];

  for (const part of parts) {
    if (part.kind === "text") {
      if (!part.text.trim()) continue;
      const md = document.createElement("div");
      md.className = "calcdown-md";
      renderMarkdownText(md, part.text);
      if (md.childNodes.length) opts.container.appendChild(md);
      continue;
    }

    const block = part.block;

    if (block.lang === "inputs") {
      const parsed = parseInputsBlock(block);
      const el = document.createElement("div");
      el.className = "calcdown-inputs view";
      renderInputsForm(
        Object.assign(
          Object.create(null),
          { container: el, inputs: parsed.inputs, onChange: opts.onInputChange },
          opts.overrides ? { overrides: opts.overrides as Record<string, OverrideValue> } : {}
        )
      );
      opts.container.appendChild(el);
      continue;
    }

    if (block.lang === "view") {
      const slotEl = document.createElement("div");
      slotEl.className = "calcdown-view-block";
      opts.container.appendChild(slotEl);

      const renderIds = computeRenderIdsForViewBlock({ block, allViews, viewById, anyLayout, layoutRefs });
      viewSlots.push({ container: slotEl, renderIds });

      if (renderIds.length > 0) {
        renderCalcdownViewsInline({
          container: slotEl,
          views: allViews,
          render: renderIds,
          values: opts.run.values,
          ...(opts.chartMode ? { chartMode: opts.chartMode } : {}),
          ...(opts.tableSchemas ? { tableSchemas: opts.tableSchemas } : {}),
          ...(opts.onEditTableCell ? { onEditTableCell: opts.onEditTableCell } : {}),
        });
      }

      continue;
    }

    if (opts.showSourceBlocks && (block.lang === "data" || block.lang === "calc")) {
      renderCodeBlock(opts.container, block);
      continue;
    }

    if (block.lang !== "data" && block.lang !== "calc") {
      // Render unknown/literal fences as normal code blocks.
      renderCodeBlock(opts.container, block);
      continue;
    }
  }

  const messages: CalcdownMessage[] = [...opts.run.parseMessages, ...opts.run.evalMessages, ...opts.run.viewMessages];
  return { viewSlots, messages };
}

export function updateCalcdownDocumentViews(
  state: CalcdownDocumentState,
  run: CalcdownRunResult,
  opts: { chartMode?: ChartMode; tableSchemas?: Record<string, DataTable>; onEditTableCell?: (ev: TableEditEvent) => void }
): { messages: CalcdownMessage[] } {
  for (const slot of state.viewSlots) {
    if (slot.renderIds.length === 0) continue;
    renderCalcdownViewsInline({
      container: slot.container,
      views: run.views,
      render: slot.renderIds,
      values: run.values,
      ...(opts.chartMode ? { chartMode: opts.chartMode } : {}),
      ...(opts.tableSchemas ? { tableSchemas: opts.tableSchemas } : {}),
      ...(opts.onEditTableCell ? { onEditTableCell: opts.onEditTableCell } : {}),
    });
  }

  const messages: CalcdownMessage[] = [...run.parseMessages, ...run.evalMessages, ...run.viewMessages];
  return { messages };
}
