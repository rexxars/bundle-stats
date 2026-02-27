# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

@sanity-labs/bundle-stats — CLI tool and library that measures bundle sizes, bundled-with-deps sizes, and import times for npm package exports. Generates reports in terminal, Markdown, and JSON formats with optional baseline comparison for CI delta tracking.

Requires **Node.js 24+**. Uses pnpm as package manager. ESM-only (`"type": "module"`).

## Commands

```bash
pnpm build            # Compile to dist/ with tsup
pnpm check:types      # Type-check with tsc --noEmit
pnpm lint             # ESLint
pnpm lint:fix         # ESLint with auto-fix
pnpm check:format     # Prettier check
pnpm format           # Prettier write
```

No test suite exists yet. No compilation needed during development — Node 24 runs TypeScript natively:

```bash
node bin/bundle-stats.ts --help
node bin/bundle-stats.ts --package /path/to/pkg --no-bundle --no-benchmark
```

Build is only needed for publishing. `bin/bundle-stats.js` imports from `dist/`, while `bin/bundle-stats.ts` imports from `src/` directly.

## Architecture

The pipeline has four stages: **discover → measure → compare → format**.

### Discover (src/exports.ts)
Reads `exports` field from target package.json, resolves conditional exports to the `"default"` condition, and filters by `--ignore`/`--only` glob patterns.

### Measure (src/measure/)
Three independent measurement passes per export:
- **sizes.ts** — Internal size: walks relative imports via regex, sums file sizes, gzips
- **bundle.ts** — Bundled size: Rollup bundles with all non-peer deps, generates treemap HTML via rollup-plugin-visualizer
- **imports.ts** — Import time: spawns sandboxed Node child process (using Node 24 `--permission` flag), runs 10 imports, trims outliers, returns median. Handles both standalone packages and monorepos (detects pnpm-workspace.yaml / package.json workspaces)

### Compare (src/compare.ts)
Diffs current vs baseline report, producing per-export deltas with before/after/delta/percent for each metric.

### Format (src/format/)
- **cli.ts** — ANSI-colored terminal table
- **markdown.ts** — GitHub-flavored Markdown table for PR comments
- **json.ts** — Pretty-printed JSON

### Entry points
- **src/index.ts** — Library API: `generateReport()`, `compareReports()`, formatters
- **src/cli.ts** — CLI arg parsing via `util.parseArgs`, orchestrates the pipeline
- **src/types.ts** — All TypeScript type definitions (Report, ExportReport, ComparisonReport, etc.)

## Code Style

- No semicolons, single quotes, no bracket spacing, 100 char line width (Prettier)
- `@typescript-eslint/no-explicit-any` is allowed
- Target: ESNext, strict mode, bundler module resolution
