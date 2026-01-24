# Tools — Agent Instructions

Scope: `tools/**`.

This folder contains lightweight helper scripts used by `make` targets.

- Keep scripts dependency-free and offline-friendly.
- Prefer stable, deterministic output suitable for version control and CI.
- Avoid writing outside `build/` unless explicitly intended.

