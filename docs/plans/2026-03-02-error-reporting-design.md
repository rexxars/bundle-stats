# Error Reporting Improvements

## Problem

When the GitHub Action fails, users see "Process completed with exit code 1" with no PR comment and no useful error message. Six gaps identified:

1. Progress suppressed in JSON mode — bundle failures invisible
2. No `.catch()` on entry point — raw stack traces
3. Error trap set too late in run.sh — failures before trap get no PR comment
4. Git checkout noise mixed into error output
5. Bundle failures silently swallowed (null with no explanation)
6. No context about which step/export failed

## Changes

### `src/cli.ts` — Always write progress to stderr

Remove the `format === 'cli'` guard. Progress messages go to stderr regardless of output format. Stderr doesn't pollute stdout for JSON/markdown piping.

### `bin/bundle-stats.ts` — Catch and report errors cleanly

Add `.catch()` on `main()` that writes `Error: <message>` to stderr and sets `process.exitCode = 1`. No `process.exit()` call so buffers drain.

### `action/run.sh` — Move error trap earlier

Move `ERROR_FILE`, `cleanup()`, and `trap on_error ERR` to right after sourcing helpers, before any work. Early failures (package resolution, PR number detection) now trigger error comments.

### `action/run.sh` — Isolate git noise

Redirect `git checkout` stderr to `/dev/null` instead of `ERROR_FILE`. The "HEAD is now at..." messages are noise.

### `src/index.ts` — Surface bundle failures via stderr

Progress now always writes to stderr, so the existing `progress("Failed to bundle ...")` call in the catch block becomes visible. No structural changes needed beyond the cli.ts fix.

### Error context

Add step-level echo statements in `run.sh` before each major operation so ERROR_FILE has context about what was running when something failed.
