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

const LOOKUP_INDEX = Symbol("calcdown.lookup.index");
type LookupIndex = { [LOOKUP_INDEX]: { keyColumn: string; map: Map<string, Record<string, unknown>[]> } };

function mapKeyOf(v: unknown): string | null {
  if (typeof v === "string") return `s:${v}`;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return `n:${String(v)}`;
  }
  return null;
}

function asLookupIndex(v: unknown): LookupIndex {
  if (!v || (typeof v !== "object" && typeof v !== "function")) throw new Error("lookup.get: invalid index");
  if (!(LOOKUP_INDEX in (v as object))) throw new Error("lookup.get: invalid index");
  return v as LookupIndex;
}

function makeLookupIndex(keyColumn: string, map: Map<string, Record<string, unknown>[]>): LookupIndex {
  const idx = Object.create(null) as LookupIndex;
  (idx as unknown as Record<symbol, unknown>)[LOOKUP_INDEX] = { keyColumn, map };
  return Object.freeze(idx);
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
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("sum: expected finite number array");
        s += v;
      }
      return s;
    },
    mean(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("mean: expected array");
      if (xs.length === 0) throw new Error("mean: empty array");
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("mean: expected finite number array");
        s += v;
      }
      return s / xs.length;
    },
    minOf(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("minOf: expected array");
      if (xs.length === 0) throw new Error("minOf: empty array");
      let min: number | null = null;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("minOf: expected finite number array");
        min = min === null ? v : Math.min(min, v);
      }
      return min ?? 0;
    },
    maxOf(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("maxOf: expected array");
      if (xs.length === 0) throw new Error("maxOf: empty array");
      let max: number | null = null;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("maxOf: expected finite number array");
        max = max === null ? v : Math.max(max, v);
      }
      return max ?? 0;
    },
    round(x: number, digits = 0): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("round: x must be finite");
      if (typeof digits !== "number" || !Number.isFinite(digits) || !Number.isInteger(digits)) {
        throw new Error("round: digits must be integer");
      }

      // Spreadsheet-style rounding: half away from zero.
      const roundHalfAwayFromZero = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

      if (digits === 0) return roundHalfAwayFromZero(x);

      const abs = Math.abs(digits);
      if (abs > 12) throw new Error("round: digits out of range");
      const factor = 10 ** abs;
      if (!Number.isFinite(factor) || factor === 0) throw new Error("round: digits out of range");

      if (digits > 0) return roundHalfAwayFromZero(x * factor) / factor;
      return roundHalfAwayFromZero(x / factor) * factor;
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
    filter<TIn extends Record<string, unknown>>(rows: unknown, predicate: (row: TIn, index: number) => unknown): TIn[] {
      if (!Array.isArray(rows)) throw new Error("filter: expected rows array");
      if (typeof predicate !== "function") throw new Error("filter: expected predicate function");
      const out: TIn[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== "object") throw new Error("filter: expected row objects");
        if (predicate(row as TIn, i)) out.push(row as TIn);
      }
      return out;
    },
    sortBy<T extends Record<string, unknown>>(rows: unknown, key: string, direction: "asc" | "desc" = "asc"): T[] {
      return std.data.sortBy(rows, key, direction) as T[];
    },
    groupBy<T extends Record<string, unknown>>(
      rows: unknown,
      key: string | ((row: T, index: number) => unknown)
    ): Array<{ key: string | number; rows: T[] }> {
      if (!Array.isArray(rows)) throw new Error("groupBy: expected rows array");

      let getKey: (row: T, index: number) => unknown;
      if (typeof key === "string") {
        assertSafeKey(key, "groupBy");
        getKey = (row) => (row as Record<string, unknown>)[key];
      } else if (typeof key === "function") {
        getKey = key;
      } else {
        throw new Error("groupBy: key must be a string or function");
      }

      const by = new Map<string, { key: string | number; rows: T[] }>();
      const ordered: Array<{ key: string | number; rows: T[] }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== "object") throw new Error("groupBy: expected row objects");
        const kv = getKey(row as T, i);
        const kind = typeof kv;
        if (kind !== "string" && kind !== "number") {
          throw new Error("groupBy: key values must be strings or numbers");
        }
        if (kind === "number" && !Number.isFinite(kv as number)) {
          throw new Error("groupBy: key values must be finite numbers");
        }
        const keyValue = kv as string | number;
        const mapKey = kind === "number" ? `n:${String(keyValue)}` : `s:${String(keyValue)}`;
        const existing = by.get(mapKey);
        if (existing) {
          existing.rows.push(row as T);
          continue;
        }
        const group = { key: keyValue, rows: [row as T] };
        by.set(mapKey, group);
        ordered.push(group);
      }

      return ordered;
    },
    agg<T extends Record<string, unknown>, TOut extends Record<string, unknown>>(
      groups: unknown,
      mapper: (group: { key: string | number; rows: T[] }, index: number) => TOut
    ): TOut[] {
      if (!Array.isArray(groups)) throw new Error("agg: expected groups array");
      if (typeof mapper !== "function") throw new Error("agg: expected mapper function");

      const out: TOut[] = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (!g || typeof g !== "object") throw new Error("agg: expected group objects");
        const obj = g as Record<string, unknown>;
        const key = obj.key;
        const rows = obj.rows;
        if ((typeof key !== "string" && typeof key !== "number") || (typeof key === "number" && !Number.isFinite(key))) {
          throw new Error("agg: group.key must be string or finite number");
        }
        if (!Array.isArray(rows)) throw new Error("agg: group.rows must be an array");

        const mapped = mapper({ key, rows: rows as T[] }, i);
        if (!mapped || typeof mapped !== "object" || Array.isArray(mapped)) throw new Error("agg: mapper must return an object");
        const row: Record<string, unknown> = Object.create(null);
        for (const k of Object.keys(mapped)) {
          assertSafeKey(k, "agg");
          row[k] = (mapped as Record<string, unknown>)[k];
        }
        out.push(row as TOut);
      }
      return out;
    },
    join(
      leftRows: unknown,
      rightRows: unknown,
      opts: {
        leftKey: string;
        rightKey: string;
        how?: "inner" | "left";
        rightPrefix?: string;
      }
    ): Record<string, unknown>[] {
      if (!Array.isArray(leftRows)) throw new Error("join: expected leftRows array");
      if (!Array.isArray(rightRows)) throw new Error("join: expected rightRows array");
      if (!opts || typeof opts !== "object") throw new Error("join: expected opts object");

      const leftKey = (opts as { leftKey?: unknown }).leftKey;
      const rightKey = (opts as { rightKey?: unknown }).rightKey;
      if (typeof leftKey !== "string") throw new Error("join: leftKey must be string");
      if (typeof rightKey !== "string") throw new Error("join: rightKey must be string");
      assertSafeKey(leftKey, "join");
      assertSafeKey(rightKey, "join");

      const how = (opts as { how?: unknown }).how;
      const mode = how === undefined ? "inner" : how;
      if (mode !== "inner" && mode !== "left") throw new Error("join: how must be 'inner' or 'left'");

      const rightPrefixRaw = (opts as { rightPrefix?: unknown }).rightPrefix;
      const rightPrefix = typeof rightPrefixRaw === "string" ? rightPrefixRaw : "right_";

      const index = new Map<string, Record<string, unknown>[]>();
      for (const rr of rightRows) {
        if (!rr || typeof rr !== "object") throw new Error("join: expected right row objects");
        const keyValue = (rr as Record<string, unknown>)[rightKey];
        const mk = mapKeyOf(keyValue);
        if (mk === null) throw new Error("join: right key values must be string or finite number");
        const bucket = index.get(mk) ?? [];
        bucket.push(rr as Record<string, unknown>);
        index.set(mk, bucket);
      }

      const out: Record<string, unknown>[] = [];

      function merge(left: Record<string, unknown>, right: Record<string, unknown> | null): Record<string, unknown> {
        const row: Record<string, unknown> = Object.create(null);

        for (const k of Object.keys(left)) {
          assertSafeKey(k, "join");
          row[k] = left[k];
        }

        if (right) {
          for (const k of Object.keys(right)) {
            assertSafeKey(k, "join");
            const targetKey = Object.prototype.hasOwnProperty.call(row, k) ? `${rightPrefix}${k}` : k;
            assertSafeKey(targetKey, "join");
            if (Object.prototype.hasOwnProperty.call(row, targetKey)) {
              throw new Error(`join: key collision for '${targetKey}'`);
            }
            row[targetKey] = right[k];
          }
        }

        return row;
      }

      for (const lr of leftRows) {
        if (!lr || typeof lr !== "object") throw new Error("join: expected left row objects");
        const leftObj = lr as Record<string, unknown>;
        const keyValue = leftObj[leftKey];
        const mk = mapKeyOf(keyValue);
        if (mk === null) throw new Error("join: left key values must be string or finite number");

        const matches = index.get(mk) ?? [];
        if (matches.length === 0) {
          if (mode === "left") out.push(merge(leftObj, null));
          continue;
        }
        for (const rr of matches) out.push(merge(leftObj, rr));
      }

      return out;
    },
  }),

  lookup: makeModule({
    index(rows: unknown, keyColumn: string): unknown {
      if (!Array.isArray(rows)) throw new Error("lookup.index: expected rows array");
      if (typeof keyColumn !== "string") throw new Error("lookup.index: keyColumn must be string");
      assertSafeKey(keyColumn, "lookup.index");
      const map = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        if (!row || typeof row !== "object") throw new Error("lookup.index: expected row objects");
        const kv = (row as Record<string, unknown>)[keyColumn];
        const mk = mapKeyOf(kv);
        if (mk === null) throw new Error("lookup.index: key values must be string or finite number");
        const bucket = map.get(mk) ?? [];
        bucket.push(row as Record<string, unknown>);
        map.set(mk, bucket);
      }
      return makeLookupIndex(keyColumn, map);
    },
    get(index: unknown, key: string | number): Record<string, unknown> {
      const idx = asLookupIndex(index);
      const mk = mapKeyOf(key);
      if (mk === null) throw new Error("lookup.get: key must be string or finite number");
      const bucket = idx[LOOKUP_INDEX].map.get(mk);
      if (!bucket || bucket.length === 0) throw new Error("lookup.get: key not found");
      return bucket[0]!;
    },
    xlookup(
      key: string | number,
      rows: unknown,
      keyColumn: string,
      valueColumn: string,
      notFound?: unknown
    ): unknown {
      if (!Array.isArray(rows)) throw new Error("lookup.xlookup: expected rows array");
      if (typeof keyColumn !== "string") throw new Error("lookup.xlookup: keyColumn must be string");
      if (typeof valueColumn !== "string") throw new Error("lookup.xlookup: valueColumn must be string");
      assertSafeKey(keyColumn, "lookup.xlookup");
      assertSafeKey(valueColumn, "lookup.xlookup");

      const mkNeedle = mapKeyOf(key);
      if (mkNeedle === null) throw new Error("lookup.xlookup: key must be string or finite number");

      for (const row of rows) {
        if (!row || typeof row !== "object") throw new Error("lookup.xlookup: expected row objects");
        const kv = (row as Record<string, unknown>)[keyColumn];
        const mk = mapKeyOf(kv);
        if (mk === null) throw new Error("lookup.xlookup: key values must be string or finite number");
        if (mk === mkNeedle) return (row as Record<string, unknown>)[valueColumn];
      }

      if (arguments.length >= 5) return notFound;
      throw new Error("lookup.xlookup: key not found");
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
