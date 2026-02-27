import type {ComparisonReport, ExportDelta, ExportReport, Report} from '../types.ts'
import {formatBytes, formatDelta, formatMs} from './helpers.ts'

/** Threshold (percent) above which import time regressions are highlighted. */
const IMPORT_TIME_REGRESSION_THRESHOLD = 10

export interface MarkdownOptions {
  /** Include CI-specific content (HTML comment tag, treemap artifact note). Default: false. */
  ci?: boolean
}

/**
 * Format a bundle stats report as a GitHub-flavoured Markdown table.
 *
 * The output is intended for use as a PR comment. When `comparison` is
 * provided, delta values are shown inline and regressions are flagged.
 */
export function formatMarkdown(
  report: Report,
  comparison?: ComparisonReport,
  options?: MarkdownOptions,
): string {
  const ci = options?.ci ?? false
  const deltasByKey = new Map<string, ExportDelta>()
  if (comparison) {
    for (const d of comparison.deltas) {
      deltasByKey.set(d.key, d)
    }
  }

  const lines: string[] = []
  if (ci) lines.push('<!-- bundle-stats-comment -->')
  lines.push(
    `## 📦 Bundle Stats — \`${report.package}\``,
    '',
    '| Export | Internal | Bundled | Import Time |',
    '| :----- | -------: | ------: | ----------: |',
  )

  for (const exp of report.exports) {
    const delta = deltasByKey.get(exp.key)
    lines.push(buildRow(exp, delta))
  }

  // Handle removed exports (only in baseline)
  if (comparison) {
    for (const d of comparison.deltas) {
      if (d.status === 'removed') {
        lines.push(`| 🗑️ ~~${d.name}~~ | - | - | - |`)
      }
    }
  }

  lines.push('')

  // Footer
  if (comparison) {
    const details = [
      `- Compared against baseline: \`${comparison.baseline.version}\` (${comparison.baseline.timestamp})`,
      `- Import time regressions over ${IMPORT_TIME_REGRESSION_THRESHOLD}% are flagged with ⚠️`,
    ]
    if (ci)
      details.push('- Treemap artifacts are attached to the CI run for detailed size analysis')
    details.push(
      '- Sizes shown as raw / gzip 🗜️. Internal = own code only. Bundled = with dependencies. Import time = Node.js cold-start median.',
    )
    lines.push('<details>', '<summary>Details</summary>', '', ...details, '', '</details>')
  } else {
    const footerLines = []
    if (ci)
      footerLines.push('_Treemap artifacts are attached to the CI run for detailed size analysis._')
    footerLines.push(
      '_Sizes shown as raw / gzip 🗜️. Internal = own code. Bundled = with deps. Import time = Node.js cold-start median._',
    )
    lines.push(...footerLines)
  }

  lines.push('')

  return lines.join('\n')
}

function buildRow(exp: ExportReport, delta: ExportDelta | undefined): string {
  const name = formatName(exp.name, delta?.status)
  const internal = formatSizePairCell(
    exp.internalSize ? exp.internalSize.rawBytes : null,
    exp.internalSize ? exp.internalSize.gzipBytes : null,
    delta?.internalSize ?? null,
  )
  const bundled = formatSizePairCell(
    exp.bundledSize ? exp.bundledSize.rawBytes : null,
    exp.bundledSize ? exp.bundledSize.gzipBytes : null,
    delta?.bundledSize ?? null,
  )
  const importTime = formatImportCell(exp, delta?.importTime ?? null)

  return `| ${name} | ${internal} | ${bundled} | ${importTime} |`
}

function formatName(name: string, status: ExportDelta['status'] | undefined): string {
  if (status === 'added') return `🆕 \`${name}\``
  if (status === 'removed') return `🗑️ ~~\`${name}\`~~`
  return `\`${name}\``
}

/**
 * Format a combined "raw / gzip 🗜️" size cell.
 * Delta (if present) is based on the gzip value.
 */
function formatSizePairCell(
  rawBytes: number | null,
  gzipBytes: number | null,
  gzipDelta: import('../types.ts').DeltaValue | null,
): string {
  if (rawBytes == null || gzipBytes == null) return '-'

  const base = `${formatBytes(rawBytes)} / ${formatBytes(gzipBytes)} 🗜️`

  if (gzipDelta) {
    const deltaStr = formatDelta(gzipDelta, formatBytes)
    const deltaSuffix = deltaStr.slice(deltaStr.indexOf(' ('))
    const text = `${base}${deltaSuffix}`
    if (gzipDelta.delta > 0) return `🔺 ${text}`
    if (gzipDelta.delta < 0) return `🔽 ${text}`
    return text
  }

  return base
}

function formatImportCell(
  exp: ExportReport,
  delta: import('../types.ts').DeltaValue | null,
): string {
  if (exp.importTime == null) return '-'

  if (exp.importTime.failed) {
    return `❌${exp.importTime.error ? ` ${exp.importTime.error}` : ''}`
  }

  if (delta) {
    const text = formatDelta(delta, formatMs)
    // Slower = regression
    if (delta.delta > 0) {
      const flag = delta.percent > IMPORT_TIME_REGRESSION_THRESHOLD ? ' ⚠️' : ''
      return `🔺 ${text}${flag}`
    }
    if (delta.delta < 0) return `🔽 ${text}`
    return text
  }

  return formatMs(exp.importTime.medianMs)
}
