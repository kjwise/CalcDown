import { addMonthsUTC, formatIsoDate, parseIsoDate } from "../util/date.js";

type Module = Record<string, unknown>;

function makeModule<T extends Module>(entries: T): Readonly<T> {
  const obj = Object.assign(Object.create(null), entries) as T;
  return Object.freeze(obj);
}

const bannedProperties = new Set(["__proto__", "prototype", "constructor"]);

function assertSafeKey(key: string, prefix: string): void {
  if (!key) throw new Error(`${prefix}: expected key string`);
  if (bannedProperties.has(key)) throw new Error(`${prefix}: disallowed key: ${key}`);
}

function pmt(rate: number, nper: number, pv: number, fv = 0, type = 0): number {
  if (!Number.isFinite(rate) || !Number.isFinite(nper) || !Number.isFinite(pv) || !Number.isFinite(fv)) {
    throw new Error("pmt: invalid arguments");
  }
  if (nper === 0) throw new Error("pmt: nper must be non-zero");
  if (type !== 0 && type !== 1) throw new Error("pmt: type must be 0 or 1");
  if (rate === 0) return -(pv + fv) / nper;
  const pow = (1 + rate) ** nper;
  return -(rate * (fv + pv * pow)) / ((1 + rate * type) * (pow - 1));
}

export const std = makeModule({
  math: makeModule({
    sum(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("sum: expected array");
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number") throw new Error("sum: expected number array");
        s += v;
      }
      return s;
    },
  }),

  data: makeModule({
    sequence(count: number, opts?: { start?: number; step?: number }): number[] {
      if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
        throw new Error("sequence: count must be a non-negative integer");
      }
      const start = opts?.start ?? 1;
      const step = opts?.step ?? 1;
      const out = new Array<number>(count);
      for (let i = 0; i < count; i++) out[i] = start + i * step;
      return out;
    },
    filter<T>(items: T[], predicate: (item: T, index: number) => unknown): T[] {
      if (!Array.isArray(items)) throw new Error("filter: expected array");
      if (typeof predicate !== "function") throw new Error("filter: expected predicate function");
      const out: T[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (predicate(item, i)) out.push(item);
      }
      return out;
    },
    sortBy<T extends Record<string, unknown>>(rows: unknown, key: string, direction: "asc" | "desc" = "asc"): T[] {
      if (!Array.isArray(rows)) throw new Error("sortBy: expected rows array");
      assertSafeKey(key, "sortBy");
      if (direction !== "asc" && direction !== "desc") throw new Error("sortBy: direction must be 'asc' or 'desc'");

      type SortKey = { kind: "none" } | { kind: "number"; value: number } | { kind: "string"; value: string };

      function getKey(row: unknown): SortKey {
        if (!row || typeof row !== "object") throw new Error("sortBy: expected row objects");
        const rec = row as Record<string, unknown>;
        const v = Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : undefined;
        if (v === undefined || v === null) return { kind: "none" };
        if (v instanceof Date) return { kind: "number", value: v.getTime() };
        if (typeof v === "number") {
          if (!Number.isFinite(v)) throw new Error("sortBy: expected finite number keys");
          return { kind: "number", value: v };
        }
        if (typeof v === "string") return { kind: "string", value: v };
        throw new Error("sortBy: unsupported key type");
      }

      const withKeys = (rows as unknown[]).map((row, index) => ({ row, index, k: getKey(row) }));

      let kind: SortKey["kind"] | null = null;
      for (const r of withKeys) {
        if (r.k.kind === "none") continue;
        kind = kind ?? r.k.kind;
        if (kind !== r.k.kind) throw new Error("sortBy: mixed key types");
      }

      const dir = direction === "desc" ? -1 : 1;
      withKeys.sort((a, b) => {
        const ak = a.k;
        const bk = b.k;
        if (ak.kind === "none" && bk.kind === "none") return a.index - b.index;
        if (ak.kind === "none") return 1;
        if (bk.kind === "none") return -1;
        if (ak.kind !== bk.kind) return 0;
        if (ak.kind === "number") {
          const d = ak.value - (bk as Extract<SortKey, { kind: "number" }>).value;
          if (d !== 0) return d * dir;
          return a.index - b.index;
        }
        const cmp = ak.value < (bk as Extract<SortKey, { kind: "string" }>).value ? -1 : ak.value > (bk as Extract<SortKey, { kind: "string" }>).value ? 1 : 0;
        if (cmp !== 0) return cmp * dir;
        return a.index - b.index;
      });

      return withKeys.map((r) => r.row as T);
    },
    last<T>(items: T[]): T {
      if (!Array.isArray(items)) throw new Error("last: expected array");
      if (items.length === 0) throw new Error("last: empty array");
      return items[items.length - 1]!;
    },
    scan<TItem, TState>(
      items: TItem[],
      reducer: (state: TState, item: TItem, index: number) => TState,
      seedOrOptions: TState | { seed: TState }
    ): TState[] {
      if (!Array.isArray(items)) throw new Error("scan: expected array items");
      if (typeof reducer !== "function") throw new Error("scan: expected reducer function");
      const seed =
        seedOrOptions &&
        typeof seedOrOptions === "object" &&
        "seed" in seedOrOptions &&
        Object.prototype.hasOwnProperty.call(seedOrOptions, "seed")
          ? (seedOrOptions as { seed: TState }).seed
          : (seedOrOptions as TState);
      const out: TState[] = [];
      let state = seed;
      for (let i = 0; i < items.length; i++) {
        state = reducer(state, items[i]!, i);
        out.push(state);
      }
      return out;
    },
  }),

  table: makeModule({
    col<T = unknown>(rows: unknown, key: string): T[] {
      if (!Array.isArray(rows)) throw new Error("col: expected rows array");
      assertSafeKey(key, "col");
      const out: T[] = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") throw new Error("col: expected row objects");
        const v = Object.prototype.hasOwnProperty.call(row, key) ? (row as Record<string, unknown>)[key] : undefined;
        out.push(v as T);
      }
      return out;
    },
    map<TIn extends Record<string, unknown>, TOut>(rows: unknown, mapper: (row: TIn, index: number) => TOut): TOut[] {
      if (!Array.isArray(rows)) throw new Error("map: expected rows array");
      if (typeof mapper !== "function") throw new Error("map: expected mapper function");
      const out: TOut[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== "object") throw new Error("map: expected row objects");
        out.push(mapper(row as TIn, i));
      }
      return out;
    },
    sum(rows: unknown, key: string): number {
      const xs = std.table.col(rows, key) as unknown[];
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("sum: expected finite numbers");
        s += v;
      }
      return s;
    },
  }),

  date: makeModule({
    parse(value: string): Date {
      if (typeof value !== "string") throw new Error("parse: expected ISO date string");
      return parseIsoDate(value);
    },
    format(date: Date, template: string): string {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("format: invalid date");
      if (typeof template !== "string") throw new Error("format: expected template string");
      if (template === "%Y-%m-%d") return formatIsoDate(date);

      let out = "";
      for (let i = 0; i < template.length; i++) {
        const ch = template[i]!;
        if (ch !== "%") {
          out += ch;
          continue;
        }
        const next = template[i + 1];
        if (!next) throw new Error("format: dangling %");
        i++;
        if (next === "%") {
          out += "%";
          continue;
        }
        if (next === "Y") {
          out += String(date.getUTCFullYear()).padStart(4, "0");
          continue;
        }
        if (next === "m") {
          out += String(date.getUTCMonth() + 1).padStart(2, "0");
          continue;
        }
        if (next === "d") {
          out += String(date.getUTCDate()).padStart(2, "0");
          continue;
        }
        throw new Error(`format: unsupported token: %${next}`);
      }

      return out;
    },
    addMonths(date: Date, months: number): Date {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("addMonths: invalid date");
      if (!Number.isFinite(months) || !Number.isInteger(months)) throw new Error("addMonths: months must be integer");
      return addMonthsUTC(date, months);
    },
  }),

  finance: makeModule({
    toMonthlyRate(annualPercent: number): number {
      if (!Number.isFinite(annualPercent)) throw new Error("toMonthlyRate: annualPercent must be finite");
      return annualPercent / 100 / 12;
    },
    pmt,
  }),

  assert: makeModule({
    that(condition: unknown, message = "Assertion failed"): void {
      if (!condition) throw new Error(message);
    },
  }),
});

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) return value;
  seen.add(obj);

  for (const key of Object.keys(value as unknown as Record<string, unknown>)) {
    deepFreeze((value as unknown as Record<string, unknown>)[key], seen);
  }
  Object.freeze(value as unknown as object);
  return value;
}

deepFreeze(std);
