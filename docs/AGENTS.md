# Docs — Agent Instructions

Scope: `docs/**`.

## Primary goal

Keep the CalcDown specs and examples **pristine**: clear, consistent, and easy to implement.

## Writing rules

- Use RFC2119 keywords consistently (**MUST/SHOULD/MAY**).
- Keep terminology stable (document/block/input/node/table/view).
- Prefer small, reviewable diffs; do not reflow text unnecessarily.
- When showing fenced-block examples inside Markdown, use outer fences (e.g. ````) to avoid fence collisions.

## Versioning

- Specs are versioned: `calcdown-0.x.md`, `stdlib-0.x.md`.
- Older specs should be clearly marked **superseded** and left for historical context.
- Update `README.md` links when introducing a new version.

## Examples

- Put end-to-end examples in `docs/examples/*.calc.md`.
- Ensure examples match the latest spec version in front matter (`calcdown: 0.3`, etc.).
- Prefer JSON `view` blocks for portability; YAML is accepted in demos as a convenience.
