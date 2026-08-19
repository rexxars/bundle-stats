# @rexxars/bundle-stats

Measure the bundle cost of ESM package exports, command-line entry points, and named consumer scenarios. Compare two reports to find unexpected tree-shaking, bundle-size, and import-time changes.

bundle-stats v2 uses Rolldown and runs independent bundles concurrently. It requires Node.js 24 or later.

## Install

```bash
npm install --save-dev @rexxars/bundle-stats
```

## Configure scenarios

Create `bundle-stats.config.ts`:

```ts
import {defineConfig} from '@rexxars/bundle-stats/config'

export default defineConfig({
  packages: [
    {
      root: 'packages/client',
      scenarios: {
        exports: {
          exclude: ['internal/**'],
        },
        bins: false,
        entries: {
          'query-only': './bundle-tests/query-only.ts',
          'mutation-only': './bundle-tests/mutation-only.ts',
        },
      },
      importTime: {
        exports: true,
        runs: 7,
      },
    },
  ],
  concurrency: 2,
  platform: 'browser',
  significance: {
    bundle: {bytes: 1024, percent: 1},
    importTime: {milliseconds: 5, percent: 10},
  },
})
```

Package roots are relative to the config file. Consumer entry paths are relative to their package root.

Exports and bins are enabled by default. Import-time measurement is enabled for exports and disabled for bins. Named consumer entries only measure bundle size.

### Consumer entries

A consumer entry describes one use of the package. Rolldown starts at that file, applies tree shaking, bundles non-peer dependencies, and records the final raw and gzip sizes.

For example, `packages/client/bundle-tests/query-only.ts` can contain:

```ts
export {parseQuery} from '../src/index.ts'
```

Keep these files small and stable. If a consumer entry changes between reports, bundle-stats marks its result as not comparable. This prevents a fixture edit from appearing as a library size increase or decrease.

## CLI

The v2 CLI separates measurement from comparison.

Measure the configured scenarios:

```bash
bundle-stats measure --output current.json
```

Measure another ref, then compare the two stored reports:

```bash
bundle-stats measure \
  --ref-label "main (abc12345)" \
  --output baseline.json

bundle-stats compare \
  --baseline baseline.json \
  --current current.json \
  --format markdown \
  --output comment.md
```

`compare` never builds or measures code. Reformatting a report is cheap and cannot measure the current ref a second time.

Resolve a TypeScript config to JSON for use across Git checkouts:

```bash
bundle-stats resolve-config --output resolved-config.json
bundle-stats measure --resolved-config resolved-config.json --output report.json
```

Run `bundle-stats --help` for all command options.

## What gets measured

- Export scenarios bundle each concrete ESM subpath in `package.json#exports`.
- Consumer scenarios bundle a named JavaScript or TypeScript input file.
- Bin scenarios bundle each ESM entry in `package.json#bin`.
- Bundle measurements include raw bytes, gzip bytes, and an HTML treemap.
- Import measurements use isolated Node.js processes and report the trimmed median.
- Peer dependencies and native `.node` addons stay external.

The tool, config files, package entry points, and consumer entries are ESM-only. CommonJS package entry points are reported as errors. Rolldown can still process CommonJS code found inside the dependency graph of an ESM entry.

The report schema includes its engine version, environment, config fingerprint, scenario kind, diagnostics, and consumer input hashes. v1 report JSON is not compatible with v2.

## Significant changes

The Markdown report puts useful changes first:

- 🔴 marks a significant increase.
- 🟢 marks a significant decrease.
- ⚠️ marks a changed consumer input.
- ➕ and ➖ mark added and removed scenarios.
- ❌ marks a measurement error or a result that cannot be compared.
- ⚪ marks a small change in the detailed section.

A bundle change is significant when its gzip delta reaches both configured limits. The defaults are 1 KB and 1 percent. An import-time change must reach both 5 milliseconds and 10 percent.

When nothing crosses a limit, the visible report says `No significant changes`. All scenario measurements remain available in a collapsed `<details>` section.

## GitHub Action

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

      - uses: pnpm/action-setup@v4

      - run: pnpm install --frozen-lockfile

      - uses: rexxars/bundle-stats@v2
        with:
          config: bundle-stats.config.ts
          build-command: pnpm build
```

The action performs these operations:

1. Resolve the config once from the head checkout.
2. Build and measure the base ref once.
3. Build and measure the head ref once.
4. Compare the two JSON reports.
5. Update one PR comment and upload current treemaps.

Available action inputs:

- `config`: Config path. The default is `bundle-stats.config.ts`.
- `build-script`: Per-package npm script. The default is `build`.
- `build-command`: One command that replaces per-package builds.
- `base-ref`: Baseline Git ref. The pull request base SHA is the default.
- `head-ref`: Current Git ref. `GITHUB_SHA` is the default.
- `comment-id`: Stable suffix for independent comments. The default is `default`.

The action fails after posting its report if the current measurement contains errors. Significant changes are annotations, not failures. This keeps significance focused on review noise instead of turning every size change into a policy decision.

## Library API

```ts
import {compareReports, formatMarkdown, loadConfig, measure} from '@rexxars/bundle-stats'

const config = await loadConfig()
const baseline = await measure(config, {refLabel: 'main'})
const current = await measure(config, {refLabel: 'feature'})
const comparison = compareReports(current, baseline)
const markdown = formatMarkdown(comparison)
```

`@rexxars/bundle-stats/config` exports `defineConfig` and its config types without loading the measurement implementation.

## Moving from v1

v2 is intentionally incompatible with v1:

- Replace the option-based CLI with `resolve-config`, `measure`, and `compare`.
- Replace action package and threshold inputs with `bundle-stats.config.ts`.
- Replace `generateReport()` with `loadConfig()` and `measure()`.
- Replace export-specific result handling with package and scenario results.
- Regenerate stored baselines because the report schema and bundling engine changed.
- Remove CommonJS configs and package entry points.

The internal-size source scan and npm-version comparison are not part of v2. Consumer scenarios provide a more direct tree-shaking check than the internal-size approximation.

## Development

Node.js 24 can run the TypeScript source directly:

```bash
node bin/bundle-stats.ts --help
pnpm test
pnpm check:types
pnpm lint
pnpm build
```

Published files are built as ESM with tsdown.

## License

MIT
