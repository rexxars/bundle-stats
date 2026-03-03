import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {formatMarkdown} from './markdown.ts'
import type {ComparisonReport, ExportDelta, ExportReport, Report} from '../types.ts'

// -- Helpers ------------------------------------------------------------------

function makeExport(overrides: Partial<ExportReport> = {}): ExportReport {
  return {
    name: 'my-pkg',
    key: '.',
    file: '/path/to/index.js',
    internalSize: {rawBytes: 1000, gzipBytes: 500},
    bundledSize: {rawBytes: 5000, gzipBytes: 2000, treemapPath: null},
    importTime: {medianMs: 100, runs: [100], failed: false, error: null},
    ...overrides,
  }
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    package: 'my-pkg',
    version: '1.0.0',
    timestamp: '2026-01-01T00:00:00Z',
    exports: [makeExport()],
    ...overrides,
  }
}

function makeDelta(overrides: Partial<ExportDelta> = {}): ExportDelta {
  return {
    name: 'my-pkg',
    key: '.',
    internalSize: {before: 500, after: 600, delta: 100, percent: 20},
    internalRawSize: {before: 1000, after: 1100, delta: 100, percent: 10},
    bundledRawSize: {before: 5000, after: 5500, delta: 500, percent: 10},
    bundledSize: {before: 2000, after: 2200, delta: 200, percent: 10},
    importTime: {before: 100, after: 120, delta: 20, percent: 20},
    status: 'changed',
    ...overrides,
  }
}

function makeComparison(overrides: Partial<ComparisonReport> = {}): ComparisonReport {
  return {
    current: makeReport(),
    baseline: makeReport({version: '0.9.0', timestamp: '2025-12-01T00:00:00Z'}),
    deltas: [makeDelta()],
    ...overrides,
  }
}

// -- Tests --------------------------------------------------------------------

describe('formatMarkdown', () => {
  describe('basic report (no comparison)', () => {
    it('includes heading with package name', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('## 📦 Bundle Stats — `my-pkg`'))
    })

    it('does not include export sub-heading for single export', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(!md.includes('### '))
    })

    it('includes export sub-headings for multiple exports', () => {
      const report = makeReport({
        exports: [
          makeExport({name: 'my-pkg', key: '.'}),
          makeExport({name: 'my-pkg/utils', key: './utils'}),
        ],
      })
      const md = formatMarkdown(report)
      assert.ok(md.includes('### `my-pkg`'))
      assert.ok(md.includes('### `my-pkg/utils`'))
    })

    it('renders metric rows table with Metric and Value columns', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('| Metric | Value |'))
    })

    it('renders separate rows for internal raw and gzip', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('| Internal (raw) | 1000&nbsp;B |'))
      assert.ok(md.includes('| Internal (gzip) | 500&nbsp;B |'))
    })

    it('renders separate rows for bundled raw and gzip', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('| Bundled (raw) | 4.9&nbsp;KB |'))
      assert.ok(md.includes('| Bundled (gzip) | 2.0&nbsp;KB |'))
    })

    it('renders import time row', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('| Import time | 100ms |'))
    })

    it('omits internal rows when internalSize is null', () => {
      const md = formatMarkdown(makeReport({exports: [makeExport({internalSize: null})]}))
      assert.ok(!md.includes('Internal (raw)'))
      assert.ok(!md.includes('Internal (gzip)'))
    })

    it('omits bundled rows when bundledSize is null', () => {
      const md = formatMarkdown(makeReport({exports: [makeExport({bundledSize: null})]}))
      assert.ok(!md.includes('Bundled (raw)'))
      assert.ok(!md.includes('Bundled (gzip)'))
    })

    it('omits import time row when importTime is null', () => {
      const md = formatMarkdown(makeReport({exports: [makeExport({importTime: null})]}))
      const tableRows = md.split('\n').filter((line) => line.startsWith('|'))
      const importRow = tableRows.find((line) => line.includes('Import time'))
      assert.equal(importRow, undefined)
    })

    it('renders failed import time with error', () => {
      const exp = makeExport({
        importTime: {medianMs: 0, runs: [], failed: true, error: 'timeout'},
      })
      const md = formatMarkdown(makeReport({exports: [exp]}))
      assert.ok(md.includes('❌ timeout'))
    })

    it('renders failed import time without error', () => {
      const exp = makeExport({
        importTime: {medianMs: 0, runs: [], failed: true, error: null},
      })
      const md = formatMarkdown(makeReport({exports: [exp]}))
      assert.ok(md.includes('| Import time | ❌ |'))
    })

    it('does not include comparison header when no comparison', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(!md.includes('Compared against'))
    })

    it('includes footer note', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('_Sizes shown as raw / gzip'))
    })
  })

  describe('CI mode', () => {
    it('does not include HTML comment marker', () => {
      const md = formatMarkdown(makeReport(), undefined, {ci: true})
      assert.ok(!md.includes('<!-- bundle-stats-comment -->'))
    })

    it('includes treemap note in footer', () => {
      const md = formatMarkdown(makeReport(), undefined, {ci: true})
      assert.ok(md.includes('Treemap artifacts are attached'))
    })
  })

  describe('git comparison', () => {
    it('shows comparison header with ref label', () => {
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main (abc123)', version: '0.9.0'}),
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('Compared against `main (abc123)`'))
    })

    it('shows comparison header with version and date when no ref label', () => {
      const comp = makeComparison({
        baseline: makeReport({version: '0.9.0', timestamp: '2025-12-01T00:00:00Z'}),
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('Compared against `0.9.0` (2025-12-01)'))
    })

    it('has comparison column in table header', () => {
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('| vs main |'))
    })

    it('shows colored delta for size regression (red) in delta column', () => {
      const delta = makeDelta({
        internalRawSize: {before: 1000, after: 1100, delta: 100, percent: 10},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="red">'))
    })

    it('shows colored delta for size improvement (green) in delta column', () => {
      const delta = makeDelta({
        internalRawSize: {before: 1100, after: 1000, delta: -100, percent: -9.1},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="green">'))
    })

    it('shows import time delta in its own row', () => {
      const delta = makeDelta({
        importTime: {before: 100, after: 120, delta: 20, percent: 20},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      // Import time row should contain the delta
      const importRow = md.split('\n').find((line) => line.includes('Import time'))
      assert.ok(importRow, 'expected an import time row')
      assert.ok(importRow.includes('+20ms,&nbsp;+20.0%'))
    })

    it('flags import time regression over threshold with warning', () => {
      const delta = makeDelta({
        importTime: {before: 100, after: 150, delta: 50, percent: 50},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      const importRow = md.split('\n').find((line) => line.includes('Import time'))
      assert.ok(importRow, 'expected an import time row')
      assert.ok(importRow.includes('⚠️'))
    })

    it('does not flag import time regression under threshold', () => {
      const delta = makeDelta({
        importTime: {before: 100, after: 105, delta: 5, percent: 5},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      const importRow = md.split('\n').find((line) => line.includes('Import time'))
      assert.ok(importRow, 'expected an import time row')
      assert.ok(!importRow.includes('⚠️'))
    })

    it('shows removed exports as strikethrough line (no table)', () => {
      const delta = makeDelta({name: 'old-export', key: './old', status: 'removed'})
      const comp = makeComparison({deltas: [delta]})
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('🗑️ ~~old-export~~'))
      // No table row for removed export
      assert.ok(!md.includes('| old-export'))
    })

    it('shows added exports with new badge, delta columns show -', () => {
      const exp = makeExport({name: 'new-export', key: './new'})
      const delta = makeDelta({name: 'new-export', key: './new', status: 'added'})
      const comp = makeComparison({deltas: [delta]})
      const report = makeReport({exports: [makeExport(), exp]})
      const md = formatMarkdown(report, comp)
      assert.ok(md.includes('🆕 `new-export`'))
      // Find metric rows under the new-export section — delta column should be "-"
      const lines = md.split('\n')
      const newExportHeadingIdx = lines.findIndex((l) => l.includes('🆕 `new-export`'))
      assert.ok(newExportHeadingIdx >= 0, 'expected new-export heading')
      // Check a metric row after the heading has "-" in delta column
      const metricRowAfterHeading = lines
        .slice(newExportHeadingIdx)
        .find((l) => l.includes('Internal (raw)'))
      assert.ok(metricRowAfterHeading, 'expected internal raw row for new export')
      assert.ok(metricRowAfterHeading.includes('| - |'))
    })

    it('includes details section with comparison', () => {
      const comp = makeComparison()
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<details>'))
      assert.ok(md.includes('<summary>Details</summary>'))
      assert.ok(md.includes('Import time regressions over 10% are flagged'))
    })

    it('includes treemap note in details when ci', () => {
      const comp = makeComparison()
      const md = formatMarkdown(makeReport(), comp, {ci: true})
      assert.ok(md.includes('Treemap artifacts are attached'))
    })
  })

  describe('npm comparison (promoted to primary)', () => {
    it('shows npm comparison header with v-prefixed version', () => {
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.2.3'}),
      })
      const md = formatMarkdown(makeReport(), undefined, {npmComparison: npmComp})
      assert.ok(md.includes('Compared against `v1.2.3` (npm)'))
    })

    it('does not double-prefix version already starting with v', () => {
      const npmComp = makeComparison({
        baseline: makeReport({version: 'v1.2.3'}),
      })
      const md = formatMarkdown(makeReport(), undefined, {npmComparison: npmComp})
      assert.ok(md.includes('`v1.2.3`'))
      assert.ok(!md.includes('`vv1.2.3`'))
    })

    it('has comparison column with npm version label', () => {
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.2.3'}),
      })
      const md = formatMarkdown(makeReport(), undefined, {npmComparison: npmComp})
      assert.ok(md.includes('| vs v1.2.3 |'))
    })

    it('shows deltas against npm version', () => {
      const delta = makeDelta({
        internalRawSize: {before: 1100, after: 1000, delta: -100, percent: -9.1},
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.2.3'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), undefined, {npmComparison: npmComp})
      const internalRawRow = md.split('\n').find((line) => line.includes('Internal (raw)'))
      assert.ok(internalRawRow, 'expected an internal raw row')
      assert.ok(internalRawRow.includes('-100&nbsp;B'))
    })
  })

  describe('dual comparison (git + npm)', () => {
    it('shows both baselines in comparison header', () => {
      const gitComp = makeComparison({
        baseline: makeReport({refLabel: 'main (abc123)'}),
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.0.0'}),
      })
      const md = formatMarkdown(makeReport(), gitComp, {npmComparison: npmComp})
      assert.ok(md.includes('`main (abc123)`'))
      assert.ok(md.includes('`v1.0.0` (npm)'))
    })

    it('has both comparison columns in table header', () => {
      const gitComp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.0.0'}),
      })
      const md = formatMarkdown(makeReport(), gitComp, {npmComparison: npmComp})
      const headerLine = md.split('\n').find((line) => line.includes('Metric'))
      assert.ok(headerLine, 'expected header line')
      assert.ok(headerLine.includes('vs main'))
      assert.ok(headerLine.includes('vs v1.0.0'))
    })

    it('shows git delta in first comparison column and npm delta in second', () => {
      const gitDelta = makeDelta({
        internalRawSize: {before: 1000, after: 1100, delta: 100, percent: 10},
      })
      const npmDelta = makeDelta({
        internalRawSize: {before: 1200, after: 1000, delta: -200, percent: -16.7},
      })
      const gitComp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [gitDelta],
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.0.0'}),
        deltas: [npmDelta],
      })
      const md = formatMarkdown(makeReport(), gitComp, {npmComparison: npmComp})
      const internalRawRow = md.split('\n').find((line) => line.includes('Internal (raw)'))
      assert.ok(internalRawRow, 'expected an internal raw row')
      // Git delta (regression)
      assert.ok(internalRawRow.includes('<font color="red">+100&nbsp;B'))
      // Npm delta (improvement)
      assert.ok(internalRawRow.includes('<font color="green">-200&nbsp;B'))
    })

    it('shows new in npm column for export added since npm version', () => {
      const gitDelta = makeDelta({status: 'changed'})
      const npmDelta = makeDelta({status: 'added'})
      const gitComp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [gitDelta],
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.0.0'}),
        deltas: [npmDelta],
      })
      const md = formatMarkdown(makeReport(), gitComp, {npmComparison: npmComp})
      // The npm delta column should show "-" for added exports
      const internalRawRow = md.split('\n').find((line) => line.includes('Internal (raw)'))
      assert.ok(internalRawRow, 'expected an internal raw row')
      // In dual mode, the npm column should show "-" for 'added' status
      // The row format is: | metric | value | git delta | npm delta |
      const cells = internalRawRow
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      // cells[3] is the npm delta column
      assert.equal(cells[3], '-')
    })

    it('shows - in npm column cells when npm delta is zero', () => {
      const gitDelta = makeDelta()
      const npmDelta = makeDelta({
        internalSize: {before: 500, after: 500, delta: 0, percent: 0},
        internalRawSize: {before: 1000, after: 1000, delta: 0, percent: 0},
        bundledRawSize: {before: 5000, after: 5000, delta: 0, percent: 0},
        bundledSize: {before: 2000, after: 2000, delta: 0, percent: 0},
        importTime: {before: 100, after: 100, delta: 0, percent: 0},
      })
      const gitComp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [gitDelta],
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.0.0'}),
        deltas: [npmDelta],
      })
      const md = formatMarkdown(makeReport(), gitComp, {npmComparison: npmComp})
      // Check each metric row has "-" in npm column
      const tableRows = md.split('\n').filter((line) => line.startsWith('|'))
      const metricRows = tableRows.filter(
        (line) =>
          line.includes('Internal (raw)') ||
          line.includes('Internal (gzip)') ||
          line.includes('Bundled (raw)') ||
          line.includes('Bundled (gzip)') ||
          line.includes('Import time'),
      )
      for (const row of metricRows) {
        const cells = row
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
        // cells[3] is the npm delta column
        assert.equal(cells[3], '-', `expected "-" in npm column for row: ${row}`)
      }
    })
  })

  describe('colorDelta via output', () => {
    it('uses <font color="red"> for regressions', () => {
      const delta = makeDelta({
        internalRawSize: {before: 1000, after: 1100, delta: 100, percent: 10},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="red">+100&nbsp;B,&nbsp;+10.0%</font>'))
    })

    it('uses <font color="green"> for improvements', () => {
      const delta = makeDelta({
        internalRawSize: {before: 1100, after: 1000, delta: -100, percent: -9.1},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="green">-100&nbsp;B,&nbsp;-9.1%</font>'))
    })

    it('does not contain LaTeX syntax', () => {
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(!md.includes('\\color'))
      assert.ok(!md.includes('\\text'))
    })
  })
})
