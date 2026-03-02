import type {ComparisonReport, DeltaValue, ExportDelta, ExportReport, Report} from '../types.ts'
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
  const npmVersionFormatted = npmVersion ? vPrefix(npmVersion) : undefined

  // Compute the label used in "vs <label>:" delta lines
  let baselineLabel: string | undefined
  if (effectiveComparison) {
    if (!comparison && npmComparison && npmVersionFormatted) {
      // npm promoted to primary
      baselineLabel = `\`${npmVersionFormatted}\``
    } else if (effectiveComparison.baseline.refLabel) {
      baselineLabel = `\`${effectiveComparison.baseline.refLabel}\``
    } else {
      baselineLabel = `\`${effectiveComparison.baseline.version}\``
    }
  }

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
      lines.push(`Compared against ${gitLabel} · \`${npmVersionFormatted}\` (npm)`, '')
    } else if (!comparison && npmComparison) {
      // Only npm comparison (promoted to primary)
      lines.push(`Compared against \`${npmVersionFormatted}\` (npm)`, '')
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
    lines.push(
      buildRow(
        exp,
        delta,
        npmDelta,
        hasDualComparison ? npmVersion : undefined,
        baselineLabel,
      ),
    )
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
  baselineLabel: string | undefined,
): string {
  const name = formatName(exp.name, delta?.status)
  const internal = formatSizePairCell(
    exp.internalSize ? exp.internalSize.rawBytes : null,
    exp.internalSize ? exp.internalSize.gzipBytes : null,
    delta?.internalSize ?? null,
    baselineLabel,
    npmDelta,
    'internalSize',
    npmVersion,
  )
  const bundled = formatSizePairCell(
    exp.bundledSize ? exp.bundledSize.rawBytes : null,
    exp.bundledSize ? exp.bundledSize.gzipBytes : null,
    delta?.bundledSize ?? null,
    baselineLabel,
    npmDelta,
    'bundledSize',
    npmVersion,
  )
  const importTime = formatImportCell(exp, delta?.importTime ?? null, baselineLabel, npmDelta, npmVersion)

  return `| ${name} | ${internal} | ${bundled} | ${importTime} |`
}

function formatName(name: string, status: ExportDelta['status'] | undefined): string {
  if (status === 'added') return `🆕 \`${name}\``
  if (status === 'removed') return `🗑️ ~~\`${name}\`~~`
  return `\`${name}\``
}

/**
 * Format a combined "raw / gzip 🗜️" size cell.
 * Delta (if present) is shown on a separate line as "vs `label`: delta".
 */
function formatSizePairCell(
  rawBytes: number | null,
  gzipBytes: number | null,
  gzipDelta: DeltaValue | null,
  baselineLabel: string | undefined,
  npmDelta: ExportDelta | undefined,
  field: 'internalSize' | 'bundledSize',
  npmVersion: string | undefined,
): string {
  if (rawBytes == null || gzipBytes == null) return '-'

  let text = `${formatBytes(rawBytes)} / ${formatBytes(gzipBytes)} 🗜️`

  if (gzipDelta && baselineLabel) {
    text = `${text}<br>${formatComparisonLine(baselineLabel, gzipDelta, formatBytes)}`
  }

  if (npmDelta && npmVersion) {
    const npmLine = formatNpmDelta(npmDelta[field], npmDelta.status, npmVersion, formatBytes)
    if (npmLine) text = `${text}<br>${npmLine}`
  }

  return text
}

function formatImportCell(
  exp: ExportReport,
  delta: DeltaValue | null,
  baselineLabel: string | undefined,
  npmDelta: ExportDelta | undefined,
  npmVersion: string | undefined,
): string {
  if (exp.importTime == null) return '-'

  if (exp.importTime.failed) {
    return `❌${exp.importTime.error ? ` ${exp.importTime.error}` : ''}`
  }

  let text = formatMs(exp.importTime.medianMs)

  if (delta && baselineLabel) {
    const flag =
      delta.delta > 0 && delta.percent > IMPORT_TIME_REGRESSION_THRESHOLD ? '&nbsp;⚠️' : ''
    text = `${text}<br>${formatComparisonLine(baselineLabel, delta, formatMs)}${flag}`
  }

  if (npmDelta && npmVersion) {
    const npmLine = formatNpmDelta(npmDelta.importTime, npmDelta.status, npmVersion, formatMs)
    if (npmLine) text = `${text}<br>${npmLine}`
  }

  return text
}

/** Format a "vs `label`: colored-delta" comparison line. */
function formatComparisonLine(
  label: string,
  delta: DeltaValue,
  unitFn: (n: number) => string,
): string {
  const deltaText = formatDeltaOnly(delta, unitFn)
  const colored = colorDelta(deltaText, delta.delta)
  return `vs&nbsp;${label}:&nbsp;${colored}`
}

function formatNpmDelta(
  delta: DeltaValue | null,
  status: ExportDelta['status'],
  version: string,
  unitFn: (n: number) => string,
): string | null {
  const label = `\`${vPrefix(version)}\``
  if (status === 'added') return `vs&nbsp;${label}:&nbsp;🆕`
  if (!delta) return null
  if (delta.delta === 0) return null
  const deltaText = formatDeltaOnly(delta, unitFn)
  const colored = colorDelta(deltaText, delta.delta)
  return `vs&nbsp;${label}:&nbsp;${colored}`
}

/**
 * Wrap delta text in GitHub-compatible LaTeX color.
 * Green for improvements (decrease) or no change, red for regressions (increase).
 */
function colorDelta(deltaText: string, delta: number): string {
  const color = delta > 0 ? 'red' : 'green'
  const escaped = deltaText.replace(/%/g, '\\%')
  return '$' + `{\\color{${color}}\\text{${escaped}}}` + '$'
}

/** Ensure an npm version string has a `v` prefix. */
function vPrefix(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}
