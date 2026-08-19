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
  const significantChanges = summary.increases + summary.decreases

  if (summary.errors > 0) {
    lines.push(
      '> [!CAUTION]',
      `> ${plural(summary.errors, 'scenario has', 'scenarios have')} measurement errors.`,
      '',
    )
  } else if (notable.length === 0) {
    lines.push('✅ No significant changes.', '')
  } else {
    lines.push(
      summary.increases > 0 ? '> [!WARNING]' : '> [!NOTE]',
      `> ${formatNotableSummary(comparison, significantChanges, notable.length)}`,
      '',
    )
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
    } else {
      lines.push('')
    }
    lines.push(formatNotableChange(change))
  }
  return lines
}

function formatNotableChange(change: ScenarioComparison): string {
  const icon = changeIcon(change)
  const label = `\`${change.name}\` (${change.kind})`
  if (change.status === 'added') return [`${icon} ${label}`, 'Added'].join('  \n')
  if (change.status === 'removed') return [`${icon} ${label}`, 'Removed'].join('  \n')
  if (change.significance === 'input-changed') {
    return [
      `${icon} ${label}`,
      'Consumer entry changed, so the size change cannot be compared',
    ].join('  \n')
  }

  const details = formatMetricChanges(change)
  if (details.length === 0) {
    const diagnostic =
      change.current?.diagnostics.find((item) => item.severity === 'error') ??
      change.baseline?.diagnostics.find((item) => item.severity === 'error')
    return [`${icon} ${label}`, diagnostic?.message ?? 'Cannot be compared'].join('  \n')
  }
  return [`${icon} ${label}`, ...details].join('  \n')
}

function formatAllChanges(changes: ScenarioComparison[]): string[] {
  if (changes.length === 0) return ['No scenarios were present in either report.']
  const includePackageName = new Set(changes.map((change) => change.packageName)).size > 1
  const lines = [
    '| Scenario | Kind | Bundle (raw / gzip) | Gzip change | Import time | Import change |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ]
  for (const change of changes) {
    const current = change.current
    const bundle = current?.bundle
    const bundleValue = bundle
      ? `${formatBytes(bundle.rawBytes)} / ${formatBytes(bundle.gzipBytes)}`
      : 'None'
    const importValue =
      current?.importTime && !current.importTime.failed
        ? formatMs(current.importTime.medianMs)
        : 'None'
    const scenarioName = includePackageName ? `${change.packageName} / ${change.name}` : change.name
    lines.push(
      `| ${changeIcon(change)} ${escapeCell(scenarioName)} | ` +
        `${change.kind} | ${bundleValue} | ${formatDeltaCell(change, change.gzipSize, formatBytes)} | ` +
        `${importValue} | ${formatDeltaCell(change, change.importTime, formatMs)} |`,
    )
  }
  return lines
}

function formatMetricChanges(change: ScenarioComparison): string[] {
  const values: string[] = []
  if (change.gzipSize) values.push(formatMetricChange('Gzip', change.gzipSize, formatBytes))
  if (change.rawSize) values.push(formatMetricChange('Raw', change.rawSize, formatBytes))
  if (change.importTime) {
    values.push(formatMetricChange('Import', change.importTime, formatMs))
  }
  return values
}

function formatMetricChange(
  label: string,
  value: DeltaValue,
  formatter: (value: number) => string,
): string {
  if (value.delta === 0) return `${label}: ${formatter(value.after)}, no change`
  const direction = value.delta > 0 ? 'up' : 'down'
  return (
    `${label}: ${formatter(value.after)}, ${direction} ${formatter(Math.abs(value.delta))} ` +
    `(${Math.abs(value.percent).toFixed(1)}%)`
  )
}

function formatDeltaCell(
  change: ScenarioComparison,
  value: DeltaValue | null,
  formatter: (value: number) => string,
): string {
  if (change.status !== 'changed') return 'N/A'
  if (value === null || value.delta === 0) return 'None'
  return formatDeltaOnly(value, formatter).replace('|', '\\|')
}

function isNotable(change: ScenarioComparison): boolean {
  return change.significance !== 'insignificant'
}

function changeIcon(change: ScenarioComparison): string {
  if (change.significance === 'increase') return '🔴'
  if (change.significance === 'decrease') return '🟢'
  if (change.significance === 'input-changed') return '⚠️'
  if (change.status === 'added') return '➕'
  if (change.status === 'removed') return '➖'
  if (change.significance === 'not-comparable') return '❌'
  return '⚪'
}

function formatNotableSummary(
  comparison: ComparisonReport,
  significantChanges: number,
  notableChanges: number,
): string {
  const {summary} = comparison
  const parts: string[] = []
  if (significantChanges > 0) {
    parts.push(plural(significantChanges, 'significant change', 'significant changes'))
  }
  if (summary.added > 0) parts.push(plural(summary.added, 'scenario added', 'scenarios added'))
  if (summary.removed > 0) {
    parts.push(plural(summary.removed, 'scenario removed', 'scenarios removed'))
  }
  if (summary.inputChanged > 0) {
    parts.push(plural(summary.inputChanged, 'consumer entry changed', 'consumer entries changed'))
  }
  if (parts.length === 0) {
    return `${plural(notableChanges, 'change needs', 'changes need')} review.`
  }
  return `${joinList(parts)}.`
}

function joinList(values: string[]): string {
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
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
