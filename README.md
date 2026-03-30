# @rexxars/bundle-stats

Measure bundle sizes, bundled-with-deps sizes, and import times for any npm package's exports.

Generates reports in three formats (terminal, Markdown, JSON) and can compare against a baseline to show deltas — designed for CI workflows that post PR comments with size regressions.

## Install

```bash
npm install -D @rexxars/bundle-stats
```

Requires **Node.js 24** or later.

## CLI Usage

```bash
bundle-stats [options]
```

### Options

| Flag                          | Description                                                                | Default          |
| ----------------------------- | -------------------------------------------------------------------------- | ---------------- |
| `--package <path>`            | Path to target package directory or its `package.json`                     | `.`              |
| `--format <fmt>`              | Output format: `cli`, `markdown`, or `json`                                | `cli`            |
| `--compare <path\|->` | Baseline JSON report for delta comparison (`-` reads stdin)                         |                  |
| `--compare-npm <ver>`         | Compare against a published npm version (e.g. `latest`, `5.12.0`)         |                  |
| `--ignore <pattern>`          | Glob pattern to skip exports (repeatable)                                  |                  |
| `--only <pattern>`            | Only include matching exports (repeatable)                                 |                  |
| `--conditions <name>`         | Export conditions to measure separately (repeatable)                       |                  |
| `--no-benchmark`              | Skip import time benchmarks                                                |                  |
| `--no-bundle`                 | Skip Rollup bundling and treemap generation                                |                  |
| `--no-bin-benchmark`          | Skip import time benchmarks for bin entries                                |                  |
| `--allow-bin-child-process`   | Allow bin entries to spawn child processes during import benchmarks         |                  |
| `--ref-label <label>`         | Label stored in the report to identify the measured ref                    |                  |
| `--outdir <path>`             | Directory for treemap HTML artifacts                                       | `.bundle-stats/` |

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

Compare against the latest published npm version:

```bash
bundle-stats --compare-npm latest --format markdown
```

Compare against a specific published version:

```bash
bundle-stats --compare-npm 5.12.0
```

Skip specific exports:

```bash
bundle-stats --ignore cli --ignore _internal
```

## What It Measures

The tool reads the `exports` and `bin` fields in your `package.json` and runs three measurement passes:

| Metric            | Description                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Internal size** | Own source code reachable from the export entry (raw + gzip)                                        |
| **Bundled size**  | Rollup bundle with all non-peer dependencies inlined (raw + gzip), plus an interactive treemap HTML |
| **Import time**   | Median cold-start `import()` time in a sandboxed Node.js child process (10 runs, outliers trimmed)  |

## GitHub Action

The easiest way to use bundle-stats in CI. Add to your workflow:

```yaml
name: Bundle Stats
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  bundle-stats:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - uses: rexxars/bundle-stats@v1
        with:
          packages: 'sanity, @sanity/vision'
          max-import-time: 500ms
          max-bundle-size-gzip: 100kb
```

The action automatically checks out the PR base, builds, measures, then does the same for the PR head, and posts a comparison comment on the PR. If thresholds are exceeded, the check fails.

### Action Inputs

| Input                     | Default     | Description                                                                   |
| ------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `packages`                | `.`         | Comma-separated package names (resolved via workspaces) or paths              |
| `build-script`            | `build`     | npm script to run per-package via PM filter syntax                            |
| `build-command`           |             | Global build command (overrides per-package builds, for turbo/nx)             |
| `base-ref`                | PR base SHA | Git ref for baseline measurement                                              |
| `head-ref`                | Current SHA | Git ref for current measurement                                               |
| `max-import-time`         |             | Max import time per export (e.g. `500ms`)                                     |
| `max-bundle-size-gzip`    |             | Max gzip bundle size per export (e.g. `100kb`)                                |
| `max-bundle-size-raw`     |             | Max raw bundle size per export (e.g. `500kb`)                                 |
| `max-internal-size-gzip`  |             | Max gzip internal size per export (e.g. `50kb`)                               |
| `max-internal-size-raw`   |             | Max raw internal size per export (e.g. `200kb`)                               |
| `ignore`                  |             | Comma-separated glob patterns to skip exports                                 |
| `only`                    |             | Comma-separated glob patterns for exports to include                          |
| `no-benchmark`            | `false`     | Skip import time benchmarks                                                   |
| `no-bundle`               | `false`     | Skip Rollup bundling                                                          |
| `no-bin-benchmark`        | `false`     | Skip import time benchmarks for bin entries                                   |
| `allow-bin-child-process` | `false`     | Allow bin entries to spawn child processes during import benchmarks            |
| `conditions`              |             | Space-separated export conditions to measure separately                       |
| `compare-npm`             |             | Compare against a published npm version (e.g. `latest`, `5.12.0`)            |
| `comment-id`              |             | Unique identifier for the PR comment (prevents collisions with other actions) |

## Manual CI Usage

For more control, call the CLI directly from your workflow steps:

```yaml
env:
  BUNDLE_STATS: npx bundle-stats

steps:
  # ... build steps ...

  - name: Generate baseline report
    run: $BUNDLE_STATS --package packages/my-lib --no-benchmark --format json > /tmp/baseline.json

  # ... rebuild after changes ...

  - name: Generate comparison report
    run: |
      cat /tmp/baseline.json | \
        $BUNDLE_STATS --package packages/my-lib --format markdown --compare - \
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
import {generateReport, compareReports, formatMarkdown} from '@rexxars/bundle-stats'

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

## Treemap Viewer

Bundle reports include interactive treemap HTML files (generated by [rollup-plugin-visualizer](https://github.com/nicolo-ribaudo/rollup-plugin-visualizer)) that show exactly where bundle weight comes from. A hosted viewer at [rexxars.github.io/bundle-stats](https://rexxars.github.io/bundle-stats/) lets you open these treemaps directly from PR comments — no server involved.

The viewer works entirely client-side: the treemap JSON data is gzip-compressed, base64url-encoded, and embedded in the URL fragment (`#data=...`). Since browsers never send the fragment to the server, the data stays local to your browser. The GitHub Action automatically generates these one-click links in PR comments when the encoded data fits within URL length limits (~1.5 MB). For larger bundles, treemap HTML files are uploaded as CI artifacts instead.

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
