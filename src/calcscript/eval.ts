import { CalcdownMessage } from "../types.js";
import { Expr } from "./ast.js";
import { isStdMemberPath } from "./parser.js";

export interface EvalResult {
  values: Record<string, unknown>;
  messages: CalcdownMessage[];
}

const bannedProperties = new Set(["__proto__", "prototype", "constructor"]);

function safeGet(obj: unknown, prop: string): unknown {
  if (bannedProperties.has(prop)) throw new Error(`Disallowed property access: ${prop}`);
  if ((typeof obj !== "object" && typeof obj !== "function") || obj === null) {
    throw new Error(`Cannot access property ${prop} on non-object`);
  }
  return (obj as Record<string, unknown>)[prop];
}

function evalExpr(expr: Expr, env: Record<string, unknown>): unknown {
  switch (expr.kind) {
    case "number":
    case "string":
    case "boolean":
      return expr.value;
    case "identifier": {
      if (expr.name in env) return env[expr.name];
      throw new Error(`Unknown identifier: ${expr.name}`);
    }
    case "unary": {
      const v = evalExpr(expr.expr, env);
      if (typeof v !== "number") throw new Error("Unary '-' expects number");
      return -v;
    }
    case "binary": {
      const a = evalExpr(expr.left, env);
      const b = evalExpr(expr.right, env);
      if (typeof a !== "number" || typeof b !== "number") {
        throw new Error(`Binary '${expr.op}' expects numbers`);
      }
      switch (expr.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "**":
          return a ** b;
        default:
          throw new Error("Unsupported binary op");
      }
    }
    case "member": {
      const obj = evalExpr(expr.object, env);
      return safeGet(obj, expr.property);
    }
    case "call": {
      if (!isStdMemberPath(expr.callee)) {
        throw new Error("Only std.* function calls are supported in the 0.2 evaluator");
      }
      const fn = evalExpr(expr.callee, env);
      if (typeof fn !== "function") throw new Error("Callee is not a function");
      const args = expr.args.map((a) => evalExpr(a, env));
      return fn(...args);
    }
    case "object": {
      const out: Record<string, unknown> = Object.create(null);
      for (const p of expr.properties) {
        if (bannedProperties.has(p.key)) throw new Error(`Disallowed object key: ${p.key}`);
        out[p.key] = evalExpr(p.value, env);
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
          child[param] = args[i];
        }
        return evalExpr(body, child);
      };
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

export function evaluateNodes(
  nodes: { name: string; expr?: Expr; dependencies: string[]; line: number }[],
  inputs: Record<string, unknown>,
  std: unknown
): EvalResult {
  const messages: CalcdownMessage[] = [];
  const values: Record<string, unknown> = Object.create(null);
  const env: Record<string, unknown> = Object.assign(Object.create(null), inputs, { std });

  const nodeByName = new Map(nodes.map((n) => [n.name, n]));
  const nodeNames = new Set(nodes.map((n) => n.name));

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
      message: "Cycle detected in calc nodes (or unresolved dependencies)",
    });
  }

  for (const name of order) {
    const node = nodeByName.get(name);
    if (!node) continue;
    if (!node.expr) continue;
    try {
      const v = evalExpr(node.expr, env);
      values[name] = v;
      env[name] = v;
    } catch (err) {
      messages.push({
        severity: "error",
        message: err instanceof Error ? err.message : String(err),
        line: node.line,
        nodeName: node.name,
      });
    }
  }

  return { values, messages };
}
