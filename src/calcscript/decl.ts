import { CalcdownMessage } from "../types.js";

export interface ConstDeclaration {
  name: string;
  exprText: string;
  exprTextRaw: string;
  exprTrimStartOffset: number;
  exprStartLine: number;
  exprStartColumn: number;
  line: number;
}

function isIdentChar(ch: string | undefined): boolean {
  return ch ? /[A-Za-z0-9_]/.test(ch) : false;
}

function isIdentStart(ch: string | undefined): boolean {
  return ch ? /[A-Za-z_]/.test(ch) : false;
}

export function extractTopLevelConstDeclarations(source: string, baseLine: number): {
  decls: ConstDeclaration[];
  messages: CalcdownMessage[];
} {
  const decls: ConstDeclaration[] = [];
  const messages: CalcdownMessage[] = [];

  let i = 0;
  let line = baseLine;
  let col = 1;

  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let inString: "'" | '"' | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  const advance = (): string | undefined => {
    const ch = source[i];
    i++;
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  };

  const peek = (offset = 0): string | undefined => source[i + offset];

  const skipWhitespace = (): void => {
    while (true) {
      const ch = peek();
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        advance();
        continue;
      }
      break;
    }
  };

  const skipWhitespaceAndComments = (): void => {
    while (true) {
      skipWhitespace();
      const ch = peek();
      const next = peek(1);
      if (ch === "/" && next === "/") {
        advance();
        advance();
        while (peek() !== undefined && peek() !== "\n") advance();
        continue;
      }
      if (ch === "/" && next === "*") {
        advance();
        advance();
        while (peek() !== undefined) {
          const c = advance();
          if (c === "*" && peek() === "/") {
            advance();
            break;
          }
        }
        continue;
      }
      break;
    }
  };

  const readIdentifier = (): string | null => {
    const ch = peek();
    if (!isIdentStart(ch)) return null;
    let out = "";
    out += advance() ?? "";
    while (isIdentChar(peek())) out += advance();
    return out;
  };

  const atTopLevel = (): boolean => paren === 0 && brace === 0 && bracket === 0 && !inString;

  const matchKeywordAt = (kw: string): boolean => {
    if (source.slice(i, i + kw.length) !== kw) return false;
    const before = source[i - 1];
    const after = source[i + kw.length];
    if (isIdentChar(before)) return false;
    if (isIdentChar(after)) return false;
    return true;
  };

  const scanToTopLevelSemicolon = (): number | null => {
    while (i < source.length) {
      const ch = peek();
      const next = peek(1);

      if (inLineComment) {
        const c = advance();
        if (c === "\n") inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        const c = advance();
        if (c === "*" && peek() === "/") {
          advance();
          inBlockComment = false;
        }
        continue;
      }
      if (inString) {
        const c = advance();
        if (c === "\\") {
          if (peek() !== undefined) advance();
          continue;
        }
        if (c === inString) inString = null;
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        advance();
        advance();
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        advance();
        advance();
        continue;
      }
      if (ch === "'" || ch === '"') {
        inString = ch;
        advance();
        continue;
      }

      if (ch === "(") {
        paren++;
        advance();
        continue;
      }
      if (ch === ")") {
        paren = Math.max(0, paren - 1);
        advance();
        continue;
      }
      if (ch === "{") {
        brace++;
        advance();
        continue;
      }
      if (ch === "}") {
        brace = Math.max(0, brace - 1);
        advance();
        continue;
      }
      if (ch === "[") {
        bracket++;
        advance();
        continue;
      }
      if (ch === "]") {
        bracket = Math.max(0, bracket - 1);
        advance();
        continue;
      }

      if (ch === ";" && paren === 0 && brace === 0 && bracket === 0) {
        return i;
      }
      advance();
    }
    return null;
  };

  while (i < source.length) {
    const ch = peek();
    const next = peek(1);

    if (inLineComment) {
      const c = advance();
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      const c = advance();
      if (c === "*" && peek() === "/") {
        advance();
        inBlockComment = false;
      }
      continue;
    }
    if (inString) {
      const c = advance();
      if (c === "\\") {
        if (peek() !== undefined) advance();
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      advance();
      advance();
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      advance();
      advance();
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      advance();
      continue;
    }

    if (ch === "(") {
      paren++;
      advance();
      continue;
    }
    if (ch === ")") {
      paren = Math.max(0, paren - 1);
      advance();
      continue;
    }
    if (ch === "{") {
      brace++;
      advance();
      continue;
    }
    if (ch === "}") {
      brace = Math.max(0, brace - 1);
      advance();
      continue;
    }
    if (ch === "[") {
      bracket++;
      advance();
      continue;
    }
    if (ch === "]") {
      bracket = Math.max(0, bracket - 1);
      advance();
      continue;
    }

    if (!atTopLevel()) {
      advance();
      continue;
    }

    if (matchKeywordAt("const")) {
      const declLine = line;
      i += "const".length;
      col += "const".length;

      skipWhitespaceAndComments();
      const name = readIdentifier();
      if (!name) {
        messages.push({
          severity: "error",
          code: "CD_CALC_DECL_EXPECT_IDENTIFIER",
          message: "Expected identifier after const",
          line: declLine,
        });
        continue;
      }

      skipWhitespaceAndComments();
      if (peek() !== "=") {
        messages.push({
          severity: "error",
          code: "CD_CALC_DECL_EXPECT_EQUALS",
          message: `Expected '=' after const ${name}`,
          line: declLine,
        });
        continue;
      }
      advance();

      const exprStart = i;
      const exprStartLine = line;
      const exprStartColumn = col;
      const semicolonPos = scanToTopLevelSemicolon();
      if (semicolonPos === null) {
        messages.push({
          severity: "error",
          code: "CD_CALC_DECL_MISSING_SEMICOLON",
          message: `Missing ';' after const ${name}`,
          line: declLine,
        });
        break;
      }

      const exprTextRaw = source.slice(exprStart, semicolonPos);
      const exprText = exprTextRaw.trim();
      const exprTrimStartOffset = (exprTextRaw.match(/^\s*/) ?? [""])[0].length;
      decls.push({ name, exprText, exprTextRaw, exprTrimStartOffset, exprStartLine, exprStartColumn, line: declLine });
      i = semicolonPos + 1;
      col++;
      continue;
    }

    advance();
  }

  return { decls, messages };
}
