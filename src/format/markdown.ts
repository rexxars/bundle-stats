import type {ComparisonReport, DeltaValue, ScenarioComparison} from '../types.ts'
import {formatBytes, formatDeltaOnly, formatMs} from './helpers.ts'

interface MarkdownOptions {
  ci?: boolean
}

export function formatMarkdown(
  comparison: ComparisonReport,
  options: MarkdownOptions = {},
): string {
  const {summary} = comparison
  const lines = ['## Bundle Stats', '']
  const notable = comparison.changes.filter(isNotable)

  if (summary.errors > 0) {
    lines.push(
      '> [!CAUTION]',
      `> ${plural(summary.errors, 'scenario has', 'scenarios have')} measurement errors.`,
      '',
    )
  } else if (summary.regressions > 0) {
    lines.push(
      '> [!WARNING]',
      `> ${plural(summary.regressions, 'significant regression', 'significant regressions')} detected.`,
      '',
    )
  } else if (notable.length === 0) {
    lines.push('✅ No significant changes.', '')
  } else {
    lines.push('✅ No significant regressions.', '')
  }

  if (notable.length > 0) {
    lines.push(...formatNotableChanges(notable), '')
  }

  lines.push(
    '<details>',
    `<summary>All scenario measurements (${comparison.changes.length})</summary>`,
    '',
  )
  if (options.ci) lines.push('<!-- treemap-links -->', '')
  lines.push(
    ...formatAllChanges(comparison.changes),
    '',
    formatThresholdNote(comparison),
    '',
    '</details>',
  )

  return lines.join('\n')
}

function formatNotableChanges(changes: ScenarioComparison[]): string[] {
  const lines: string[] = []
  let currentPackage = ''
  for (const change of changes) {
    if (change.packageName !== currentPackage) {
      if (currentPackage) lines.push('')
      currentPackage = change.packageName
      lines.push(`### ${currentPackage}`, '')
    }
    lines.push(formatNotableChange(change))
  }
  return lines
}

function formatNotableChange(change: ScenarioComparison): string {
  const icon = changeIcon(change)
  const label = `\`${change.name}\` (${change.kind})`
  if (change.status === 'added') return `- ${icon} ${label}: added`
  if (change.status === 'removed') return `- ${icon} ${label}: removed`
  if (change.significance === 'input-changed') {
    return `- ${icon} ${label}: consumer entry changed, so the size delta is not comparable`
  }

  const details = formatDeltas(change)
  if (details.length === 0) {
    const diagnostic =
      change.current?.diagnostics.find((item) => item.severity === 'error') ??
      change.baseline?.diagnostics.find((item) => item.severity === 'error')
    return `- ${icon} ${label}: ${diagnostic?.message ?? 'not comparable'}`
  }
  return `- ${icon} ${label}: ${details.join('; ')}`
}

function formatAllChanges(changes: ScenarioComparison[]): string[] {
  if (changes.length === 0) return ['No scenarios were present in either report.']
  const lines = [
    '| Scenario | Kind | Bundle (raw / gzip) | Gzip change | Import time | Import change |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ]
  for (const change of changes) {
    const current = change.current
    const bundle = current?.bundle
    const bundleValue = bundle
      ? `${formatBytes(bundle.rawBytes)} / ${formatBytes(bundle.gzipBytes)}`
      : '-'
    const importValue =
      current?.importTime && !current.importTime.failed
        ? formatMs(current.importTime.medianMs)
        : '-'
    lines.push(
      `| ${changeIcon(change)} ${escapeCell(change.packageName)} / ${escapeCell(change.name)} | ` +
        `${change.kind} | ${bundleValue} | ${formatDeltaCell(change.gzipSize, formatBytes)} | ` +
        `${importValue} | ${formatDeltaCell(change.importTime, formatMs)} |`,
    )
  }
  return lines
}

function formatDeltas(change: ScenarioComparison): string[] {
  const values: string[] = []
  if (change.gzipSize) values.push(`gzip ${formatDeltaOnly(change.gzipSize, formatBytes)}`)
  if (change.rawSize) values.push(`raw ${formatDeltaOnly(change.rawSize, formatBytes)}`)
  if (change.importTime) {
    values.push(`import ${formatDeltaOnly(change.importTime, formatMs)}`)
  }
  return values
}

function formatDeltaCell(value: DeltaValue | null, formatter: (value: number) => string): string {
  if (value === null || value.delta === 0) return '-'
  return formatDeltaOnly(value, formatter).replace('|', '\\|')
}

function isNotable(change: ScenarioComparison): boolean {
  return change.significance !== 'insignificant'
}

function changeIcon(change: ScenarioComparison): string {
  if (change.significance === 'regression') return '🔴'
  if (change.significance === 'improvement') return '🟢'
  if (change.significance === 'input-changed') return '⚠️'
  if (change.status === 'added') return '➕'
  if (change.status === 'removed') return '➖'
  if (change.significance === 'not-comparable') return '❌'
  return '⚪'
}

function formatThresholdNote(comparison: ComparisonReport): string {
  const significance = comparison.current.config.significance
  return (
    `_Significant means at least ${formatBytes(significance.bundle.bytes)} and ` +
    `${significance.bundle.percent}% gzip, or at least ` +
    `${formatMs(significance.importTime.milliseconds)} and ` +
    `${significance.importTime.percent}% import time._`
  )
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|')
}

function plural(count: number, singular: string, pluralValue: string): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}
