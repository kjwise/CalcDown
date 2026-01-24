#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stableSortKeys(value) {
  if (Array.isArray(value)) return value.map(stableSortKeys);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  const out = Object.create(null);
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const k of keys) out[k] = stableSortKeys(value[k]);
  return out;
}

function stableJsonPretty(value) {
  return JSON.stringify(stableSortKeys(value), null, 2);
}

function parseArgs(argv) {
  const out = { update: false, filter: null, datetime: "2026-01-24T00:00:00Z" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--update") {
      out.update = true;
      continue;
    }
    if (a === "--filter") {
      const v = argv[i + 1];
      if (!v) throw new Error("--filter expects a substring");
      out.filter = v;
      i++;
      continue;
    }
    if (a === "--datetime") {
      const v = argv[i + 1];
      if (!v) throw new Error("--datetime expects an ISO string");
      out.datetime = v;
      i++;
      continue;
    }
    if (a && a.startsWith("-")) throw new Error(`Unknown flag: ${a}`);
    throw new Error(`Unexpected argument: ${a}`);
  }
  return out;
}

function runCalcdown(root, args) {
  const tool = path.join(root, "tools", "calcdown.js");
  const res = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" });
  return { status: res.status ?? 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

async function listCaseDirs(casesRoot) {
  const entries = await fs.readdir(casesRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function loadCaseConfig(caseDir) {
  const cfgPath = path.join(caseDir, "case.json");
  try {
    const text = await fs.readFile(cfgPath, "utf8");
    const cfg = JSON.parse(text);
    if (!cfg || typeof cfg !== "object") throw new Error("case.json must be an object");
    return cfg;
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") return null;
    throw err;
  }
}

async function checkOne(root, caseName, opts) {
  const caseDir = path.join(root, "conformance", "cases", caseName);
  const cfg = (await loadCaseConfig(caseDir)) ?? {};
  const entryRel = typeof cfg.entry === "string" && cfg.entry.trim() ? cfg.entry.trim() : "entry.calc.md";
  const entryAbs = path.join(caseDir, entryRel);

  const validateCfg = cfg.validate && typeof cfg.validate === "object" ? cfg.validate : {};
  const exportCfg = cfg.export && typeof cfg.export === "object" ? cfg.export : {};

  const validateExit = typeof validateCfg.exitCode === "number" ? validateCfg.exitCode : 0;
  const exportExit = typeof exportCfg.exitCode === "number" ? exportCfg.exitCode : 0;
  const validateArgsExtra = Array.isArray(validateCfg.args) ? validateCfg.args : ["--strict"];
  const exportArgsExtra = Array.isArray(exportCfg.args) ? exportCfg.args : ["--strict"];

  const expectedValidatePath = path.join(caseDir, "expected.validate.json");
  const expectedExportPath = path.join(caseDir, "expected.export.json");

  const validateRes = runCalcdown(root, ["validate", entryAbs, "--datetime", opts.datetime, ...validateArgsExtra]);
  if (validateRes.status !== validateExit) {
    throw new Error(
      `${caseName}: validate exit ${validateRes.status} !== expected ${validateExit}\n${validateRes.stderr || validateRes.stdout}`
    );
  }

  const exportRes = runCalcdown(root, ["export", entryAbs, "--datetime", opts.datetime, ...exportArgsExtra]);
  if (exportRes.status !== exportExit) {
    throw new Error(
      `${caseName}: export exit ${exportRes.status} !== expected ${exportExit}\n${exportRes.stderr || exportRes.stdout}`
    );
  }

  const validateJson = JSON.parse(validateRes.stdout);
  const exportJson = JSON.parse(exportRes.stdout);

  const validateText = `${stableJsonPretty(validateJson)}\n`;
  const exportText = `${stableJsonPretty(exportJson)}\n`;

  if (opts.update) {
    await fs.writeFile(expectedValidatePath, validateText, "utf8");
    await fs.writeFile(expectedExportPath, exportText, "utf8");
    return { caseName, updated: true };
  }

  const expectedValidate = await fs.readFile(expectedValidatePath, "utf8");
  const expectedExport = await fs.readFile(expectedExportPath, "utf8");

  const okValidate = expectedValidate === validateText;
  const okExport = expectedExport === exportText;

  if (!okValidate || !okExport) {
    const which = [!okValidate ? "validate" : null, !okExport ? "export" : null].filter(Boolean).join(",");
    throw new Error(`${caseName}: output mismatch (${which}). Run: node tools/conformance.js --update`);
  }

  return { caseName, updated: false };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const opts = parseArgs(process.argv.slice(2));
  const casesRoot = path.join(root, "conformance", "cases");

  const dirs = await listCaseDirs(casesRoot);
  const selected = opts.filter ? dirs.filter((d) => d.includes(opts.filter)) : dirs;

  if (selected.length === 0) {
    process.stdout.write("No conformance cases selected.\n");
    return;
  }

  let ok = 0;
  let updated = 0;

  for (const name of selected) {
    const res = await checkOne(root, name, opts);
    ok++;
    if (res.updated) updated++;
  }

  process.stdout.write(
    opts.update
      ? `Updated ${updated} case(s) (${ok} total).\n`
      : `Conformance OK (${ok} case(s)).\n`
  );
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

