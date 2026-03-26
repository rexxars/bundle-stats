import {readFileSync} from 'node:fs'
import {parseArgs, styleText} from 'node:util'

import {compareReports} from './compare.ts'
import {formatCli} from './format/cli.ts'
import {formatJson} from './format/json.ts'
import {formatMarkdown} from './format/markdown.ts'
import {generateReport} from './index.ts'
import {resolveNpmVersion, measureNpmPackage} from './npm.ts'
import type {ComparisonReport, Report} from './types.ts'

export async function main(): Promise<void> {
  const {values} = parseArgs({
    options: {
      package: {type: 'string', default: '.'},
      format: {type: 'string', default: 'cli'},
      compare: {type: 'string'},
      'compare-npm': {type: 'string'},
      ignore: {type: 'string', multiple: true, default: []},
      only: {type: 'string', multiple: true, default: []},
      conditions: {type: 'string', multiple: true, default: []},
      'no-benchmark': {type: 'boolean', default: false},
      'no-bundle': {type: 'boolean', default: false},
      'no-bin-benchmark': {type: 'boolean', default: false},
      'ref-label': {type: 'string'},
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
  --compare-npm <ver>  Compare against a published npm version (e.g. "latest", "5.12.0")
  --ignore <pattern>   Glob pattern to skip exports (repeatable)
  --only <pattern>     Only include matching exports (repeatable)
  --conditions <name>  Export conditions to measure separately (repeatable, e.g. --conditions node --conditions default)
  --no-benchmark       Skip import time benchmarks
  --no-bundle          Skip Rollup bundling + treemap generation
  --no-bin-benchmark   Skip import time benchmarks for bin entries
  --ref-label <label>  Label stored in the report to identify the measured ref (e.g. "main (abc12345)")
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
      conditions: values.conditions ?? [],
      noBenchmark: values['no-benchmark']!,
      noBundle: values['no-bundle']!,
      noBinBenchmark: values['no-bin-benchmark']!,
      outdir: values.outdir!,
    },
    progress,
  )

  if (values['ref-label']) {
    report.refLabel = values['ref-label']
  }

  // Optionally compare against a git baseline
  let comparison: ComparisonReport | undefined
  if (values.compare) {
    progress(`Reading baseline from ${values.compare === '-' ? 'stdin' : values.compare}...`)
    const baseline = readCompareData(values.compare)
    comparison = compareReports(report, baseline)
  }

  // Optionally compare against a published npm version
  let npmComparison: ComparisonReport | undefined
  if (values['compare-npm']) {
    const version = values['compare-npm']
    const resolvedVersion = resolveNpmVersion(report.package, version === 'latest' ? true : version)
    progress(`Comparing against npm ${report.package}@${resolvedVersion}...`)
    const npmReport = await measureNpmPackage({
      packageName: report.package,
      version: resolvedVersion,
      reportOptions: {
        ignorePatterns: values.ignore ?? [],
        onlyPatterns: values.only ?? [],
        conditions: values.conditions ?? [],
        noBenchmark: values['no-benchmark']!,
        noBundle: values['no-bundle']!,
        noBinBenchmark: values['no-bin-benchmark']!,
        outdir: values.outdir!,
      },
      onProgress: progress,
    })
    npmComparison = compareReports(report, npmReport)
  }

  let output: string
  switch (format) {
    case 'json':
      output = formatJson(report)
      break
    case 'markdown':
      output = formatMarkdown(report, comparison, {ci, npmComparison})
      break
    case 'cli':
    default:
      output = formatCli(report, comparison, npmComparison)
      break
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
