export type Expr =
  | NumberLiteralExpr
  | StringLiteralExpr
  | BooleanLiteralExpr
  | IdentifierExpr
  | UnaryExpr
  | BinaryExpr
  | ConditionalExpr
  | MemberExpr
  | CallExpr
  | ArrowFunctionExpr
  | ObjectLiteralExpr;

export interface NumberLiteralExpr {
  kind: "number";
  value: number;
}

export interface StringLiteralExpr {
  kind: "string";
  value: string;
}

export interface BooleanLiteralExpr {
  kind: "boolean";
  value: boolean;
}

export interface IdentifierExpr {
  kind: "identifier";
  name: string;
}

export interface UnaryExpr {
  kind: "unary";
  op: "-" | "!";
  expr: Expr;
}

export interface BinaryExpr {
  kind: "binary";
  op: "+" | "-" | "*" | "/" | "**" | "&" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";
  left: Expr;
  right: Expr;
}

export interface ConditionalExpr {
  kind: "conditional";
  test: Expr;
  consequent: Expr;
  alternate: Expr;
}

export interface MemberExpr {
  kind: "member";
  object: Expr;
  property: string;
}

export interface CallExpr {
  kind: "call";
  callee: Expr;
  args: Expr[];
}

export interface ArrowFunctionExpr {
  kind: "arrow";
  params: string[];
  body: Expr;
}

export interface ObjectLiteralExpr {
  kind: "object";
  properties: ObjectProperty[];
}

export interface ObjectProperty {
  key: string;
  value: Expr;
  shorthand: boolean;
}
