import {comparisonKey} from '../compare.ts'
import type {ComparisonReport, DeltaValue, ExportDelta, Report} from '../types.ts'
import {formatBytes, formatDeltaOnly, formatMs} from './helpers.ts'

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
      deltasByKey.set(comparisonKey(d), d)
    }
  }

  const npmDeltasByKey = new Map<string, ExportDelta>()
  if (hasDualComparison && npmComparison) {
    for (const d of npmComparison.deltas) {
      npmDeltasByKey.set(comparisonKey(d), d)
    }
  }

  const npmVersion = npmComparison?.baseline.refLabel ?? npmComparison?.baseline.version
  const npmVersionFormatted = npmVersion ? vPrefix(npmVersion) : undefined

  // Compute labels for comparison columns
  let gitColumnLabel: string | undefined
  let npmColumnLabel: string | undefined

  if (hasDualComparison && comparison) {
    gitColumnLabel = comparison.baseline.refLabel
      ? comparison.baseline.refLabel
      : `${comparison.baseline.version} (${comparison.baseline.timestamp.split('T')[0]})`
    npmColumnLabel = npmVersionFormatted
  } else if (effectiveComparison) {
    if (!comparison && npmComparison && npmVersionFormatted) {
      // npm promoted to primary
      gitColumnLabel = npmVersionFormatted
    } else if (effectiveComparison.baseline.refLabel) {
      gitColumnLabel = effectiveComparison.baseline.refLabel
    } else {
      gitColumnLabel = `${effectiveComparison.baseline.version} (${effectiveComparison.baseline.timestamp.split('T')[0]})`
    }
  }

  const lines: string[] = []
  lines.push(`## 📦 Bundle Stats — \`${report.package}\``, '')

  // Comparison header
  if (effectiveComparison) {
    if (hasDualComparison && comparison) {
      const gitLabel = comparison.baseline.refLabel
        ? `\`${comparison.baseline.refLabel}\``
        : `\`${comparison.baseline.version}\` (${comparison.baseline.timestamp.split('T')[0]})`
      lines.push(`Compared against ${gitLabel} · \`${npmVersionFormatted}\` (npm)`, '')
    } else if (!comparison && npmComparison) {
      lines.push(`Compared against \`${npmVersionFormatted}\` (npm)`, '')
    } else if (effectiveComparison.baseline.refLabel) {
      lines.push(`Compared against \`${effectiveComparison.baseline.refLabel}\``, '')
    } else {
      const date = effectiveComparison.baseline.timestamp.split('T')[0]
      lines.push(`Compared against \`${effectiveComparison.baseline.version}\` (${date})`, '')
    }
  }

  const multipleExports = report.exports.length > 1
  // Also count removed exports for the "multiple" check
  const removedCount = effectiveComparison
    ? effectiveComparison.deltas.filter((d) => d.status === 'removed').length
    : 0
  const hasMultipleSections = multipleExports || removedCount > 0

  // Render each export's metric table
  for (const exp of report.exports) {
    const delta = deltasByKey.get(comparisonKey(exp))
    const npmDelta = hasDualComparison ? npmDeltasByKey.get(comparisonKey(exp)) : undefined

    // Sub-heading for multiple exports
    if (hasMultipleSections) {
      if (delta?.status === 'added') {
        lines.push(`### 🆕 \`${exp.name}\``, '')
      } else {
        lines.push(`### \`${exp.name}\``, '')
      }
    }

    // Build table header
    const headerCells = ['Metric', 'Value']
    const alignCells = [':----- ', ' ----:']
    if (gitColumnLabel) {
      headerCells.push(`vs ${gitColumnLabel}`)
      alignCells.push(`${'-'.repeat(`vs ${gitColumnLabel}`.length)}:`)
    }
    if (npmColumnLabel) {
      headerCells.push(`vs ${npmColumnLabel}`)
      alignCells.push(`${'-'.repeat(`vs ${npmColumnLabel}`.length)}:`)
    }
    lines.push(`| ${headerCells.join(' | ')} |`)
    lines.push(`| ${alignCells.join(' | ')} |`)

    // Metric rows
    const isAdded = delta?.status === 'added'

    // Internal (raw)
    if (exp.internalSize) {
      const value = formatBytesMd(exp.internalSize.rawBytes)
      const gitDeltaCell = formatSizeDeltaCell(delta?.internalRawSize ?? null, isAdded)
      const npmDeltaCell = formatSizeDeltaCell(
        npmDelta?.internalRawSize ?? null,
        npmDelta?.status === 'added',
      )
      pushMetricRow(
        lines,
        'Internal (raw)',
        value,
        gitColumnLabel ? gitDeltaCell : null,
        npmColumnLabel ? npmDeltaCell : null,
      )
    }

    // Internal (gzip)
    if (exp.internalSize) {
      const value = formatBytesMd(exp.internalSize.gzipBytes)
      const gitDeltaCell = formatSizeDeltaCell(delta?.internalSize ?? null, isAdded)
      const npmDeltaCell = formatSizeDeltaCell(
        npmDelta?.internalSize ?? null,
        npmDelta?.status === 'added',
      )
      pushMetricRow(
        lines,
        'Internal (gzip)',
        value,
        gitColumnLabel ? gitDeltaCell : null,
        npmColumnLabel ? npmDeltaCell : null,
      )
    }

    // Bundled (raw)
    if (exp.bundledSize) {
      const value = formatBytesMd(exp.bundledSize.rawBytes)
      const gitDeltaCell = formatSizeDeltaCell(delta?.bundledRawSize ?? null, isAdded)
      const npmDeltaCell = formatSizeDeltaCell(
        npmDelta?.bundledRawSize ?? null,
        npmDelta?.status === 'added',
      )
      pushMetricRow(
        lines,
        'Bundled (raw)',
        value,
        gitColumnLabel ? gitDeltaCell : null,
        npmColumnLabel ? npmDeltaCell : null,
      )
    }

    // Bundled (gzip)
    if (exp.bundledSize) {
      const value = formatBytesMd(exp.bundledSize.gzipBytes)
      const gitDeltaCell = formatSizeDeltaCell(delta?.bundledSize ?? null, isAdded)
      const npmDeltaCell = formatSizeDeltaCell(
        npmDelta?.bundledSize ?? null,
        npmDelta?.status === 'added',
      )
      pushMetricRow(
        lines,
        'Bundled (gzip)',
        value,
        gitColumnLabel ? gitDeltaCell : null,
        npmColumnLabel ? npmDeltaCell : null,
      )
    }

    // Import time
    if (exp.importTime) {
      if (exp.importTime.failed) {
        const errorText = exp.importTime.error ? `❌ ${exp.importTime.error}` : '❌'
        pushMetricRow(
          lines,
          'Import time',
          errorText,
          gitColumnLabel ? '-' : null,
          npmColumnLabel ? '-' : null,
        )
      } else {
        const value = formatMs(exp.importTime.medianMs)
        const gitDeltaCell = formatImportTimeDeltaCell(delta?.importTime ?? null, isAdded)
        const npmDeltaCell = formatImportTimeDeltaCell(
          npmDelta?.importTime ?? null,
          npmDelta?.status === 'added',
        )
        pushMetricRow(
          lines,
          'Import time',
          value,
          gitColumnLabel ? gitDeltaCell : null,
          npmColumnLabel ? npmDeltaCell : null,
        )
      }
    }

    lines.push('')
  }

  // Handle removed exports (only in baseline)
  if (effectiveComparison) {
    for (const d of effectiveComparison.deltas) {
      if (d.status === 'removed') {
        lines.push(`🗑️ ~~${d.name}~~`, '')
      }
    }
  }

  // Treemap viewer links placeholder (hoisted above details, replaced by embed-treemaps.ts)
  if (ci) {
    lines.push('<!-- treemap-links -->', '')
  }

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
    const footerLines: string[] = []
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

/**
 * Push a metric row into the lines array. Delta cells are included only if non-null.
 */
function pushMetricRow(
  lines: string[],
  metricName: string,
  value: string,
  gitDelta: string | null,
  npmDelta: string | null,
): void {
  let row = `| ${metricName} | ${value} |`
  if (gitDelta !== null) {
    row += ` ${gitDelta} |`
  }
  if (npmDelta !== null) {
    row += ` ${npmDelta} |`
  }
  lines.push(row)
}

/**
 * Format a size delta cell for a comparison column.
 */
function formatSizeDeltaCell(delta: DeltaValue | null, isAdded: boolean | undefined): string {
  if (isAdded) return '-'
  if (!delta) return '-'
  if (delta.delta === 0) return '-'
  const deltaText = formatDeltaOnly(delta, formatBytesMd)
  return colorDelta(deltaText, delta.delta)
}

/**
 * Format an import time delta cell for a comparison column.
 */
function formatImportTimeDeltaCell(delta: DeltaValue | null, isAdded: boolean | undefined): string {
  if (isAdded) return '-'
  if (!delta) return '-'
  if (delta.delta === 0) return '-'
  const deltaText = formatDeltaOnly(delta, formatMs)
  const colored = colorDelta(deltaText, delta.delta)
  const flag = delta.delta > 0 && delta.percent > IMPORT_TIME_REGRESSION_THRESHOLD ? ' ⚠️' : ''
  return `${colored}${flag}`
}

/**
 * Wrap delta text in GitHub-compatible colored HTML.
 * Green for improvements (decrease) or no change, red for regressions (increase).
 */
function colorDelta(deltaText: string, delta: number): string {
  const color = delta > 0 ? 'red' : 'green'
  const noBreak = deltaText.replace(/, /g, ',&nbsp;')
  return `<font color="${color}">${noBreak}</font>`
}

/** Like formatBytes but without a space before the unit, matching formatMs style. */
function formatBytesMd(bytes: number): string {
  return formatBytes(bytes).replace(' ', '&nbsp;')
}

/** Ensure an npm version string has a `v` prefix. */
function vPrefix(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}
