// @env node

import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {parseArgs, styleText} from 'node:util'

import {compareReports} from './compare.ts'
import {loadConfig, loadResolvedConfig} from './config.ts'
import {formatCli} from './format/cli.ts'
import {formatJson} from './format/json.ts'
import {formatMarkdown} from './format/markdown.ts'
import {measure} from './index.ts'
import {readReport} from './report.ts'

export async function main(): Promise<void> {
  const {values, positionals} = parseArgs({
    options: {
      config: {type: 'string'},
      'resolved-config': {type: 'string'},
      output: {type: 'string', short: 'o'},
      outdir: {type: 'string'},
      'ref-label': {type: 'string'},
      baseline: {type: 'string'},
      current: {type: 'string'},
      format: {type: 'string', default: 'cli'},
      ci: {type: 'boolean', default: false},
      help: {type: 'boolean', short: 'h', default: false},
    },
    allowPositionals: true,
    strict: true,
  })
  const command = positionals[0]

  if (values.help || command === undefined) {
    process.stdout.write(`${helpText()}\n`)
    return
  }

  if (command === 'resolve-config') {
    const config = await loadConfig(values.config)
    writeOutput(JSON.stringify(config, null, 2), values.output)
    return
  }

  if (command === 'measure') {
    if (values.config && values['resolved-config']) {
      throw new Error('Use either --config or --resolved-config, not both')
    }
    const config = values['resolved-config']
      ? loadResolvedConfig(values['resolved-config'])
      : await loadConfig(values.config)
    const report = await measure(
      config,
      {
        outdir: values.outdir ? resolve(values.outdir) : undefined,
        refLabel: values['ref-label'],
      },
      progress,
    )
    writeOutput(formatJson(report), values.output)
    return
  }

  if (command === 'compare') {
    if (!values.baseline || !values.current) {
      throw new Error('compare requires --baseline and --current')
    }
    if (values.baseline === '-' && values.current === '-') {
      throw new Error('Only one report can be read from stdin')
    }
    const comparison = compareReports(readReport(values.current), readReport(values.baseline))
    const format = values.format
    let output: string
    if (format === 'json') output = formatJson(comparison)
    else if (format === 'markdown') output = formatMarkdown(comparison, {ci: values.ci})
    else if (format === 'cli') output = formatCli(comparison)
    else throw new Error(`Unknown format: ${format}`)
    writeOutput(output, values.output)
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

function progress(message: string): void {
  process.stderr.write(styleText('dim', `${message}\n`))
}

function writeOutput(output: string, path: string | undefined): void {
  const terminated = output.endsWith('\n') ? output : `${output}\n`
  if (path) {
    writeFileSync(path, terminated)
  } else {
    process.stdout.write(terminated)
  }
}

function helpText(): string {
  return `Usage: bundle-stats <command> [options]

Commands:
  resolve-config  Resolve the ESM config to portable JSON
  measure         Measure every configured scenario and write a v2 JSON report
  compare         Compare two existing v2 reports without measuring again

Common options:
  --config <path>           ESM config file (default: bundle-stats.config.ts)
  --output, -o <path>       Write output to a file instead of stdout
  --help, -h                Show this help

Measure options:
  --resolved-config <path>  Read config produced by resolve-config
  --outdir <path>           Override the treemap output directory
  --ref-label <label>       Store a source ref label in the report

Compare options:
  --baseline <path|->       Baseline v2 report
  --current <path|->        Current v2 report
  --format <format>         cli, markdown, or json (default: cli)
  --ci                      Include GitHub Action placeholders in Markdown`
}
