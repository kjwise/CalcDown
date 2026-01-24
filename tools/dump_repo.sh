#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-build/dump_repo.md}"

ROOT="$(pwd)"
if command -v git >/dev/null 2>&1 && git rev-parse --show-toplevel >/dev/null 2>&1; then
  ROOT="$(git rev-parse --show-toplevel)"
fi

cd "$ROOT"
mkdir -p "$(dirname "$OUT")"

is_binary() {
  local f="$1"
  # Empty files are treated as text.
  if [ ! -s "$f" ]; then
    return 1
  fi
  if command -v file >/dev/null 2>&1; then
    # "charset=binary" is a reliable indicator for non-text content.
    local mime
    mime="$(file -b --mime "$f" 2>/dev/null || true)"
    case "$mime" in
      *charset=binary*) return 0 ;;
      *) return 1 ;;
    esac
  fi

  # Fallback: treat as text (best-effort).
  return 1
}

should_skip_path() {
  local f="$1"
  case "$f" in
    .git/*|node_modules/*|dist/*|build/*) return 0 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf|*.zip|*.gz|*.tar|*.tgz) return 0 ;;
    *.woff|*.woff2|*.ttf|*.otf|*.eot) return 0 ;;
    *) return 1 ;;
  esac
}

git_info() {
  if ! command -v git >/dev/null 2>&1; then
    return 0
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi
  echo "Git:"
  echo "- root: $(git rev-parse --show-toplevel)"
  echo "- head: $(git rev-parse HEAD)"
  echo "- branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "- status:"
  git status --porcelain || true
}

files_list() {
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    { git ls-files; git ls-files --others --exclude-standard; } | sort -u
    return 0
  fi

  # Fallback: list files in cwd (excluding common dirs).
  find . -type f \
    ! -path "./.git/*" \
    ! -path "./node_modules/*" \
    ! -path "./dist/*" \
    ! -path "./build/*" \
    | sed 's|^\./||' | sort
}

{
  echo "# Repo Dump — CalcDown"
  echo ""
  echo "Generated: $(date -Iseconds)"
  echo ""
  git_info
  echo ""
  echo "Excludes:"
  echo "- dist/, node_modules/, build/, .git/"
  echo "- common binary assets (images, fonts, archives, pdf)"
  echo ""
  echo "## File Index"
  echo ""
} > "$OUT"

included_count=0
total_lines=0
total_bytes=0

while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  if should_skip_path "$f"; then
    continue
  fi
  if is_binary "$f"; then
    continue
  fi
  lines="$(wc -l < "$f" | tr -d ' ')"
  bytes="$(wc -c < "$f" | tr -d ' ')"
  echo "- ${f} (${lines} lines, ${bytes} bytes)" >> "$OUT"
  included_count=$((included_count + 1))
  total_lines=$((total_lines + lines))
  total_bytes=$((total_bytes + bytes))
done < <(files_list)

{
  echo ""
  echo "Included files: ${included_count}"
  echo "Total text lines: ${total_lines}"
  echo "Total text bytes: ${total_bytes}"
  echo ""
  echo "## Files"
  echo ""
} >> "$OUT"

while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  if should_skip_path "$f"; then
    continue
  fi
  if is_binary "$f"; then
    continue
  fi

  {
    echo ""
    echo "===== FILE: ${f} ====="
    echo ""
    cat "$f"
    echo ""
    echo "===== END FILE: ${f} ====="
    echo ""
  } >> "$OUT"
done < <(files_list)
