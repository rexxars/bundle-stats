import {styleText} from 'node:util'

import type {ComparisonReport, ExportDelta, ExportReport, Report} from '../types.ts'
import {formatBytes, formatDelta, formatMs} from './helpers.ts'

const COLUMNS = ['Export', 'Internal', 'Bundled', 'Import Time'] as const

/**
 * Format a bundle stats report for terminal output.
 *
 * When a ComparisonReport is provided, deltas are shown inline with
 * colour-coded indicators (green for improvements, red for regressions).
 */
export function formatCli(report: Report, comparison?: ComparisonReport): string {
  const deltasByKey = new Map<string, ExportDelta>()
  if (comparison) {
    for (const d of comparison.deltas) {
      deltasByKey.set(d.key, d)
    }
  }

  // Build rows – each row is an array of plain + styled cell pairs.
  // We need the plain text to compute column widths and the styled text to render.
  const rows: Array<{plain: string[]; styled: string[]}> = []

  for (const exp of report.exports) {
    const delta = deltasByKey.get(exp.key)
    rows.push(buildRow(exp, delta))
  }

  // Handle removed exports that only exist in the baseline
  if (comparison) {
    for (const d of comparison.deltas) {
      if (d.status === 'removed') {
        rows.push({
          plain: [`${d.name} (removed)`, '-', '-', '-'],
          styled: [styleText('red', `${d.name} (removed)`), dim('-'), dim('-'), dim('-')],
        })
      }
    }
  }

  // Compute column widths from the plain text values
  const widths = COLUMNS.map((col, i) =>
    Math.max(col.length, ...rows.map((r) => r.plain[i].length)),
  )

  // Build header
  const headerCells = COLUMNS.map((col, i) => styleText('bold', pad(col, widths[i])))
  const separator = widths.map((w) => '─'.repeat(w))

  const lines: string[] = [
    '',
    styleText('bold', `Bundle Stats: ${report.package}@${report.version}`),
    '',
    `  ${headerCells.join('  │  ')}`,
    `  ${separator.join('──┼──')}`,
  ]

  for (const row of rows) {
    const cells = row.styled.map((cell, i) => padStyled(cell, row.plain[i], widths[i]))
    lines.push(`  ${cells.join('  │  ')}`)
  }

  lines.push('')

  return lines.join('\n')
}

function buildRow(
  exp: ExportReport,
  delta: ExportDelta | undefined,
): {plain: string[]; styled: string[]} {
  const namePrefix = delta?.status === 'added' ? '(new) ' : ''
  const nameText = `${namePrefix}${exp.name}`
  const namePlain = nameText
  const nameStyled = delta?.status === 'added' ? styleText('green', nameText) : nameText

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

  return {
    plain: [namePlain, internal.plain, bundled.plain, importTime.plain],
    styled: [nameStyled, internal.styled, bundled.styled, importTime.styled],
  }
}

/**
 * Format a combined "raw / gzip 🗜️" size cell.
 * Delta (if present) is based on the gzip value.
 */
function formatSizePairCell(
  rawBytes: number | null,
  gzipBytes: number | null,
  gzipDelta: import('../types.ts').DeltaValue | null,
): {plain: string; styled: string} {
  if (rawBytes == null || gzipBytes == null) {
    return {plain: '-', styled: dim('-')}
  }

  const base = `${formatBytes(rawBytes)} / ${formatBytes(gzipBytes)} 🗜️`

  if (gzipDelta) {
    const deltaStr = formatDelta(gzipDelta, formatBytes)
    // Replace the "after" value with the full pair, keep the delta suffix
    // formatDelta returns "afterValue (±delta, ±percent%)"
    // We want: "raw / gzip 🗜️ (±delta, ±percent%)"
    const deltaSuffix = deltaStr.slice(deltaStr.indexOf(' ('))
    const text = `${base}${deltaSuffix}`
    return {plain: text, styled: colorizeDelta(text, gzipDelta.delta, true)}
  }

  return {plain: base, styled: base}
}

function formatImportCell(
  exp: ExportReport,
  delta: import('../types.ts').DeltaValue | null,
): {plain: string; styled: string} {
  if (exp.importTime == null) {
    return {plain: '-', styled: dim('-')}
  }

  if (exp.importTime.failed) {
    const text = `FAIL${exp.importTime.error ? `: ${exp.importTime.error}` : ''}`
    return {plain: text, styled: styleText('red', text)}
  }

  if (delta) {
    const text = formatDelta(delta, formatMs)
    // For import time, smaller (negative delta) is better
    return {plain: text, styled: colorizeDelta(text, delta.delta, true)}
  }

  const text = formatMs(exp.importTime.medianMs)
  return {plain: text, styled: text}
}

/**
 * Colorize based on whether the delta is good or bad.
 * @param smallerIsBetter - when true, negative delta = green (improvement)
 */
function colorizeDelta(text: string, delta: number, smallerIsBetter: boolean): string {
  if (delta === 0) return dim(text)
  const isGood = smallerIsBetter ? delta < 0 : delta > 0
  return isGood ? styleText('green', text) : styleText('red', text)
}

function dim(text: string): string {
  return styleText('dim', text)
}

/** Pad a plain-text string to a given width. */
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

/**
 * Pad a styled string to a given width using its plain-text counterpart
 * for length measurement (ANSI codes don't count towards visible width).
 */
function padStyled(styled: string, plain: string, width: number): string {
  return styled + ' '.repeat(Math.max(0, width - plain.length))
}
