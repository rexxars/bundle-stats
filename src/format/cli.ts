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
export function formatCli(
  report: Report,
  comparison?: ComparisonReport,
  npmComparison?: ComparisonReport,
): string {
  const lines: string[] = [
    '',
    styleText('bold', `Bundle Stats: ${report.package}@${report.version}`),
  ]

  lines.push(...buildTable(report, comparison))

  if (npmComparison) {
    const npmVersion = npmComparison.baseline.refLabel ?? npmComparison.baseline.version
    lines.push(styleText('bold', `vs npm ${npmVersion}`))
    lines.push(...buildTable(report, npmComparison))
  }

  return lines.join('\n')
}

function buildTable(report: Report, comparison?: ComparisonReport): string[] {
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
    Math.max(stringWidth(col), ...rows.map((r) => stringWidth(r.plain[i]))),
  )

  // Build header
  const headerCells = COLUMNS.map((col, i) => styleText('bold', pad(col, widths[i])))
  const separator = widths.map((w) => '─'.repeat(w))

  const lines: string[] = ['', `  ${headerCells.join('  │  ')}`, `  ${separator.join('──┼──')}`]

  for (const row of rows) {
    const cells = row.styled.map((cell, i) => padStyled(cell, row.plain[i], widths[i]))
    lines.push(`  ${cells.join('  │  ')}`)
  }

  lines.push('')

  return lines
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
  return text + ' '.repeat(Math.max(0, width - stringWidth(text)))
}

/**
 * Pad a styled string to a given width using its plain-text counterpart
 * for length measurement (ANSI codes don't count towards visible width).
 */
function padStyled(styled: string, plain: string, width: number): string {
  return styled + ' '.repeat(Math.max(0, width - stringWidth(plain)))
}

/**
 * Calculate the visual width of a string in terminal columns.
 * Unlike String.length which counts UTF-16 code units, this accounts for
 * wide characters (emoji, CJK) taking 2 columns and zero-width characters
 * (variation selectors, ZWJ) taking 0 columns.
 */
function stringWidth(str: string): number {
  let width = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0)!
    if (
      (cp >= 0xfe00 && cp <= 0xfe0f) || // Variation Selectors
      (cp >= 0xe0100 && cp <= 0xe01ef) || // Variation Selectors Supplement
      (cp >= 0x200b && cp <= 0x200f) || // Zero-width space, ZWNJ, ZWJ, etc.
      (cp >= 0x2028 && cp <= 0x202e) || // Line separators, directional formatting
      cp === 0xfeff // Zero-width no-break space (BOM)
    ) {
      continue
    }
    if (
      cp >= 0x10000 || // Supplementary planes (emoji, etc.)
      (cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals, Kangxi, Symbols
      (cp >= 0x3040 && cp <= 0x33bf) || // Hiragana, Katakana, CJK Compat
      (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
      (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compat Ideographs
      (cp >= 0xff01 && cp <= 0xff60) || // Fullwidth Forms
      (cp >= 0xffe0 && cp <= 0xffe6) // Fullwidth Signs
    ) {
      width += 2
      continue
    }
    width += 1
  }
  return width
}
