import {readFileSync} from 'node:fs'
import {parseArgs, styleText} from 'node:util'

import {compareReports} from './compare.ts'
import {formatCli} from './format/cli.ts'
import {formatJson} from './format/json.ts'
import {formatMarkdown} from './format/markdown.ts'
import {generateReport} from './index.ts'
import type {Report} from './types.ts'

export async function main(): Promise<void> {
  const {values} = parseArgs({
    options: {
      package: {type: 'string', default: '.'},
      format: {type: 'string', default: 'cli'},
      compare: {type: 'string'},
      ignore: {type: 'string', multiple: true, default: []},
      only: {type: 'string', multiple: true, default: []},
      'no-benchmark': {type: 'boolean', default: false},
      'no-bundle': {type: 'boolean', default: false},
      outdir: {type: 'string', default: '.bundle-stats'},
      help: {type: 'boolean', short: 'h', default: false},
    },
    strict: true,
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`Usage: bundle-stats [options]

Options:
  --package <path>     Path to target package directory or package.json (default: .)
  --format <fmt>       Output format: cli | markdown | json (default: cli)
  --compare <path|->   Path to baseline JSON report, or - for stdin
  --ignore <pattern>   Glob pattern to skip exports (repeatable)
  --only <pattern>     Only include matching exports (repeatable)
  --no-benchmark       Skip import time benchmarks
  --no-bundle          Skip Rollup bundling + treemap generation
  --outdir <path>      Directory for treemap HTML artifacts (default: .bundle-stats/)
  -h, --help           Show this help message`)
    process.exit(0)
  }

  const format = values.format as 'cli' | 'markdown' | 'json'
  const ci = !!process.env.CI

  /**
   * Write a progress message to stderr.
   * Always writes regardless of output format — stderr does not interfere with
   * JSON / Markdown on stdout, and the GitHub Action captures stderr for error reporting.
   */
  function progress(message: string): void {
    process.stderr.write(styleText('dim', `${message}\n`))
  }

  // Resolve --package: accept a path to a directory or a package.json file
  let packagePath = values.package!
  if (packagePath.endsWith('package.json')) {
    const {dirname} = await import('node:path')
    packagePath = dirname(packagePath)
  }

  // Generate the report
  const report = await generateReport(
    {
      packagePath,
      ignorePatterns: values.ignore ?? [],
      onlyPatterns: values.only ?? [],
      noBenchmark: values['no-benchmark']!,
      noBundle: values['no-bundle']!,
      outdir: values.outdir!,
    },
    progress,
  )

  // Optionally compare against a baseline
  let output: string

  if (values.compare) {
    progress(`Reading baseline from ${values.compare === '-' ? 'stdin' : values.compare}...`)
    const baseline = readCompareData(values.compare)
    const comparison = compareReports(report, baseline)

    switch (format) {
      case 'json':
        output = formatJson(report)
        break
      case 'markdown':
        output = formatMarkdown(report, comparison, {ci})
        break
      case 'cli':
      default:
        output = formatCli(report, comparison)
        break
    }
  } else {
    switch (format) {
      case 'json':
        output = formatJson(report)
        break
      case 'markdown':
        output = formatMarkdown(report, undefined, {ci})
        break
      case 'cli':
      default:
        output = formatCli(report)
        break
    }
  }

  // Run markdown output through prettier for aligned tables
  if (format === 'markdown') {
    const prettier = await import('prettier')
    output = await prettier.format(output, {parser: 'markdown'})
  }

  process.stdout.write(output + '\n')
}

/**
 * Read a baseline report from a file path or stdin (when path is "-").
 */
function readCompareData(comparePath: string): Report {
  const raw =
    comparePath === '-' ? readFileSync('/dev/stdin', 'utf-8') : readFileSync(comparePath, 'utf-8')
  return JSON.parse(raw) as Report
}
