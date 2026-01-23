# CalcDown — Purpose

CalcDown is an attempt to make “spreadsheet-grade” reasoning and modeling work well with:

- AI assistance (easy to read, edit, and explain).
- Version control (meaningful diffs/merges, stable identifiers).
- Browser-first execution and rendering.

## Problem

Traditional spreadsheets are powerful but hostile to collaboration and automation:

- `.xlsx` is effectively opaque state; diffs/merges are poor.
- Cell-address formulas (`B7*C19`) are brittle and semantically weak.
- Charts/layout often pollute the same artifact as data and logic.
- “Spreadsheet logic” is reactive, but most code-first tools are sequential.

## Core thesis

Make the spreadsheet’s semantic model the source of truth (plain text), and treat the grid UI as a projection of that model.

In practice, this means:

- Name things, don’t address things (tables/columns/nodes over `A1` references).
- Represent computation as an explicit dependency graph (DAG), not a script.
- Keep data, compute, and views separate so edits are safe and diffs stay meaningful.

## Goals (v0.x)

- **AI-native editing:** readable formulas, explicit dependencies, strong validation.
- **Git-native artifacts:** canonical formatting, stable row IDs, minimal diff noise.
- **Deterministic execution:** sandboxed compute (no ambient I/O by default).
- **Typed data:** numbers/decimals/currency/percent/dates, constraints, and units.
- **Web-first:** render and evaluate locally in a browser using a safe TS/JS subset.

## Non-goals (initially)

- Full Excel parity (macros, add-ins, every edge-case function).
- Arbitrary side effects inside formulas (network, filesystem, time, randomness).
- Treating “layout” as the primary authoring surface (text-first to start).

## Building blocks

- **Inputs:** typed parameters (sliders/fields in UI).
- **Tables:** typed, ID-stable row sets (data or computed).
- **Nodes:** named computed values (scalars/columns/tables).
- **Views:** declarative charts/dashboards derived from nodes and tables.

