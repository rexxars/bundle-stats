# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@rexxars/bundle-stats` measures bundle sizes, bundled-with-deps sizes, and import times for npm package exports. It outputs reports as terminal tables, Markdown, or JSON, and can compare against a baseline to show deltas. Designed for CI workflows that post PR comments with size regressions.

Includes a colocated composite GitHub Action (`action.yml` + `action/`) that automates before/after comparison on PRs with comment lifecycle management.

## Commands

```bash
pnpm build              # Compile to dist/ with tsup
pnpm check:types        # Type-check with tsc --noEmit
pnpm lint               # ESLint
pnpm lint:fix           # ESLint with auto-fix
pnpm check:format       # Prettier check
pnpm format             # Prettier write
pnpm test               # Run all tests (node --test)
```

Run a single test file:

```bash
node --test src/thresholds.test.ts
```

Run from source without building (Node 24 runs TS natively):

```bash
node bin/bundle-stats.ts --help
node bin/bundle-stats.ts --package /path/to/pkg --no-bundle --no-benchmark
```

Build is only needed for publishing — `bin/bundle-stats.js` imports from `dist/`, while `bin/bundle-stats.ts` imports from `src/` directly.

## Architecture

### Core pipeline (`src/`)

The CLI (`src/cli.ts`) is a thin wrapper around `generateReport()` in `src/index.ts`, which orchestrates three measurement passes per export entry:

1. **Internal size** (`src/measure/sizes.ts`) — own source code reachable from the export (raw + gzip)
2. **Bundled size** (`src/measure/bundle.ts`) — Rollup bundle with all non-peer deps inlined, plus interactive treemap HTML
3. **Import time** (`src/measure/imports.ts`) — median cold-start `import()` in a sandboxed child process

Key modules:

- `src/exports.ts` — reads `package.json` exports field, discovers entry points
- `src/compare.ts` — generates delta reports between two measurement runs
- `src/format/` — three formatters: `cli.ts` (terminal tables), `markdown.ts`, `json.ts`
- `src/thresholds.ts` — parses human-readable values (`"500ms"`, `"100kb"`), evaluates thresholds against reports, formats violations as Markdown
- `src/types.ts` — all shared TypeScript interfaces (`Report`, `ExportReport`, `ExportDelta`, etc.)
- `src/glob.ts` — glob-to-regex for `--ignore` / `--only` patterns

### GitHub Action (`action/`)

Composite action defined in `action.yml` with shell scripts:

- `action/run.sh` — main orchestrator: resolves packages, posts calculating comment, checks out base→build→measure, then head→build→measure, generates comparison, checks thresholds, upserts final comment
- `action/comment.sh` — PR comment CRUD via `gh api` using `<!-- bundle-stats-comment -->` HTML marker
- `action/workspace.sh` — PM detection (pnpm/yarn/npm via lock files), workspace resolution
- `action/build.sh` — per-package builds via PM filter syntax, or global build command override
- `action/check-thresholds.ts` — standalone CLI that imports from `src/thresholds.ts` to evaluate threshold violations

## Conventions

- ESM-only (`"type": "module"` in package.json)
- Node.js 24+ required (uses native TS execution, `fs.globSync`, `node:test`)
- Tests use `node:test` and `node:assert/strict` — no external test framework
- TypeScript uses `.ts` extensions in imports (`from './types.ts'`)
- `tsconfig.json` uses `erasableSyntaxOnly: true` and `allowImportingTsExtensions: true` for Node 24 native TS
- pnpm as package manager
- Release via `semantic-release` with `@sanity/semantic-release-preset`
- PR titles must use [Conventional Commits](https://www.conventionalcommits.org/) style: `fix:`, `feat:`, `test:`, `refactor:`, `chore:`, `docs:`, `ci:`, `perf:`, `build:`, `style:`. The type prefix is lowercase, followed by a colon and space, then a short imperative description (e.g. `fix: correct treemap path resolution`). This is required because `semantic-release` parses PR titles to determine version bumps.
