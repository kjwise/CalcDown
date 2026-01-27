import { CalcdownMessage } from "../types.js";
import { Expr } from "./ast.js";
import { isStdMemberPath } from "./parser.js";

export interface EvalResult {
  values: Record<string, unknown>;
  messages: CalcdownMessage[];
}

const bannedProperties = new Set(["__proto__", "prototype", "constructor"]);

const NODE_ERROR = Symbol("calcdown.node.error");

type NodeErrorSentinel = { [NODE_ERROR]: { nodeName: string; message: string } };

function makeNodeError(nodeName: string, message: string): NodeErrorSentinel {
  const sentinel = Object.create(null) as NodeErrorSentinel;
  (sentinel as unknown as Record<symbol, unknown>)[NODE_ERROR] = { nodeName, message };
  return sentinel;
}

function isNodeError(v: unknown): v is NodeErrorSentinel {
  return (typeof v === "object" || typeof v === "function") && v !== null && NODE_ERROR in (v as object);
}

function safeGet(obj: unknown, prop: string): unknown {
  if (bannedProperties.has(prop)) throw new Error(`Disallowed property access: ${prop}`);
  if ((typeof obj !== "object" && typeof obj !== "function") || obj === null) {
    throw new Error(`Cannot access property ${prop} on non-object`);
  }
  if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
    throw new Error(`Unknown property: ${prop}`);
  }
  return (obj as Record<string, unknown>)[prop];
}

interface EvalContext {
  stdFunctions: Set<Function>;
  tablePkByArray: WeakMap<object, { primaryKey: string }>;
}

function assertFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} expects finite number`);
  return v;
}

function assertFiniteResult(v: number): number {
  if (!Number.isFinite(v)) throw new Error("Non-finite numeric result");
  return v;
}

function assertBoolean(v: unknown, label: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${label} expects boolean`);
  return v;
}

function assertValidDate(v: unknown, label: string): Date {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) throw new Error(`${label} expects valid Date`);
  return v;
}

function compareScalars(op: "<" | "<=" | ">" | ">=", a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    const aa = assertFiniteNumber(a, `Binary '${op}'`);
    const bb = assertFiniteNumber(b, `Binary '${op}'`);
    if (op === "<") return aa < bb;
    if (op === "<=") return aa <= bb;
    if (op === ">") return aa > bb;
    return aa >= bb;
  }

  if (a instanceof Date && b instanceof Date) {
    const aa = assertValidDate(a, `Binary '${op}'`).getTime();
    const bb = assertValidDate(b, `Binary '${op}'`).getTime();
    if (op === "<") return aa < bb;
    if (op === "<=") return aa <= bb;
    if (op === ">") return aa > bb;
    return aa >= bb;
  }

  throw new Error(`Binary '${op}' expects numbers or dates`);
}

function strictEquals(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    const aa = assertFiniteNumber(a, "Binary '=='");
    const bb = assertFiniteNumber(b, "Binary '=='");
    return aa === bb;
  }
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  if (a instanceof Date && b instanceof Date) {
    const aa = assertValidDate(a, "Binary '=='").getTime();
    const bb = assertValidDate(b, "Binary '=='").getTime();
    return aa === bb;
  }
  if (a === null && b === null) return true;
  if (a === undefined && b === undefined) return true;

  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "number" || typeof a === "string" || typeof a === "boolean") return false;
  if (typeof b === "number" || typeof b === "string" || typeof b === "boolean") return false;
  if (a instanceof Date || b instanceof Date) return false;

  throw new Error("Binary '==' expects comparable scalars");
}

function concatPartToString(v: unknown, label: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${label} expects finite number`);
    return String(v);
  }
  throw new Error(`${label} expects string or finite number`);
}

function evalUnaryMinus(v: unknown, label: string): unknown {
  if (!Array.isArray(v)) {
    return assertFiniteResult(-assertFiniteNumber(v, label));
  }
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    out[i] = assertFiniteResult(-assertFiniteNumber(v[i], `${label} [index ${i}]`));
  }
  return out;
}

function evalConcat(a: unknown, b: unknown, label: string): unknown {
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (!aIsArray && !bIsArray) {
    return concatPartToString(a, label) + concatPartToString(b, label);
  }

  if (aIsArray && bIsArray) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) {
      throw new Error(`${label} vector length mismatch: ${aa.length} vs ${bb.length}`);
    }
    const out = new Array<string>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = concatPartToString(aa[i], `${label} [index ${i}]`) + concatPartToString(bb[i], `${label} [index ${i}]`);
    }
    return out;
  }

  if (aIsArray) {
    const aa = a as unknown[];
    const sb = concatPartToString(b, `${label} (scalar right)`);
    const out = new Array<string>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = concatPartToString(aa[i], `${label} [index ${i}]`) + sb;
    }
    return out;
  }

  const sa = concatPartToString(a, `${label} (scalar left)`);
  const bb = b as unknown[];
  const out = new Array<string>(bb.length);
  for (let i = 0; i < bb.length; i++) {
    out[i] = sa + concatPartToString(bb[i], `${label} [index ${i}]`);
  }
  return out;
}

function evalNumericBinary(
  op: string,
  a: unknown,
  b: unknown,
  scalarFn: (x: number, y: number) => number
): unknown {
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (!aIsArray && !bIsArray) {
    return assertFiniteResult(scalarFn(assertFiniteNumber(a, `Binary '${op}'`), assertFiniteNumber(b, `Binary '${op}'`)));
  }

  if (aIsArray && bIsArray) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) {
      throw new Error(`Vector length mismatch: ${aa.length} vs ${bb.length}`);
    }
    const out = new Array<number>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = assertFiniteResult(
        scalarFn(assertFiniteNumber(aa[i], `Binary '${op}' [index ${i}]`), assertFiniteNumber(bb[i], `Binary '${op}' [index ${i}]`))
      );
    }
    return out;
  }

  if (aIsArray) {
    const aa = a as unknown[];
    const sb = assertFiniteNumber(b, `Binary '${op}' (scalar right)`);
    const out = new Array<number>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = assertFiniteResult(scalarFn(assertFiniteNumber(aa[i], `Binary '${op}' [index ${i}]`), sb));
    }
    return out;
  }

  const sa = assertFiniteNumber(a, `Binary '${op}' (scalar left)`);
  const bb = b as unknown[];
  const out = new Array<number>(bb.length);
  for (let i = 0; i < bb.length; i++) {
    out[i] = assertFiniteResult(scalarFn(sa, assertFiniteNumber(bb[i], `Binary '${op}' [index ${i}]`)));
  }
  return out;
}

function collectStdFunctions(std: unknown): Set<Function> {
  const out = new Set<Function>();
  const seen = new WeakSet<object>();

  function visit(v: unknown): void {
    if ((typeof v !== "object" && typeof v !== "function") || v === null) return;
    const obj = v as object;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (typeof v === "function") {
      out.add(v);
      return;
    }

    for (const key of Object.keys(v as Record<string, unknown>)) {
      visit((v as Record<string, unknown>)[key]);
    }
  }

  visit(std);
  return out;
}

function evalExpr(expr: Expr, env: Record<string, unknown>, ctx: EvalContext): unknown {
  switch (expr.kind) {
    case "number":
    case "string":
    case "boolean":
      return expr.value;
    case "identifier": {
      if (expr.name in env) {
        const v = env[expr.name];
        if (isNodeError(v)) {
          const info = v[NODE_ERROR];
          throw new Error(`Upstream error in '${info.nodeName}': ${info.message}`);
        }
        return v;
      }
      throw new Error(`Unknown identifier: ${expr.name}`);
    }
    case "unary": {
      const v = evalExpr(expr.expr, env, ctx);
      if (expr.op === "-") return evalUnaryMinus(v, "Unary '-'");
      if (expr.op === "!") return !assertBoolean(v, "Unary '!'");
      throw new Error("Unsupported unary op");
    }
    case "binary": {
      if (expr.op === "&&") {
        const a = assertBoolean(evalExpr(expr.left, env, ctx), "Binary '&&'");
        if (!a) return false;
        return assertBoolean(evalExpr(expr.right, env, ctx), "Binary '&&'");
      }
      if (expr.op === "||") {
        const a = assertBoolean(evalExpr(expr.left, env, ctx), "Binary '||'");
        if (a) return true;
        return assertBoolean(evalExpr(expr.right, env, ctx), "Binary '||'");
      }

      const a = evalExpr(expr.left, env, ctx);
      const b = evalExpr(expr.right, env, ctx);
      switch (expr.op) {
        case "&":
          return evalConcat(a, b, "Binary '&'");
        case "+":
          return evalNumericBinary("+", a, b, (x, y) => x + y);
        case "-":
          return evalNumericBinary("-", a, b, (x, y) => x - y);
        case "*":
          return evalNumericBinary("*", a, b, (x, y) => x * y);
        case "/":
          return evalNumericBinary("/", a, b, (x, y) => {
            if (y === 0) throw new Error("Division by zero");
            return x / y;
          });
        case "**":
          return evalNumericBinary("**", a, b, (x, y) => x ** y);
        case "<":
        case "<=":
        case ">":
        case ">=":
          return compareScalars(expr.op, a, b);
        case "==":
          return strictEquals(a, b);
        case "!=":
          return !strictEquals(a, b);
        default:
          throw new Error("Unsupported binary op");
      }
    }
    case "conditional": {
      const test = assertBoolean(evalExpr(expr.test, env, ctx), "Conditional test");
      return test ? evalExpr(expr.consequent, env, ctx) : evalExpr(expr.alternate, env, ctx);
    }
    case "member": {
      const obj = evalExpr(expr.object, env, ctx);
      const prop = expr.property;
      if (Array.isArray(obj)) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) return safeGet(obj, prop);
        if (prop in Array.prototype) {
          // Preserve "own properties only" semantics for arrays to avoid leaking mutators like `.push`.
          throw new Error(`Unknown property: ${prop}`);
        }
        const pkKey = ctx.tablePkByArray.get(obj)?.primaryKey ?? null;
        const out = new Array<unknown>(obj.length);
        for (let i = 0; i < obj.length; i++) {
          try {
            out[i] = safeGet(obj[i], prop);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const row = obj[i];
            let rowLabel = `Row ${i}`;
            if (pkKey && row && typeof row === "object" && !Array.isArray(row) && Object.prototype.hasOwnProperty.call(row, pkKey)) {
              const pkRaw = (row as Record<string, unknown>)[pkKey];
              const pk = typeof pkRaw === "string" ? pkRaw : typeof pkRaw === "number" && Number.isFinite(pkRaw) ? String(pkRaw) : null;
              if (pk) rowLabel = `Row (${pkKey} = ${JSON.stringify(pk)})`;
            }
            throw new Error(`${rowLabel}: ${msg}`);
          }
        }
        return out;
      }
      return safeGet(obj, prop);
    }
    case "call": {
      if (!isStdMemberPath(expr.callee)) {
        throw new Error("Only std.* function calls are supported in this evaluator");
      }
      const fn = evalExpr(expr.callee, env, ctx);
      if (typeof fn !== "function") throw new Error("Callee is not a function");
      if (!ctx.stdFunctions.has(fn)) throw new Error("Only std library functions may be called");
      const args = expr.args.map((a) => evalExpr(a, env, ctx));
      return fn(...args);
    }
    case "object": {
      const out: Record<string, unknown> = Object.create(null);
      for (const p of expr.properties) {
        if (bannedProperties.has(p.key)) throw new Error(`Disallowed object key: ${p.key}`);
        out[p.key] = evalExpr(p.value, env, ctx);
      }
      return out;
    }
    case "arrow": {
      const captured = env;
      const params = expr.params.slice();
      const body = expr.body;
      return (...args: unknown[]) => {
        const child: Record<string, unknown> = Object.create(captured);
        for (let i = 0; i < params.length; i++) {
          const param = params[i];
          if (param === undefined) throw new Error("Invalid arrow function parameter");
          if (param === "std") throw new Error("The identifier 'std' is reserved and cannot be used as an arrow parameter");
          child[param] = args[i];
        }
        return evalExpr(body, child, ctx);
      };
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function codeForEvalError(message: string): string {
  if (message === "Division by zero" || message.startsWith("Division by zero")) return "CD_CALC_DIV_ZERO";
  if (message === "Non-finite numeric result" || message.startsWith("Non-finite numeric result")) return "CD_CALC_NONFINITE";
  if (message.startsWith("Unknown identifier:")) return "CD_CALC_UNKNOWN_IDENTIFIER";
  if (message.startsWith("Unknown property:") || message.includes("Unknown property:")) return "CD_CALC_UNKNOWN_PROPERTY";
  if (message.startsWith("Upstream error in")) return "CD_CALC_UPSTREAM_ERROR";
  if (message.includes("Only std.* function calls are supported")) return "CD_CALC_UNSAFE_CALL";
  return "CD_CALC_EVAL";
}

export function evaluateNodes(
  nodes: { name: string; expr?: Expr; dependencies: string[]; line: number }[],
  inputs: Record<string, unknown>,
  std: unknown,
  tablePkByArray: WeakMap<object, { primaryKey: string }>
): EvalResult {
  const messages: CalcdownMessage[] = [];
  const values: Record<string, unknown> = Object.create(null);
  const env: Record<string, unknown> = Object.assign(Object.create(null), inputs, { std });
  const ctx: EvalContext = { stdFunctions: collectStdFunctions(std), tablePkByArray };

  const nodeByName = new Map(nodes.map((n) => [n.name, n]));
  const nodeNames = new Set(nodes.map((n) => n.name));

  for (const n of nodes) {
    if (!n.expr) {
      env[n.name] = makeNodeError(n.name, "Invalid or missing expression");
    }
  }

  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const n of nodes) {
    const deps = n.dependencies.filter((d) => nodeNames.has(d));
    indegree.set(n.name, deps.length);
    for (const d of deps) {
      const arr = outgoing.get(d) ?? [];
      arr.push(n.name);
      outgoing.set(d, arr);
    }
  }

  const order: string[] = [];
  const queue: string[] = [];
  for (const n of nodes) {
    if ((indegree.get(n.name) ?? 0) === 0) queue.push(n.name);
  }

  while (queue.length > 0) {
    const name = queue.shift()!;
    order.push(name);
    for (const dep of outgoing.get(name) ?? []) {
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  if (order.length !== nodes.length) {
    messages.push({
      severity: "error",
      code: "CD_CALC_CYCLE",
      message: "Cycle detected in calc nodes (or unresolved dependencies)",
    });
  }

  for (const name of order) {
    const node = nodeByName.get(name);
    if (!node) continue;
    if (!node.expr) continue;
    try {
      const v = evalExpr(node.expr, env, ctx);
      values[name] = v;
      env[name] = v;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      messages.push({
        severity: "error",
        code: codeForEvalError(msg),
        message: msg,
        line: node.line,
        nodeName: node.name,
      });
      env[node.name] = makeNodeError(node.name, msg);
    }
  }

  return { values, messages };
}
