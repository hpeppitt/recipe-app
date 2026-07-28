---
name: preflight
description: Full pre-commit verification for Recipe Lab - build, lint, tests, then a mobile-viewport browser smoke test of the core flows with console-error checking. Use before committing significant changes or when asked to verify the app works.
---

# Preflight check

Run every gate below. Report a pass/fail checklist at the end; any failure means preflight FAILED.

## 1. Static gates

```bash
npm run build
npm run lint
npm test
```

All three must exit 0.

## 2. Browser smoke test (mobile-first)

1. If nothing is serving yet, start `npm run dev` in the background and note the URL (default http://localhost:5173).
2. Load the claude-in-chrome tools via ToolSearch (one call, core set plus read_console_messages).
3. Create a new tab, resize the window to 390x844 (iPhone-class viewport).
4. Walk these flows, screenshotting anything that looks broken:
   - Library: page loads, recipe cards render, search filters, favorites filter toggles.
   - Recipe detail: open a recipe, check the action icon row, breadcrumb, variations.
   - Version tree: open /recipe/:id/tree for a recipe with variations; nodes readable in BOTH light and dark theme (toggle theme in Settings).
   - Create flow: open /create; verify the auth modal or chat input appears (do NOT spend Gemini quota generating unless the change under test requires it).
   - Shared page: open /shared/:id for a published recipe.
   - Profile: open /profile, check avatar, stats, and the anonymous-account banner if signed in anonymously.
5. After the walk, read console messages and flag any errors or unhandled rejections (ignore benign dev-only noise like React DevTools suggestions).
6. Stop the dev server if you started it.

## 3. Report

Output a checklist: build / lint / tests / each flow / console. State clearly PASS or FAIL overall. On FAIL, list exactly what broke with file:line pointers if identifiable; do not fix anything unless asked - preflight is a gate, not a repair step.
