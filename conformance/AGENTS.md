# Conformance — Agent Instructions

Scope: `conformance/**`.

## What “conformance” is

Conformance is a **deterministic golden-file suite** for the CalcDown CLI/tooling.

It runs `tools/calcdown.js validate` and `tools/calcdown.js export` on a fixed set of small projects and compares the resulting JSON outputs **byte-for-byte** after canonical key sorting.

This is intentionally **stronger than unit tests**: it verifies the end-to-end behavior (parsing → evaluation → view validation → diagnostics → JSON output shape) that downstream tooling relies on.

Run it with:

- `make conformance` (preferred)
- `node tools/conformance.js`

## How cases are structured

Each case lives under `conformance/cases/<case-name>/` and typically contains:

- `case.json` (optional) — per-case overrides (entry filename, expected exit codes, CLI args)
- `entry.calc.md` (default) — the CalcDown entry document
- `expected.validate.json` — expected stdout JSON for `calcdown validate`
- `expected.export.json` — expected stdout JSON for `calcdown export`
- Optional data files used by the case (e.g. `data.csv`, `data.json`)

The runner is `tools/conformance.js`.

### Updating expected outputs

Do **not** hand-edit the `expected.*.json` files.

Instead, update golden outputs deterministically with:

- `node tools/conformance.js --update`
- Filter to one case: `node tools/conformance.js --filter <substring> --update`

The runner defaults to a fixed datetime (`--datetime 2026-01-24T00:00:00Z`) to keep `std.date.now/today` deterministic.

## Current cases (as of CalcDown 0.8)

- `vectorization-projection` — numeric vectorization + column projection behavior
- `projection-missing-key` — projection error includes row index and message is stable
- `sortby-runtime-order` — `data.sortBy` affects runtime row order deterministically
- `yaml-view-block` — YAML `view` blocks parse + validate correctly
- `yaml-view-alias-disallowed` — YAML anchors/aliases are rejected for safety
- `view-unknown-source` — `view.source` validation catches missing table/node references
- `external-data-hash-mismatch` — external `data.source` hash verification fails deterministically
- `manifest-lock-enforced` — manifest-declared lockfile is honored by validate/export

## Adding new cases

- Keep each case minimal: one feature/behavior per case.
- Prefer local fixtures over network I/O.
- Use stable identifiers, stable ordering, and stable error messages/codes (downstream tooling depends on them).
