import { CallExpr, Expr, IdentifierExpr, MemberExpr } from "./ast.js";
import { CalcScriptSyntaxError, Token, Tokenizer } from "./tokenizer.js";

export function parseExpression(src: string): Expr {
  const t = new Tokenizer(src);
  const expr = parseArrow(t);
  const tail = t.peek();
  if (tail.type !== "eof") {
    throw new CalcScriptSyntaxError(`Unexpected trailing token: ${tokenToString(tail)}`, tail.pos);
  }
  return expr;
}

function tokenToString(tok: Token): string {
  switch (tok.type) {
    case "eof":
      return "end of expression";
    case "punct":
      return `'${tok.value}'`;
    case "op":
      return `'${tok.value}'`;
    case "arrow":
      return "'=>'";
    case "identifier":
      return `identifier ${tok.value}`;
    case "number":
      return `number ${tok.value}`;
    case "boolean":
      return `boolean ${tok.value ? "true" : "false"}`;
    case "string":
      return `string ${JSON.stringify(tok.value)}`;
    default: {
      const _exhaustive: never = tok;
      return String(_exhaustive);
    }
  }
}

function expectTokenType<TType extends Token["type"]>(
  token: Token,
  type: TType,
  message: string
): asserts token is Extract<Token, { type: TType }> {
  if (token.type !== type) throw new CalcScriptSyntaxError(message, token.pos);
}

function parseArrow(t: Tokenizer): Expr {
  const mark = t.mark();
  const params = tryParseArrowParams(t);
  if (params) {
    const arrow = t.peek();
    if (arrow.type === "arrow") {
      t.next();
      const body = parseArrow(t);
      return { kind: "arrow", params, body };
    }
  }
  t.reset(mark);
  return parseConditional(t);
}

function parseConditional(t: Tokenizer): Expr {
  const test = parseLogicalOr(t);
  const tok = t.peek();
  if (tok.type === "punct" && tok.value === "?") {
    t.next();
    const consequent = parseArrow(t);
    const colon = t.next();
    if (!(colon.type === "punct" && colon.value === ":")) {
      throw new CalcScriptSyntaxError("Expected ':' in conditional expression", colon.pos);
    }
    const alternate = parseArrow(t);
    return { kind: "conditional", test, consequent, alternate };
  }
  return test;
}

function parseLogicalOr(t: Tokenizer): Expr {
  let left = parseLogicalAnd(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && tok.value === "||") {
      t.next();
      const right = parseLogicalAnd(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function parseLogicalAnd(t: Tokenizer): Expr {
  let left = parseEquality(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && tok.value === "&&") {
      t.next();
      const right = parseEquality(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function parseEquality(t: Tokenizer): Expr {
  let left = parseComparison(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && (tok.value === "==" || tok.value === "!=")) {
      t.next();
      const right = parseComparison(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function parseComparison(t: Tokenizer): Expr {
  let left = parseConcat(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && (tok.value === "<" || tok.value === "<=" || tok.value === ">" || tok.value === ">=")) {
      t.next();
      const right = parseConcat(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function tryParseArrowParams(t: Tokenizer): string[] | null {
  const tok = t.peek();
  if (tok.type === "identifier") {
    t.next();
    return [tok.value];
  }
  if (tok.type === "punct" && tok.value === "(") {
    const mark = t.mark();
    t.next();
    const params: string[] = [];
    const next = t.peek();
    if (next.type === "punct" && next.value === ")") {
      t.next();
      return params;
    }
    while (true) {
      const id = t.next();
      if (id.type !== "identifier") {
        t.reset(mark);
        return null;
      }
      params.push(id.value);
      const sep = t.peek();
      if (sep.type === "punct" && sep.value === ",") {
        t.next();
        continue;
      }
      break;
    }
    const close = t.next();
    if (!(close.type === "punct" && close.value === ")")) {
      t.reset(mark);
      return null;
    }
    return params;
  }
  return null;
}

function parseConcat(t: Tokenizer): Expr {
  let left = parseAddSub(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && tok.value === "&") {
      t.next();
      const right = parseAddSub(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function parseAddSub(t: Tokenizer): Expr {
  let left = parseMulDiv(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
      t.next();
      const right = parseMulDiv(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function parseMulDiv(t: Tokenizer): Expr {
  let left = parsePower(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "op" && (tok.value === "*" || tok.value === "/")) {
      t.next();
      const right = parsePower(t);
      left = { kind: "binary", op: tok.value, left, right };
      continue;
    }
    return left;
  }
}

function parsePower(t: Tokenizer): Expr {
  let left = parseUnary(t);
  const tok = t.peek();
  if (tok.type === "op" && tok.value === "**") {
    t.next();
    const right = parsePower(t);
    left = { kind: "binary", op: "**", left, right };
  }
  return left;
}

function parseUnary(t: Tokenizer): Expr {
  const tok = t.peek();
  if (tok.type === "op" && (tok.value === "-" || tok.value === "!")) {
    t.next();
    const expr = parseUnary(t);
    return { kind: "unary", op: tok.value, expr };
  }
  return parsePostfix(t);
}

function parsePostfix(t: Tokenizer): Expr {
  let expr = parsePrimary(t);
  while (true) {
    const tok = t.peek();
    if (tok.type === "punct" && tok.value === ".") {
      t.next();
      const id = t.next();
      expectTokenType(id, "identifier", "Expected identifier after '.'");
      expr = { kind: "member", object: expr, property: id.value };
      continue;
    }
    if (tok.type === "punct" && tok.value === "(") {
      t.next();
      const args: Expr[] = [];
      const next = t.peek();
      if (!(next.type === "punct" && next.value === ")")) {
        while (true) {
          args.push(parseArrow(t));
          const sep = t.peek();
          if (sep.type === "punct" && sep.value === ",") {
            t.next();
            continue;
          }
          break;
        }
      }
      const close = t.next();
      if (!(close.type === "punct" && close.value === ")")) {
        throw new CalcScriptSyntaxError("Expected ')'", close.pos);
      }
      expr = { kind: "call", callee: expr, args };
      continue;
    }
    return expr;
  }
}

function parsePrimary(t: Tokenizer): Expr {
  const tok = t.next();
  if (tok.type === "number") return { kind: "number", value: tok.value };
  if (tok.type === "string") return { kind: "string", value: tok.value };
  if (tok.type === "boolean") return { kind: "boolean", value: tok.value };
  if (tok.type === "identifier") return { kind: "identifier", name: tok.value };
  if (tok.type === "punct" && tok.value === "{") {
    const properties: { key: string; value: Expr; shorthand: boolean }[] = [];
    const next = t.peek();
    if (next.type === "punct" && next.value === "}") {
      t.next();
      return { kind: "object", properties };
    }
    while (true) {
      const keyTok = t.next();
      let key: string;
      if (keyTok.type === "identifier") key = keyTok.value;
      else if (keyTok.type === "string") key = keyTok.value;
      else throw new CalcScriptSyntaxError("Expected object property key", keyTok.pos);

      const afterKey = t.peek();
      if (afterKey.type === "punct" && afterKey.value === ":") {
        t.next();
        const value = parseArrow(t);
        properties.push({ key, value, shorthand: false });
      } else {
        if (keyTok.type !== "identifier") {
          throw new CalcScriptSyntaxError("String keys require ':' value", keyTok.pos);
        }
        properties.push({ key, value: { kind: "identifier", name: key }, shorthand: true });
      }

      const sep = t.peek();
      if (sep.type === "punct" && sep.value === ",") {
        t.next();
        const maybeClose = t.peek();
        if (maybeClose.type === "punct" && maybeClose.value === "}") {
          t.next();
          break;
        }
        continue;
      }
      if (sep.type === "punct" && sep.value === "}") {
        t.next();
        break;
      }
      throw new CalcScriptSyntaxError("Expected ',' or '}' in object literal", sep.pos);
    }
    return { kind: "object", properties };
  }
  if (tok.type === "punct" && tok.value === "(") {
    const expr = parseArrow(t);
    const close = t.next();
    if (!(close.type === "punct" && close.value === ")")) {
      throw new CalcScriptSyntaxError("Expected ')'", close.pos);
    }
    return expr;
  }
  if (tok.type === "eof") throw new CalcScriptSyntaxError("Unexpected end of expression", tok.pos);
  throw new CalcScriptSyntaxError(`Unexpected token: ${tokenToString(tok)}`, tok.pos);
}

export function isStdMemberPath(expr: Expr): boolean {
  if (expr.kind === "identifier") return expr.name === "std";
  if (expr.kind === "member") return isStdMemberPath(expr.object);
  return false;
}

export function getMemberPath(expr: Expr): string[] | null {
  const parts: string[] = [];
  let cur: Expr = expr;
  while (cur.kind === "member") {
    parts.unshift(cur.property);
    cur = cur.object;
  }
  if (cur.kind === "identifier") {
    parts.unshift(cur.name);
    return parts;
  }
  return null;
}

export function asMemberExpr(expr: Expr): MemberExpr | null {
  return expr.kind === "member" ? expr : null;
}

export function asCallExpr(expr: Expr): CallExpr | null {
  return expr.kind === "call" ? expr : null;
}

export function asIdentifierExpr(expr: Expr): IdentifierExpr | null {
  return expr.kind === "identifier" ? expr : null;
}
