#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CURRENT_CALCDOWN_VERSION } from "./version.js";

function asString(v) {
  return typeof v === "string" ? v : null;
}

function isDirentDirectory(entry) {
  return entry && typeof entry === "object" && typeof entry.isDirectory === "function" && entry.isDirectory();
}

function isDirentFile(entry) {
  return entry && typeof entry === "object" && typeof entry.isFile === "function" && entry.isFile();
}

function findFrontMatterCalcdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return { ok: false, reason: "missing front matter" };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { ok: false, reason: "unterminated front matter" };

  const fm = lines.slice(1, end);
  for (const raw of fm) {
    const m = raw.match(/^\s*calcdown\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const v = (m[1] ?? "").trim();
    const unquoted = v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").trim();
    return { ok: true, value: unquoted };
  }
  return { ok: false, reason: "missing calcdown in front matter" };
}

async function fileExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(root, opts) {
  const excludeDirs = new Set(opts.excludeDirs ?? []);
  const match = opts.match ?? (() => true);
  const out = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      const abs = path.join(dir, name);
      if (isDirentDirectory(entry)) {
        if (excludeDirs.has(name)) continue;
        await walk(abs);
      } else if (isDirentFile(entry)) {
        if (match(abs)) out.push(abs);
      }
    }
  }

  await walk(root);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function normalizeRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

async function checkSchemas(root, errors) {
  const version = CURRENT_CALCDOWN_VERSION;
  const schemasDir = path.join(root, "schemas");

  const required = [
    `calcdown-manifest-${version}.schema.json`,
    `calcdown-lock-${version}.schema.json`,
    `calcdown-export-${version}.schema.json`,
    `calcdown-view-${version}.schema.json`,
    `calcdown-view-cards-${version}.schema.json`,
    `calcdown-view-table-${version}.schema.json`,
    `calcdown-view-chart-${version}.schema.json`,
    `calcdown-view-layout-${version}.schema.json`,
  ];

  for (const name of required) {
    const p = path.join(schemasDir, name);
    if (!(await fileExists(p))) errors.push(`Missing schema: schemas/${name}`);
  }

  const exportSchemaPath = path.join(schemasDir, `calcdown-export-${version}.schema.json`);
  if (await fileExists(exportSchemaPath)) {
    const raw = JSON.parse(await fs.readFile(exportSchemaPath, "utf8"));
    if (asString(raw?.$id) !== `calcdown-export-${version}.schema.json`) {
      errors.push(`schemas/calcdown-export-${version}.schema.json: $id must match filename`);
    }
    if (raw?.properties?.calcdown?.const !== version) {
      errors.push(`schemas/calcdown-export-${version}.schema.json: properties.calcdown.const must be "${version}"`);
    }
    const viewRef = raw?.properties?.views?.items?.$ref;
    if (asString(viewRef) !== `calcdown-view-${version}.schema.json`) {
      errors.push(`schemas/calcdown-export-${version}.schema.json: views.items.$ref must be calcdown-view-${version}.schema.json`);
    }
  }

  const lockSchemaPath = path.join(schemasDir, `calcdown-lock-${version}.schema.json`);
  if (await fileExists(lockSchemaPath)) {
    const raw = JSON.parse(await fs.readFile(lockSchemaPath, "utf8"));
    if (asString(raw?.$id) !== `calcdown-lock-${version}.schema.json`) {
      errors.push(`schemas/calcdown-lock-${version}.schema.json: $id must match filename`);
    }
    if (raw?.properties?.calcdown?.const !== version) {
      errors.push(`schemas/calcdown-lock-${version}.schema.json: properties.calcdown.const must be "${version}"`);
    }
  }

  const manifestSchemaPath = path.join(schemasDir, `calcdown-manifest-${version}.schema.json`);
  if (await fileExists(manifestSchemaPath)) {
    const raw = JSON.parse(await fs.readFile(manifestSchemaPath, "utf8"));
    if (asString(raw?.$id) !== `calcdown-manifest-${version}.schema.json`) {
      errors.push(`schemas/calcdown-manifest-${version}.schema.json: $id must match filename`);
    }
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const version = CURRENT_CALCDOWN_VERSION;
  const errors = [];

  const specPath = path.join(root, "docs", `calcdown-${version}.md`);
  const stdlibPath = path.join(root, "docs", `stdlib-${version}.md`);
  if (!(await fileExists(specPath))) errors.push(`Missing current spec: docs/calcdown-${version}.md`);
  if (!(await fileExists(stdlibPath))) errors.push(`Missing current stdlib: docs/stdlib-${version}.md`);

  const readme = await fs.readFile(path.join(root, "README.md"), "utf8");
  if (!readme.includes(`docs/calcdown-${version}.md`)) errors.push(`README.md must reference docs/calcdown-${version}.md`);
  if (!readme.includes(`docs/stdlib-${version}.md`)) errors.push(`README.md must reference docs/stdlib-${version}.md`);

  const checklist = await fs.readFile(path.join(root, "docs", "examples", "compatibility-checklist.md"), "utf8");
  if (!checklist.includes(`CalcDown ${version}`)) {
    errors.push(`docs/examples/compatibility-checklist.md must reference CalcDown ${version} (run node tools/check_examples.js)`);
  }

  // All .calc.md documents in the repo MUST declare the current calcdown version.
  const calcDocs = await listFilesRecursive(root, {
    excludeDirs: [".git", "node_modules", "dist", "build"],
    match: (p) => p.endsWith(".calc.md"),
  });

  for (const abs of calcDocs) {
    const text = await fs.readFile(abs, "utf8");
    const fm = findFrontMatterCalcdown(text);
    const rel = normalizeRel(root, abs);
    if (!fm.ok) {
      errors.push(`${rel}: ${fm.reason}`);
      continue;
    }
    if (fm.value !== version) {
      errors.push(`${rel}: front matter calcdown must be ${version} (got ${fm.value})`);
    }
  }

  await checkSchemas(root, errors);

  if (errors.length) {
    process.stdout.write(`Current version check failed (expected ${version}):\n`);
    for (const e of errors) process.stdout.write(`- ${e}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Current version OK (${version}).\n`);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

