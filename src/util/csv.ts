export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

export function parseCsv(text: string): ParsedCsv {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.filter((l) => l.trim() !== "");
  if (lines.length === 0) return { header: [], rows: [] };

  const header = parseCsvLine(lines[0] ?? "").map((h) => h.trim());
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i] ?? "");
    rows.push(row);
  }

  return { header, rows };
}

