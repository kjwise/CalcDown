export type Token =
  | { type: "number"; value: number; pos: number }
  | { type: "string"; value: string; pos: number }
  | { type: "boolean"; value: boolean; pos: number }
  | { type: "identifier"; value: string; pos: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "**" | "&"; pos: number }
  | { type: "punct"; value: "(" | ")" | "." | "," | "{" | "}" | ":"; pos: number }
  | { type: "arrow"; pos: number }
  | { type: "eof"; pos: number };

export class CalcScriptSyntaxError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = "CalcScriptSyntaxError";
    this.pos = pos;
  }
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

export class Tokenizer {
  private readonly src: string;
  private i = 0;
  private lookahead: Token | null = null;

  constructor(src: string) {
    this.src = src;
  }

  peek(): Token {
    if (!this.lookahead) this.lookahead = this.nextToken();
    return this.lookahead;
  }

  next(): Token {
    const t = this.peek();
    this.lookahead = null;
    return t;
  }

  mark(): { i: number; lookahead: Token | null } {
    return { i: this.i, lookahead: this.lookahead };
  }

  reset(mark: { i: number; lookahead: Token | null }): void {
    this.i = mark.i;
    this.lookahead = mark.lookahead;
  }

  private nextToken(): Token {
    this.skipWhitespaceAndComments();
    const pos = this.i;
    if (this.i >= this.src.length) return { type: "eof", pos };

    const ch = this.src[this.i];
    if (ch === undefined) return { type: "eof", pos };

    if (ch === "(" || ch === ")" || ch === "." || ch === "," || ch === "{" || ch === "}" || ch === ":") {
      this.i++;
      return { type: "punct", value: ch, pos };
    }

    if (ch === "=" && this.src[this.i + 1] === ">") {
      this.i += 2;
      return { type: "arrow", pos };
    }

    if (ch === "+" || ch === "-" || ch === "/" || ch === "*" || ch === "&") {
      if (ch === "*" && this.src[this.i + 1] === "*") {
        this.i += 2;
        return { type: "op", value: "**", pos };
      }
      this.i++;
      if (ch === "*") return { type: "op", value: "*", pos };
      if (ch === "/") return { type: "op", value: "/", pos };
      if (ch === "+") return { type: "op", value: "+", pos };
      if (ch === "&") return { type: "op", value: "&", pos };
      return { type: "op", value: "-", pos };
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      this.i++;
      let out = "";
      for (; this.i < this.src.length; this.i++) {
        const c = this.src[this.i]!;
        if (c === quote) {
          this.i++;
          return { type: "string", value: out, pos };
        }
        if (c === "\\") {
          const next = this.src[this.i + 1];
          if (next === undefined) throw new CalcScriptSyntaxError("Unterminated string escape", pos);
          const mapped =
            next === "n"
              ? "\n"
              : next === "r"
                ? "\r"
                : next === "t"
                  ? "\t"
                  : next;
          out += mapped;
          this.i++;
          continue;
        }
        out += c;
      }
      throw new CalcScriptSyntaxError("Unterminated string", pos);
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(this.src[this.i + 1] ?? ""))) {
      const start = this.i;
      this.i++;
      while (/[0-9_]/.test(this.src[this.i] ?? "")) this.i++;
      if (this.src[this.i] === ".") {
        this.i++;
        while (/[0-9_]/.test(this.src[this.i] ?? "")) this.i++;
      }
      if (/[eE]/.test(this.src[this.i] ?? "")) {
        this.i++;
        if (this.src[this.i] === "+" || this.src[this.i] === "-") this.i++;
        while (/[0-9_]/.test(this.src[this.i] ?? "")) this.i++;
      }
      const raw = this.src.slice(start, this.i).replaceAll("_", "");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new CalcScriptSyntaxError(`Invalid number: ${raw}`, start);
      return { type: "number", value, pos: start };
    }

    if (isIdentStart(ch)) {
      const start = this.i;
      this.i++;
      while (isIdentPart(this.src[this.i] ?? "")) this.i++;
      const value = this.src.slice(start, this.i);
      if (value === "true") return { type: "boolean", value: true, pos: start };
      if (value === "false") return { type: "boolean", value: false, pos: start };
      return { type: "identifier", value, pos: start };
    }

    throw new CalcScriptSyntaxError(`Unsupported token: ${ch}`, pos);
  }

  private skipWhitespaceAndComments(): void {
    while (this.i < this.src.length) {
      const ch = this.src[this.i];
      if (ch === undefined) break;
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.i++;
        continue;
      }
      if (ch === "/" && this.src[this.i + 1] === "/") {
        this.i += 2;
        while (this.i < this.src.length && this.src[this.i] !== "\n") this.i++;
        continue;
      }
      if (ch === "/" && this.src[this.i + 1] === "*") {
        this.i += 2;
        while (this.i < this.src.length) {
          if (this.src[this.i] === "*" && this.src[this.i + 1] === "/") {
            this.i += 2;
            break;
          }
          this.i++;
        }
        continue;
      }
      break;
    }
  }
}
