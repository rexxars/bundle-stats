# @sanity/bundle-stats

Measure bundle sizes, bundled-with-deps sizes, and import times for any npm package's exports.

Generates reports in three formats (terminal, Markdown, JSON) and can compare against a baseline to show deltas — designed for CI workflows that post PR comments with size regressions.

## Install

```bash
npm install -D @sanity/bundle-stats
```

Requires **Node.js 24** or later.

## CLI Usage

```bash
bundle-stats [options]
```

### Options

| Flag                  | Description                                                 | Default          |
| --------------------- | ----------------------------------------------------------- | ---------------- |
| `--package <path>`    | Path to target package directory or its `package.json`      | `.`              |
| `--format <fmt>`      | Output format: `cli`, `markdown`, or `json`                 | `cli`            |
| `--compare <path\|->` | Baseline JSON report for delta comparison (`-` reads stdin) |                  |
| `--ignore <pattern>`  | Glob pattern to skip exports (repeatable)                   |                  |
| `--no-benchmark`      | Skip import time benchmarks                                 |                  |
| `--no-bundle`         | Skip Rollup bundling and treemap generation                 |                  |
| `--outdir <path>`     | Directory for treemap HTML artifacts                        | `.bundle-stats/` |

### Examples

Run a full report on the current directory:

```bash
bundle-stats
```

Report on a specific package, skipping slow steps:

```bash
bundle-stats --package packages/sanity --no-bundle --no-benchmark
```

Generate a JSON baseline, then compare a later run against it:

```bash
# save baseline
bundle-stats --format json > baseline.json

# ... make changes, rebuild ...

# compare
bundle-stats --format markdown --compare baseline.json > comment.md
```

Pipe the baseline via stdin:

```bash
cat baseline.json | bundle-stats --format markdown --compare -
```

Skip specific exports:

```bash
bundle-stats --ignore cli --ignore _internal
```

## What It Measures

The tool reads the `exports` field in your `package.json` and runs three measurement passes:

| Metric            | Description                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Internal size** | Own source code reachable from the export entry (raw + gzip)                                        |
| **Bundled size**  | Rollup bundle with all non-peer dependencies inlined (raw + gzip), plus an interactive treemap HTML |
| **Import time**   | Median cold-start `import()` time in a sandboxed Node.js child process (10 runs, outliers trimmed)  |

## CI Usage

Add as a dev dependency and call it from your workflow. Example for GitHub Actions:

```yaml
env:
  BUNDLE_STATS: npx bundle-stats

steps:
  # ... build steps ...

  - name: Generate baseline report
    run: $BUNDLE_STATS report --package packages/my-lib --no-benchmark --format json > /tmp/baseline.json

  # ... rebuild after changes ...

  - name: Generate comparison report
    run: |
      cat /tmp/baseline.json | \
        $BUNDLE_STATS report --package packages/my-lib --format markdown --compare - \
        > /tmp/comment.md

  - name: Post PR comment
    uses: thollander/actions-comment-pull-request@v3
    with:
      comment-tag: bundle-stats
      file-path: /tmp/comment.md
```

## Library API

The package also exports a programmatic API:

```ts
import {generateReport, compareReports, formatMarkdown} from '@sanity/bundle-stats'

const report = await generateReport({
  packagePath: './packages/my-lib',
  ignorePatterns: ['_internal'],
  noBenchmark: false,
  noBundle: false,
  outdir: '.bundle-stats',
})

// Optional: compare against a previous report
const comparison = compareReports(report, baselineReport)
const markdown = formatMarkdown(report, comparison)
```

## Development

Node 24 runs TypeScript natively, so you can work on the source without a build step:

```bash
# Run directly from source — no compilation needed
node bin/bundle-stats.ts --help
node bin/bundle-stats.ts --package /path/to/some-package --no-bundle --no-benchmark
```

### Scripts

```bash
pnpm build          # Compile to dist/ with tsup
pnpm check:types    # Type-check with tsc
pnpm lint           # ESLint
pnpm lint:fix       # ESLint with auto-fix
pnpm check:format   # Prettier check
pnpm format         # Prettier write
```

Build is only needed for publishing to npm — `bin/bundle-stats.js` imports from `dist/`, while `bin/bundle-stats.ts` imports from `src/` directly.

## License

MIT
