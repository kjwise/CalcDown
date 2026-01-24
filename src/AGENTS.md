# Source — Agent Instructions

Scope: `src/**`.

## Goals

- Keep the prototype **browser-first**, **deterministic**, and **sandboxed**.
- Keep TypeScript strictness high (this repo uses `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`).

## Implementation rules

- Do not introduce `eval`, `new Function`, or access to browser globals inside CalcScript evaluation.
- Keep dictionaries as `Object.create(null)` when appropriate (avoid prototype surprises).
- Maintain prototype-pollution defenses (`__proto__`, `constructor`, `prototype`).
- Prefer small, readable helpers over new dependencies.

## Error handling

- Favor explicit, user-facing errors with stable messages.
- Include line/node metadata where available (for UI diagnostics).

