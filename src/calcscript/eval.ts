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
}

function assertFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} expects finite number`);
  return v;
}

function assertFiniteResult(v: number): number {
  if (!Number.isFinite(v)) throw new Error("Non-finite numeric result");
  return v;
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
      const n = assertFiniteNumber(v, "Unary '-'");
      return assertFiniteResult(-n);
    }
    case "binary": {
      const a = evalExpr(expr.left, env, ctx);
      const b = evalExpr(expr.right, env, ctx);
      const na = assertFiniteNumber(a, `Binary '${expr.op}'`);
      const nb = assertFiniteNumber(b, `Binary '${expr.op}'`);
      switch (expr.op) {
        case "+":
          return assertFiniteResult(na + nb);
        case "-":
          return assertFiniteResult(na - nb);
        case "*":
          return assertFiniteResult(na * nb);
        case "/":
          if (nb === 0) throw new Error("Division by zero");
          return assertFiniteResult(na / nb);
        case "**":
          return assertFiniteResult(na ** nb);
        default:
          throw new Error("Unsupported binary op");
      }
    }
    case "member": {
      const obj = evalExpr(expr.object, env, ctx);
      return safeGet(obj, expr.property);
    }
    case "call": {
      if (!isStdMemberPath(expr.callee)) {
        throw new Error("Only std.* function calls are supported in the 0.5 evaluator");
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
  if (message === "Division by zero") return "CD_CALC_DIV_ZERO";
  if (message === "Non-finite numeric result") return "CD_CALC_NONFINITE";
  if (message.startsWith("Unknown identifier:")) return "CD_CALC_UNKNOWN_IDENTIFIER";
  if (message.startsWith("Unknown property:")) return "CD_CALC_UNKNOWN_PROPERTY";
  if (message.startsWith("Upstream error in")) return "CD_CALC_UPSTREAM_ERROR";
  if (message.includes("Only std.* function calls are supported")) return "CD_CALC_UNSAFE_CALL";
  return "CD_CALC_EVAL";
}

export function evaluateNodes(
  nodes: { name: string; expr?: Expr; dependencies: string[]; line: number }[],
  inputs: Record<string, unknown>,
  std: unknown
): EvalResult {
  const messages: CalcdownMessage[] = [];
  const values: Record<string, unknown> = Object.create(null);
  const env: Record<string, unknown> = Object.assign(Object.create(null), inputs, { std });
  const ctx: EvalContext = { stdFunctions: collectStdFunctions(std) };

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
