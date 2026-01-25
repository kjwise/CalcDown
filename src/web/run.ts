import { evaluateProgram, parseProgram } from "../index.js";
import type { CalcdownProgram } from "../index.js";
import type { CalcdownMessage } from "../types.js";
import type { StdRuntimeContext } from "../stdlib/std.js";
import type { CalcdownView } from "../view_contract.js";
import { validateViewsFromBlocks } from "../view_contract.js";

export interface CalcdownRunResult {
  program: CalcdownProgram;
  values: Record<string, unknown>;
  views: CalcdownView[];
  parseMessages: CalcdownMessage[];
  evalMessages: CalcdownMessage[];
  viewMessages: CalcdownMessage[];
}

export interface RunCalcdownOptions {
  overrides?: Record<string, unknown>;
  context?: StdRuntimeContext;
  validateViewSources?: boolean;
}

export function runCalcdown(markdown: string, opts: RunCalcdownOptions = {}): CalcdownRunResult {
  const parsed = parseProgram(markdown);
  const evaluated = evaluateProgram(parsed.program, opts.overrides ?? {}, opts.context ?? {});

  const validated = validateViewsFromBlocks(parsed.program.blocks);
  const viewMessages: CalcdownMessage[] = [...validated.messages];

  if (opts.validateViewSources ?? true) {
    const known = new Set<string>();
    for (const t of parsed.program.tables) known.add(t.name);
    for (const n of parsed.program.nodes) known.add(n.name);

    for (const v of validated.views) {
      if (v.type !== "table" && v.type !== "chart") continue;
      const src = v.source;
      if (!known.has(src)) {
        viewMessages.push({
          severity: "error",
          code: "CD_VIEW_UNKNOWN_SOURCE",
          message: `View source does not exist: ${src}`,
          line: v.line,
          blockLang: "view",
          nodeName: v.id,
        });
      }
    }
  }

  return {
    program: parsed.program,
    values: evaluated.values,
    views: validated.views,
    parseMessages: parsed.messages,
    evalMessages: evaluated.messages,
    viewMessages,
  };
}
