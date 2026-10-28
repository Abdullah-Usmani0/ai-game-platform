#!/usr/bin/env bash
# PreToolUse for Bash: block network, package and destructive commands.
set -u
input=$(cat)
cmd=$(node -e 'const p=JSON.parse(process.argv[1]||"{}"); process.stdout.write(p.tool_input?.command||"")' "$input")
if echo "$cmd" | grep -Eq '(^|[;&| ])(curl|wget|ssh|scp|sudo|npm (i|install|add)|pnpm (add|install|i)\b|git push|rm -rf +/|chmod -R)'; then
  echo "Blocked: network, package installation, destructive or privileged commands are not allowed in the harness." >&2
  exit 2
fi
exit 0
