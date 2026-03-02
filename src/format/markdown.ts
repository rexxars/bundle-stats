import type {ComparisonReport, DeltaValue, ExportDelta, ExportReport, Report} from '../types.ts'
import {formatBytes, formatDelta, formatMs} from './helpers.ts'

/** Threshold (percent) above which import time regressions are highlighted. */
const IMPORT_TIME_REGRESSION_THRESHOLD = 10

export interface MarkdownOptions {
  /** Include CI-specific content (HTML comment tag, treemap artifact note). Default: false. */
  ci?: boolean
  /** Comparison against a published npm version. */
  npmComparison?: ComparisonReport
}

/**
 * Format a bundle stats report as a GitHub-flavoured Markdown table.
 *
 * The output is intended for use as a PR comment. When `comparison` is
 * provided, delta values are shown inline and regressions are flagged.
 *
 * When `npmComparison` is also provided, a second line per cell shows the
 * delta against the npm version. When only `npmComparison` is provided
 * (no git baseline), it is promoted to the primary comparison role.
 */
export function formatMarkdown(
  report: Report,
  comparison?: ComparisonReport,
  options?: MarkdownOptions,
): string {
  const ci = options?.ci ?? false
  const npmComparison = options?.npmComparison

  // When only npmComparison is provided, promote it to the primary comparison
  const effectiveComparison = comparison ?? npmComparison
  const hasDualComparison = !!(comparison && npmComparison)

  const deltasByKey = new Map<string, ExportDelta>()
  if (effectiveComparison) {
    for (const d of effectiveComparison.deltas) {
      deltasByKey.set(d.key, d)
    }
  }

  const npmDeltasByKey = new Map<string, ExportDelta>()
  if (hasDualComparison && npmComparison) {
    for (const d of npmComparison.deltas) {
      npmDeltasByKey.set(d.key, d)
    }
  }

  const npmVersion = npmComparison?.baseline.refLabel ?? npmComparison?.baseline.version

  const lines: string[] = []
  if (ci) lines.push('<!-- bundle-stats-comment -->')
  lines.push(`## 📦 Bundle Stats — \`${report.package}\``, '')

  // Comparison header
  if (effectiveComparison) {
    if (hasDualComparison && comparison) {
      // Both git and npm comparisons
      const gitLabel = comparison.baseline.refLabel
        ? `\`${comparison.baseline.refLabel}\``
        : `\`${comparison.baseline.version}\` (${comparison.baseline.timestamp.split('T')[0]})`
      lines.push(`Compared against ${gitLabel} · \`${npmVersion}\` (npm)`, '')
    } else if (!comparison && npmComparison) {
      // Only npm comparison (promoted to primary)
      lines.push(`Compared against \`${npmVersion}\` (npm)`, '')
    } else if (effectiveComparison.baseline.refLabel) {
      // Only git comparison with ref label
      lines.push(`Compared against \`${effectiveComparison.baseline.refLabel}\``, '')
    } else {
      // Only git comparison without ref label
      const date = effectiveComparison.baseline.timestamp.split('T')[0]
      lines.push(`Compared against \`${effectiveComparison.baseline.version}\` (${date})`, '')
    }
  }

  lines.push(
    '| Export | Internal bytes | Total bytes (bundled) | Import Time |',
    '| :----- | -------------: | --------------------: | ----------: |',
  )

  for (const exp of report.exports) {
    const delta = deltasByKey.get(exp.key)
    const npmDelta = hasDualComparison ? npmDeltasByKey.get(exp.key) : undefined
    lines.push(buildRow(exp, delta, npmDelta, hasDualComparison ? npmVersion : undefined))
  }

  // Handle removed exports (only in baseline)
  if (effectiveComparison) {
    for (const d of effectiveComparison.deltas) {
      if (d.status === 'removed') {
        lines.push(`| 🗑️ ~~${d.name}~~ | - | - | - |`)
      }
    }
  }

  lines.push('')

  // Footer
  if (effectiveComparison) {
    const details = [
      `- Import time regressions over ${IMPORT_TIME_REGRESSION_THRESHOLD}% are flagged with ⚠️`,
    ]
    if (ci)
      details.push('- Treemap artifacts are attached to the CI run for detailed size analysis')
    details.push(
      '- Sizes shown as raw / gzip 🗜️. Internal bytes = own code only. Total bytes = with all dependencies. Import time = Node.js cold-start median.',
    )
    lines.push('<details>', '<summary>Details</summary>', '', ...details, '', '</details>')
  } else {
    const footerLines = []
    if (ci)
      footerLines.push('_Treemap artifacts are attached to the CI run for detailed size analysis._')
    footerLines.push(
      '_Sizes shown as raw / gzip 🗜️. Internal bytes = own code. Total bytes = with deps. Import time = Node.js cold-start median._',
    )
    lines.push(...footerLines)
  }

  lines.push('')

  return lines.join('\n')
}

function buildRow(
  exp: ExportReport,
  delta: ExportDelta | undefined,
  npmDelta: ExportDelta | undefined,
  npmVersion: string | undefined,
): string {
  const name = formatName(exp.name, delta?.status)
  const internal = formatSizePairCell(
    exp.internalSize ? exp.internalSize.rawBytes : null,
    exp.internalSize ? exp.internalSize.gzipBytes : null,
    delta?.internalSize ?? null,
    npmDelta,
    'internalSize',
    npmVersion,
  )
  const bundled = formatSizePairCell(
    exp.bundledSize ? exp.bundledSize.rawBytes : null,
    exp.bundledSize ? exp.bundledSize.gzipBytes : null,
    delta?.bundledSize ?? null,
    npmDelta,
    'bundledSize',
    npmVersion,
  )
  const importTime = formatImportCell(exp, delta?.importTime ?? null, npmDelta, npmVersion)

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
  gzipDelta: DeltaValue | null,
  npmDelta: ExportDelta | undefined,
  field: 'internalSize' | 'bundledSize',
  npmVersion: string | undefined,
): string {
  if (rawBytes == null || gzipBytes == null) return '-'

  const base = `${formatBytes(rawBytes)} / ${formatBytes(gzipBytes)} 🗜️`

  let text: string
  if (gzipDelta) {
    const deltaStr = formatDelta(gzipDelta, formatBytes)
    const deltaSuffix = noBreakParens(deltaStr.slice(deltaStr.indexOf(' (')))
    text = `${base}${deltaSuffix}`
    if (gzipDelta.delta > 0) text = `🔺 ${text}`
    else if (gzipDelta.delta < 0) text = `🔽 ${text}`
  } else {
    text = base
  }

  if (npmDelta && npmVersion) {
    const npmLine = formatNpmDelta(npmDelta[field], npmDelta.status, npmVersion, formatBytes)
    text = appendNpmLine(text, npmLine)
  }

  return text
}

function formatImportCell(
  exp: ExportReport,
  delta: DeltaValue | null,
  npmDelta: ExportDelta | undefined,
  npmVersion: string | undefined,
): string {
  if (exp.importTime == null) return '-'

  if (exp.importTime.failed) {
    return `❌${exp.importTime.error ? ` ${exp.importTime.error}` : ''}`
  }

  let text: string
  if (delta) {
    text = noBreakParens(formatDelta(delta, formatMs))
    // Slower = regression
    if (delta.delta > 0) {
      const flag = delta.percent > IMPORT_TIME_REGRESSION_THRESHOLD ? ' ⚠️' : ''
      text = `🔺 ${text}${flag}`
    } else if (delta.delta < 0) {
      text = `🔽 ${text}`
    }
  } else {
    text = formatMs(exp.importTime.medianMs)
  }

  if (npmDelta && npmVersion) {
    const npmLine = formatNpmDelta(npmDelta.importTime, npmDelta.status, npmVersion, formatMs)
    text = appendNpmLine(text, npmLine)
  }

  return text
}

function formatNpmDelta(
  delta: DeltaValue | null,
  status: ExportDelta['status'],
  version: string,
  unitFn: (n: number) => string,
): string | null {
  if (status === 'added') return `vs ${version}: 🆕`
  if (!delta) return null
  if (delta.delta === 0) return null
  const sign = delta.delta >= 0 ? '+' : ''
  return `vs ${version}: ${sign}${unitFn(delta.delta)}, ${sign}${delta.percent.toFixed(1)}%`
}

function appendNpmLine(base: string, npmLine: string | null): string {
  if (!npmLine) return base
  return `${base}<br>${npmLine}`
}

/** Prevent line breaks within parenthesized delta values, e.g. "(+0 B, +0.0%)" */
function noBreakParens(text: string): string {
  return text.replace(/\(([^)]+)\)/g, (match) => match.replaceAll(' ', '&nbsp;'))
}
