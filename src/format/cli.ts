// @env node

import {styleText} from 'node:util'

import type {ComparisonReport, ScenarioComparison} from '../types.ts'
import {formatBytes, formatDeltaOnly, formatMs} from './helpers.ts'

export function formatCli(comparison: ComparisonReport): string {
  const {summary} = comparison
  const lines = [
    styleText('bold', 'Bundle Stats'),
    `${summary.regressions} regressions, ${summary.improvements} improvements, ` +
      `${summary.insignificant} insignificant changes`,
  ]

  const notable = comparison.changes.filter(isNotable)
  if (notable.length === 0 && summary.errors === 0) {
    lines.push(styleText('green', 'No significant changes.'))
    return lines.join('\n')
  }

  for (const change of notable) {
    const label = `${change.packageName} / ${change.name}`
    const details = formatChangeDetails(change)
    if (change.significance === 'regression') {
      lines.push(styleText('red', `REGRESSION ${label}${details}`))
    } else if (change.significance === 'improvement') {
      lines.push(styleText('green', `IMPROVEMENT ${label}${details}`))
    } else {
      lines.push(styleText('yellow', `${changeLabel(change)} ${label}${details}`))
    }
  }
  if (summary.errors > 0) lines.push(styleText('red', `${summary.errors} measurement errors`))
  return lines.join('\n')
}

function isNotable(change: ScenarioComparison): boolean {
  return change.significance !== 'insignificant'
}

function changeLabel(change: ScenarioComparison): string {
  if (change.status === 'added') return 'ADDED'
  if (change.status === 'removed') return 'REMOVED'
  if (change.significance === 'input-changed') return 'INPUT CHANGED'
  return 'NOT COMPARABLE'
}

function formatChangeDetails(change: ScenarioComparison): string {
  const details: string[] = []
  if (change.gzipSize) details.push(`gzip ${formatDeltaOnly(change.gzipSize, formatBytes)}`)
  if (change.importTime) {
    details.push(`import ${formatDeltaOnly(change.importTime, formatMs)}`)
  }
  return details.length > 0 ? `: ${details.join(', ')}` : ''
}
