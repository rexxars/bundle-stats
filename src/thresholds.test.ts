import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {parseValue, evaluateThresholds, formatViolationsMarkdown} from './thresholds.ts'
import type {ThresholdConfig, ThresholdViolation} from './thresholds.ts'
import type {Report} from './types.ts'

describe('parseValue', () => {
  it('parses byte values', () => {
    assert.equal(parseValue('500b'), 500)
    assert.equal(parseValue('0b'), 0)
  })
  it('parses kilobyte values', () => {
    assert.equal(parseValue('100kb'), 100 * 1024)
    assert.equal(parseValue('1.5kb'), 1.5 * 1024)
  })
  it('parses megabyte values', () => {
    assert.equal(parseValue('1mb'), 1024 * 1024)
    assert.equal(parseValue('2.5mb'), 2.5 * 1024 * 1024)
  })
  it('parses millisecond values', () => {
    assert.equal(parseValue('500ms'), 500)
    assert.equal(parseValue('0ms'), 0)
  })
  it('parses second values', () => {
    assert.equal(parseValue('2s'), 2000)
    assert.equal(parseValue('1.5s'), 1500)
  })
  it('is case-insensitive', () => {
    assert.equal(parseValue('100KB'), 100 * 1024)
    assert.equal(parseValue('500MS'), 500)
    assert.equal(parseValue('1MB'), 1024 * 1024)
  })
  it('trims whitespace', () => {
    assert.equal(parseValue('  100kb  '), 100 * 1024)
  })
  it('throws on invalid input', () => {
    assert.throws(() => parseValue('abc'), /Invalid threshold value/)
    assert.throws(() => parseValue('100'), /Invalid threshold value/)
    assert.throws(() => parseValue('100xyz'), /Invalid threshold value/)
    assert.throws(() => parseValue(''), /Invalid threshold value/)
    assert.throws(() => parseValue('1.2.3kb'), /Invalid threshold value/)
    assert.throws(() => parseValue('0.kb'), /Invalid threshold value/)
  })
})

function makeReport(overrides: Partial<Report['exports'][0]>[] = []): Report {
  const defaults: Report['exports'][0] = {
    name: 'my-pkg',
    key: '.',
    file: '/path/to/index.js',
    internalSize: {rawBytes: 1000, gzipBytes: 500},
    bundledSize: {rawBytes: 5000, gzipBytes: 2000, treemapPath: null},
    importTime: {medianMs: 100, runs: [100], failed: false, error: null},
  }
  return {
    package: 'my-pkg',
    version: '1.0.0',
    timestamp: '2026-01-01T00:00:00Z',
    exports: overrides.length > 0 ? overrides.map((o) => ({...defaults, ...o})) : [{...defaults}],
  }
}

describe('evaluateThresholds', () => {
  it('returns empty when all values are under thresholds', () => {
    const report = makeReport()
    const thresholds: ThresholdConfig = {
      maxImportTime: 200,
      maxBundleSizeGzip: 3000,
      maxBundleSizeRaw: 6000,
      maxInternalSizeGzip: 1000,
      maxInternalSizeRaw: 2000,
    }
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 0)
  })

  it('detects import time violation', () => {
    const report = makeReport([
      {importTime: {medianMs: 300, runs: [300], failed: false, error: null}},
    ])
    const thresholds: ThresholdConfig = {maxImportTime: 200}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].metric, 'Import Time')
    assert.equal(violations[0].value, 300)
    assert.equal(violations[0].threshold, 200)
  })

  it('detects bundle size gzip violation', () => {
    const report = makeReport([{bundledSize: {rawBytes: 5000, gzipBytes: 4000, treemapPath: null}}])
    const thresholds: ThresholdConfig = {maxBundleSizeGzip: 3000}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].metric, 'Bundle Size (gzip)')
    assert.equal(violations[0].value, 4000)
    assert.equal(violations[0].threshold, 3000)
  })

  it('detects bundle size raw violation', () => {
    const report = makeReport([{bundledSize: {rawBytes: 8000, gzipBytes: 2000, treemapPath: null}}])
    const thresholds: ThresholdConfig = {maxBundleSizeRaw: 6000}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].metric, 'Bundle Size (raw)')
    assert.equal(violations[0].value, 8000)
    assert.equal(violations[0].threshold, 6000)
  })

  it('detects internal size gzip violation', () => {
    const report = makeReport([{internalSize: {rawBytes: 1000, gzipBytes: 800}}])
    const thresholds: ThresholdConfig = {maxInternalSizeGzip: 600}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].metric, 'Internal Size (gzip)')
    assert.equal(violations[0].value, 800)
    assert.equal(violations[0].threshold, 600)
  })

  it('detects internal size raw violation', () => {
    const report = makeReport([{internalSize: {rawBytes: 3000, gzipBytes: 500}}])
    const thresholds: ThresholdConfig = {maxInternalSizeRaw: 2000}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].metric, 'Internal Size (raw)')
    assert.equal(violations[0].value, 3000)
    assert.equal(violations[0].threshold, 2000)
  })

  it('detects multiple violations across exports', () => {
    const report = makeReport([
      {
        name: 'export-a',
        importTime: {medianMs: 300, runs: [300], failed: false, error: null},
        bundledSize: {rawBytes: 8000, gzipBytes: 4000, treemapPath: null},
      },
      {
        name: 'export-b',
        importTime: {medianMs: 50, runs: [50], failed: false, error: null},
        bundledSize: {rawBytes: 2000, gzipBytes: 1000, treemapPath: null},
      },
    ])
    const thresholds: ThresholdConfig = {maxImportTime: 200, maxBundleSizeGzip: 3000}
    const violations = evaluateThresholds(report, thresholds)
    // export-a violates both, export-b violates neither
    assert.equal(violations.length, 2)
    assert.equal(violations[0].exportName, 'export-a')
    assert.equal(violations[1].exportName, 'export-a')
  })

  it('skips null measurements', () => {
    const report = makeReport([{bundledSize: null, importTime: null, internalSize: null}])
    const thresholds: ThresholdConfig = {
      maxImportTime: 100,
      maxBundleSizeGzip: 100,
      maxBundleSizeRaw: 100,
      maxInternalSizeGzip: 100,
      maxInternalSizeRaw: 100,
    }
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 0)
  })

  it('skips failed import times', () => {
    const report = makeReport([
      {importTime: {medianMs: 9999, runs: [], failed: true, error: 'timeout'}},
    ])
    const thresholds: ThresholdConfig = {maxImportTime: 100}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 0)
  })

  it('does not violate when value equals threshold exactly', () => {
    const report = makeReport([
      {importTime: {medianMs: 200, runs: [200], failed: false, error: null}},
    ])
    const thresholds: ThresholdConfig = {maxImportTime: 200}
    const violations = evaluateThresholds(report, thresholds)
    assert.equal(violations.length, 0)
  })

  it('returns empty for empty thresholds', () => {
    const report = makeReport()
    const violations = evaluateThresholds(report, {})
    assert.equal(violations.length, 0)
  })
})

describe('formatViolationsMarkdown', () => {
  it('returns empty string for no violations', () => {
    assert.equal(formatViolationsMarkdown([]), '')
  })

  it('formats a single violation', () => {
    const violations: ThresholdViolation[] = [
      {
        exportName: 'my-pkg',
        metric: 'Import Time',
        value: 300,
        threshold: 200,
        formattedValue: '300ms',
        formattedThreshold: '200ms',
      },
    ]
    const md = formatViolationsMarkdown(violations)
    assert.ok(md.includes('### Threshold Violations'))
    assert.ok(md.includes('| `my-pkg` | Import Time | 300ms | 200ms |'))
    assert.ok(md.includes('**1 threshold violation(s)'))
  })

  it('formats multiple violations with correct count', () => {
    const violations: ThresholdViolation[] = [
      {
        exportName: 'export-a',
        metric: 'Import Time',
        value: 300,
        threshold: 200,
        formattedValue: '300ms',
        formattedThreshold: '200ms',
      },
      {
        exportName: 'export-a',
        metric: 'Bundle Size (gzip)',
        value: 4000,
        threshold: 3000,
        formattedValue: '3.9 KB',
        formattedThreshold: '2.9 KB',
      },
      {
        exportName: 'export-b',
        metric: 'Internal Size (raw)',
        value: 3000,
        threshold: 2000,
        formattedValue: '2.9 KB',
        formattedThreshold: '2.0 KB',
      },
    ]
    const md = formatViolationsMarkdown(violations)
    assert.ok(md.includes('**3 threshold violation(s)'))
    assert.ok(md.includes('| `export-a` | Import Time | 300ms | 200ms |'))
    assert.ok(md.includes('| `export-a` | Bundle Size (gzip) | 3.9 KB | 2.9 KB |'))
    assert.ok(md.includes('| `export-b` | Internal Size (raw) | 2.9 KB | 2.0 KB |'))
  })

  it('includes the table header', () => {
    const violations: ThresholdViolation[] = [
      {
        exportName: 'pkg',
        metric: 'Import Time',
        value: 300,
        threshold: 200,
        formattedValue: '300ms',
        formattedThreshold: '200ms',
      },
    ]
    const md = formatViolationsMarkdown(violations)
    assert.ok(md.includes('| Export | Metric | Value | Threshold |'))
    assert.ok(md.includes('| :----- | :----- | ----: | --------: |'))
  })

  it('includes failure message', () => {
    const violations: ThresholdViolation[] = [
      {
        exportName: 'pkg',
        metric: 'Import Time',
        value: 300,
        threshold: 200,
        formattedValue: '300ms',
        formattedThreshold: '200ms',
      },
    ]
    const md = formatViolationsMarkdown(violations)
    assert.ok(md.includes('this check has failed'))
  })
})
