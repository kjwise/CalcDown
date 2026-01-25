import type { StdRuntimeContext } from "../stdlib/std.js";
import type { CalcdownMessage } from "../types.js";
import type { DataTable } from "../types.js";
import type { ChartMode, TableEditEvent } from "./render_views.js";
import { clear } from "./dom.js";
import { renderCalcdownViews } from "./render_views.js";
import { runCalcdown } from "./run.js";

export interface MountCalcdownOptions {
  chartMode?: ChartMode;
  overrides?: Record<string, unknown>;
  context?: StdRuntimeContext;
  showMessages?: boolean;
  onEditTableCell?: (ev: TableEditEvent) => void;
}

export interface MountCalcdownHandle {
  update(markdown: string, opts?: Partial<MountCalcdownOptions>): void;
  destroy(): void;
  lastMessages(): CalcdownMessage[];
}

export function mountCalcdown(container: HTMLElement, markdown: string, opts: MountCalcdownOptions = {}): MountCalcdownHandle {
  const root = document.createElement("div");
  root.className = "calcdown-root";

  const viewsEl = document.createElement("div");
  viewsEl.className = "calcdown-views";
  root.appendChild(viewsEl);

  const messagesEl = document.createElement("pre");
  messagesEl.className = "calcdown-messages";

  container.appendChild(root);

  let lastMsgs: CalcdownMessage[] = [];
  let showMessages = Boolean(opts.showMessages);

  function render(nextMarkdown: string, nextOpts: MountCalcdownOptions): void {
    const runOpts: { overrides?: Record<string, unknown>; context?: StdRuntimeContext } = Object.create(null);
    if (nextOpts.overrides !== undefined) runOpts.overrides = nextOpts.overrides;
    if (nextOpts.context !== undefined) runOpts.context = nextOpts.context;
    const res = runCalcdown(nextMarkdown, runOpts);

    const tableSchemas: Record<string, DataTable> = Object.create(null);
    for (const t of res.program.tables) tableSchemas[t.name] = t;

    const renderOpts: {
      container: HTMLElement;
      views: typeof res.views;
      values: typeof res.values;
      chartMode?: ChartMode;
      tableSchemas?: Record<string, DataTable>;
      onEditTableCell?: (ev: TableEditEvent) => void;
    } = { container: viewsEl, views: res.views, values: res.values };
    if (nextOpts.chartMode !== undefined) renderOpts.chartMode = nextOpts.chartMode;
    renderOpts.tableSchemas = tableSchemas;
    if (nextOpts.onEditTableCell) renderOpts.onEditTableCell = nextOpts.onEditTableCell;
    renderCalcdownViews(renderOpts);

    lastMsgs = [...res.parseMessages, ...res.evalMessages, ...res.viewMessages];

    if (showMessages) {
      if (!messagesEl.isConnected) root.appendChild(messagesEl);
      messagesEl.textContent = JSON.stringify(lastMsgs, null, 2);
    } else if (messagesEl.isConnected) {
      messagesEl.remove();
    }
  }

  render(markdown, opts);

  return {
    update(nextMarkdown, updateOpts) {
      const merged: MountCalcdownOptions = Object.assign(Object.create(null), opts, updateOpts ?? {});
      showMessages = Boolean(merged.showMessages);
      render(nextMarkdown, merged);
    },
    destroy() {
      clear(viewsEl);
      if (messagesEl.isConnected) messagesEl.remove();
      root.remove();
    },
    lastMessages() {
      return [...lastMsgs];
    },
  };
}
