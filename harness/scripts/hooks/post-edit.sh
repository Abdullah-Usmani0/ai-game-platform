#!/usr/bin/env bash
# PostToolUse for Edit|Write|MultiEdit: format + lint TypeScript, schema-validate JSON artifacts, check the GDD.
set -u
cd "$(dirname "$0")/../.." || exit 0
input=$(cat)
file=$(node -e 'const p=JSON.parse(process.argv[1]||"{}"); process.stdout.write(p.tool_input?.file_path||p.tool_input?.path||"")' "$input")
[ -z "$file" ] && exit 0
case "$file" in
  *.ts|*.tsx)
    if [ -d game ]; then
      pnpm -C game exec prettier --write "$file" >/dev/null 2>&1 || true
      out=$(pnpm -C game exec eslint --fix "$file" 2>&1) || { echo "$out" | tail -n 40 >&2; exit 2; }
    fi
    ;;
  *.json)
    case "$file" in
      *game/content/*|*game/design/*|*game/assets/requests.json)
        out=$(pnpm validate "$file" 2>&1) || { echo "$out" | tail -n 40 >&2; exit 2; }
        ;;
    esac
    ;;
  *gdd.md)
    if [ -f .agents/skills/gdd-author/scripts/check-gdd.ts ]; then
      out=$(node --import tsx .agents/skills/gdd-author/scripts/check-gdd.ts "$file" 2>&1) || { echo "$out" | tail -n 40 >&2; exit 2; }
    fi
    ;;
esac
exit 0
