export type CalcdownBlockKind = "inputs" | "data" | "calc" | "view" | "unknown";

export type CalcdownSeverity = "error" | "warning";

export interface CalcdownMessage {
  severity: CalcdownSeverity;
  code?: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  blockLang?: string;
  nodeName?: string;
}

export interface FrontMatter {
  raw: string;
  data: Record<string, string>;
}

export interface FencedCodeBlock {
  lang: string;
  info: string;
  content: string;
  fenceLine: number;
  closeFenceLine?: number;
}

export interface ParsedCalcdownMarkdown {
  frontMatter: FrontMatter | null;
  body: string;
  codeBlocks: FencedCodeBlock[];
}

export type InputValue = string | number | boolean | Date;

export interface InputType {
  name: string;
  args: string[];
  raw: string;
}

export interface InputDefinition {
  name: string;
  type: InputType;
  defaultText: string;
  defaultValue: InputValue;
  line: number;
}

export interface InputsBlock {
  kind: "inputs";
  block: FencedCodeBlock;
  inputs: InputDefinition[];
}

export interface DataTableSource {
  uri: string;
  format: "csv" | "json";
  hash: string; // sha256:<hex>
}

export interface DataTable {
  name: string;
  primaryKey: string;
  columns: Record<string, InputType>;
  rows: Record<string, unknown>[];
  source?: DataTableSource;
  line: number;
}

export interface DataBlock {
  kind: "data";
  block: FencedCodeBlock;
}

export interface CalcBlock {
  kind: "calc";
  block: FencedCodeBlock;
}

export interface ViewBlock {
  kind: "view";
  block: FencedCodeBlock;
}

export type CalcdownBlock = InputsBlock | DataBlock | CalcBlock | ViewBlock;
