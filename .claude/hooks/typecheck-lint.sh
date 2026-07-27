#!/bin/bash
# PostToolUse hook: type-check the project and lint the edited file
# after every Edit/Write to a TypeScript file under src/.
# Exit 2 feeds stderr back to Claude so it fixes the errors immediately.

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | node -e '
let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    console.log((j.tool_input && j.tool_input.file_path) || "");
  } catch {
    console.log("");
  }
});
')

case "$FILE" in
  *"/src/"*.ts | *"/src/"*.tsx) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

FAIL=0
OUT=""

TSC_OUT=$(npx tsc -b 2>&1)
if [ $? -ne 0 ]; then
  FAIL=1
  OUT="TypeScript errors:
${TSC_OUT}
"
fi

LINT_OUT=$(npx eslint "$FILE" 2>&1)
if [ $? -ne 0 ]; then
  FAIL=1
  OUT="${OUT}ESLint errors:
${LINT_OUT}
"
fi

if [ "$FAIL" -eq 1 ]; then
  printf '%s' "$OUT" >&2
  exit 2
fi
exit 0
