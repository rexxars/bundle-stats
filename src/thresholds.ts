import {formatBytes, formatMs} from './format/helpers.ts'
import type {Report} from './types.ts'

export interface ThresholdConfig {
  maxImportTime?: number
  maxBundleSizeGzip?: number
  maxBundleSizeRaw?: number
  maxInternalSizeGzip?: number
  maxInternalSizeRaw?: number
}

export interface ThresholdViolation {
  exportName: string
  metric: string
  value: number
  threshold: number
  formattedValue: string
  formattedThreshold: string
}

export function parseValue(input: string): number {
  const match = input
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|ms|s)$/)
  if (!match) throw new Error(`Invalid threshold value: "${input}"`)
  const num = parseFloat(match[1])
  const unit = match[2]
  switch (unit) {
    case 'b':
      return num
    case 'kb':
      return num * 1024
    case 'mb':
      return num * 1024 * 1024
    case 'ms':
      return num
    case 's':
      return num * 1000
    default:
      throw new Error(`Unknown unit: ${unit}`)
  }
}

export function evaluateThresholds(
  report: Report,
  thresholds: ThresholdConfig,
): ThresholdViolation[] {
  const violations: ThresholdViolation[] = []

  for (const exp of report.exports) {
    // Import time check
    if (
      thresholds.maxImportTime != null &&
      exp.importTime != null &&
      !exp.importTime.failed &&
      exp.importTime.medianMs > thresholds.maxImportTime
    ) {
      violations.push({
        exportName: exp.name,
        metric: 'Import Time',
        value: exp.importTime.medianMs,
        threshold: thresholds.maxImportTime,
        formattedValue: formatMs(exp.importTime.medianMs),
        formattedThreshold: formatMs(thresholds.maxImportTime),
      })
    }

    // Bundle size gzip check
    if (
      thresholds.maxBundleSizeGzip != null &&
      exp.bundledSize != null &&
      exp.bundledSize.gzipBytes > thresholds.maxBundleSizeGzip
    ) {
      violations.push({
        exportName: exp.name,
        metric: 'Bundle Size (gzip)',
        value: exp.bundledSize.gzipBytes,
        threshold: thresholds.maxBundleSizeGzip,
        formattedValue: formatBytes(exp.bundledSize.gzipBytes),
        formattedThreshold: formatBytes(thresholds.maxBundleSizeGzip),
      })
    }

    // Bundle size raw check
    if (
      thresholds.maxBundleSizeRaw != null &&
      exp.bundledSize != null &&
      exp.bundledSize.rawBytes > thresholds.maxBundleSizeRaw
    ) {
      violations.push({
        exportName: exp.name,
        metric: 'Bundle Size (raw)',
        value: exp.bundledSize.rawBytes,
        threshold: thresholds.maxBundleSizeRaw,
        formattedValue: formatBytes(exp.bundledSize.rawBytes),
        formattedThreshold: formatBytes(thresholds.maxBundleSizeRaw),
      })
    }

    // Internal size gzip check
    if (
      thresholds.maxInternalSizeGzip != null &&
      exp.internalSize != null &&
      exp.internalSize.gzipBytes > thresholds.maxInternalSizeGzip
    ) {
      violations.push({
        exportName: exp.name,
        metric: 'Internal Size (gzip)',
        value: exp.internalSize.gzipBytes,
        threshold: thresholds.maxInternalSizeGzip,
        formattedValue: formatBytes(exp.internalSize.gzipBytes),
        formattedThreshold: formatBytes(thresholds.maxInternalSizeGzip),
      })
    }

    // Internal size raw check
    if (
      thresholds.maxInternalSizeRaw != null &&
      exp.internalSize != null &&
      exp.internalSize.rawBytes > thresholds.maxInternalSizeRaw
    ) {
      violations.push({
        exportName: exp.name,
        metric: 'Internal Size (raw)',
        value: exp.internalSize.rawBytes,
        threshold: thresholds.maxInternalSizeRaw,
        formattedValue: formatBytes(exp.internalSize.rawBytes),
        formattedThreshold: formatBytes(thresholds.maxInternalSizeRaw),
      })
    }
  }

  return violations
}

export function formatViolationsMarkdown(violations: ThresholdViolation[]): string {
  if (violations.length === 0) return ''

  const lines: string[] = [
    '### Threshold Violations',
    '',
    '| Export | Metric | Value | Threshold |',
    '| :----- | :----- | ----: | --------: |',
  ]

  for (const v of violations) {
    lines.push(
      `| \`${v.exportName}\` | ${v.metric} | ${v.formattedValue} | ${v.formattedThreshold} |`,
    )
  }

  lines.push('')
  lines.push(`**${violations.length} threshold violation(s) — this check has failed.**`)
  lines.push('')

  return lines.join('\n')
}
