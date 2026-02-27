#!/usr/bin/env node

/**
 * Evaluate threshold violations against bundle stats reports.
 *
 * Usage:
 *   node action/check-thresholds.ts \
 *     --report <name>:<path> [--report ...] \
 *     [--max-import-time 500ms] \
 *     [--max-bundle-size-gzip 100kb] \
 *     [--max-bundle-size-raw 200kb] \
 *     [--max-internal-size-gzip 50kb] \
 *     [--max-internal-size-raw 100kb]
 *
 * Exit codes:
 *   0 — no thresholds configured, or all thresholds pass
 *   1 — threshold violations found (markdown printed to stdout)
 *   2 — invalid arguments
 */

import {readFileSync} from 'node:fs'
import {parseArgs} from 'node:util'

import {evaluateThresholds, formatViolationsMarkdown, parseValue} from '../src/thresholds.ts'
import type {ThresholdConfig, ThresholdViolation} from '../src/thresholds.ts'
import type {Report} from '../src/types.ts'

const {values} = parseArgs({
  options: {
    report: {type: 'string', multiple: true, default: []},
    'max-import-time': {type: 'string'},
    'max-bundle-size-gzip': {type: 'string'},
    'max-bundle-size-raw': {type: 'string'},
    'max-internal-size-gzip': {type: 'string'},
    'max-internal-size-raw': {type: 'string'},
  },
  strict: true,
})

// Build threshold config from CLI args
const thresholds: ThresholdConfig = {}

if (values['max-import-time']) {
  thresholds.maxImportTime = parseValue(values['max-import-time'])
}
if (values['max-bundle-size-gzip']) {
  thresholds.maxBundleSizeGzip = parseValue(values['max-bundle-size-gzip'])
}
if (values['max-bundle-size-raw']) {
  thresholds.maxBundleSizeRaw = parseValue(values['max-bundle-size-raw'])
}
if (values['max-internal-size-gzip']) {
  thresholds.maxInternalSizeGzip = parseValue(values['max-internal-size-gzip'])
}
if (values['max-internal-size-raw']) {
  thresholds.maxInternalSizeRaw = parseValue(values['max-internal-size-raw'])
}

// If no thresholds configured, nothing to check
if (Object.keys(thresholds).length === 0) {
  process.exit(0)
}

// Validate and evaluate each report
const allViolations: ThresholdViolation[] = []

for (const entry of values.report ?? []) {
  const colonIndex = entry.indexOf(':')
  if (colonIndex === -1) {
    process.stderr.write(`Error: Invalid --report format: "${entry}". Expected <name>:<path>\n`)
    process.exit(2)
  }

  const name = entry.slice(0, colonIndex)
  const filePath = entry.slice(colonIndex + 1)

  if (!name || !filePath) {
    process.stderr.write(`Error: Invalid --report format: "${entry}". Expected <name>:<path>\n`)
    process.exit(2)
  }

  let report: Report
  try {
    const raw = readFileSync(filePath, 'utf-8')
    report = JSON.parse(raw) as Report
  } catch (err) {
    process.stderr.write(`Error: Could not read report file "${filePath}": ${err}\n`)
    process.exit(2)
  }

  const violations = evaluateThresholds(report, thresholds)
  allViolations.push(...violations)
}

if (allViolations.length > 0) {
  const markdown = formatViolationsMarkdown(allViolations)
  process.stdout.write(markdown)
  process.exit(1)
}

process.exit(0)
