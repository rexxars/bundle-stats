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

    it('includes table header', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('| Export | Internal bytes | Total bytes (bundled) | Import Time |'))
      assert.ok(md.includes('| :----- | -------------: | --------------------: | ----------: |'))
    })

    it('renders export row with sizes and import time', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('| `my-pkg` |'))
      assert.ok(md.includes('1000&nbsp;B&nbsp;/&nbsp;500&nbsp;B&nbsp;🗜️'))
      assert.ok(md.includes('4.9&nbsp;KB&nbsp;/&nbsp;2.0&nbsp;KB&nbsp;🗜️'))
      assert.ok(md.includes('100ms'))
    })

    it('renders dash for null internal size', () => {
      const md = formatMarkdown(makeReport({exports: [makeExport({internalSize: null})]}))
      assert.match(md, /\| `my-pkg` \| - \|/)
    })

    it('renders dash for null bundled size', () => {
      const md = formatMarkdown(makeReport({exports: [makeExport({bundledSize: null})]}))
      assert.match(md, /- \| 100ms \|/)
    })

    it('renders dash for null import time', () => {
      const md = formatMarkdown(makeReport({exports: [makeExport({importTime: null})]}))
      assert.match(md, /\| - \|\n/)
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
      assert.ok(md.includes('| ❌ |'))
    })

    it('renders multiple exports as separate rows', () => {
      const report = makeReport({
        exports: [
          makeExport({name: 'my-pkg', key: '.'}),
          makeExport({name: 'my-pkg/utils', key: './utils'}),
        ],
      })
      const md = formatMarkdown(report)
      assert.ok(md.includes('`my-pkg`'))
      assert.ok(md.includes('`my-pkg/utils`'))
    })

    it('includes footer note', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(md.includes('_Sizes shown as raw / gzip'))
    })

    it('does not include comparison header when no comparison', () => {
      const md = formatMarkdown(makeReport())
      assert.ok(!md.includes('Compared against'))
    })
  })

  describe('CI mode', () => {
    it('does not include HTML comment marker (managed by action/comment.sh)', () => {
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

    it('shows colored delta for size regression (red)', () => {
      const delta = makeDelta({
        internalSize: {before: 500, after: 600, delta: 100, percent: 20},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="red">'))
      assert.ok(md.includes('+100&nbsp;B,&nbsp;+20.0%'))
    })

    it('shows colored delta for size improvement (green)', () => {
      const delta = makeDelta({
        internalSize: {before: 600, after: 500, delta: -100, percent: -16.7},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="green">'))
      assert.ok(md.includes('-100&nbsp;B,&nbsp;-16.7%'))
    })

    it('shows "vs `label`:" prefix on comparison lines', () => {
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('vs&nbsp;`main`:&nbsp;'))
    })

    it('shows import time delta', () => {
      const delta = makeDelta({
        importTime: {before: 100, after: 120, delta: 20, percent: 20},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('100ms'))
      assert.ok(md.includes('+20ms,&nbsp;+20.0%'))
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
      assert.ok(md.includes('⚠️'))
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
      // ⚠️ appears in the details footer, so check it's not in the table row
      const tableRow = md.split('\n').find((line) => line.startsWith('| `my-pkg`'))
      assert.ok(tableRow, 'expected a table row')
      assert.ok(!tableRow.includes('⚠️'))
    })

    it('shows removed exports', () => {
      const delta = makeDelta({name: 'old-export', status: 'removed'})
      const comp = makeComparison({deltas: [delta]})
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('🗑️ ~~old-export~~'))
    })

    it('shows added exports with new badge', () => {
      const exp = makeExport({name: 'new-export', key: './new'})
      const delta = makeDelta({name: 'new-export', key: './new', status: 'added'})
      const comp = makeComparison({deltas: [delta]})
      const md = formatMarkdown(makeReport({exports: [exp]}), comp)
      assert.ok(md.includes('🆕 `new-export`'))
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

    it('shows deltas against npm version', () => {
      const delta = makeDelta({
        internalSize: {before: 600, after: 500, delta: -100, percent: -16.7},
      })
      const npmComp = makeComparison({
        baseline: makeReport({version: '1.2.3'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), undefined, {npmComparison: npmComp})
      assert.ok(md.includes('vs&nbsp;`v1.2.3`'))
      assert.ok(md.includes('-100&nbsp;B'))
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

    it('shows git delta on first comparison line and npm delta on second', () => {
      const gitDelta = makeDelta({
        internalSize: {before: 500, after: 600, delta: 100, percent: 20},
      })
      const npmDelta = makeDelta({
        internalSize: {before: 700, after: 500, delta: -200, percent: -28.6},
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
      // Git comparison line
      assert.ok(md.includes('vs&nbsp;`main`:'))
      // Npm comparison line
      assert.ok(md.includes('vs&nbsp;`v1.0.0`:'))
    })

    it('shows 🆕 for export added since npm version', () => {
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
      assert.ok(md.includes('vs&nbsp;`v1.0.0`:&nbsp;🆕'))
    })

    it('omits npm delta line when delta is zero', () => {
      const gitDelta = makeDelta()
      const npmDelta = makeDelta({
        internalSize: {before: 500, after: 500, delta: 0, percent: 0},
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
      // v1.0.0 appears in the header, but should NOT appear in table rows
      const tableRow = md.split('\n').find((line) => line.startsWith('| `my-pkg`'))
      assert.ok(tableRow, 'expected a table row')
      assert.ok(!tableRow.includes('v1.0.0'))
    })
  })

  describe('colorDelta via output', () => {
    it('uses <font color="red"> for regressions', () => {
      const delta = makeDelta({
        internalSize: {before: 500, after: 600, delta: 100, percent: 20},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="red">+100&nbsp;B,&nbsp;+20.0%</font>'))
    })

    it('uses <font color="green"> for improvements', () => {
      const delta = makeDelta({
        internalSize: {before: 600, after: 500, delta: -100, percent: -16.7},
      })
      const comp = makeComparison({
        baseline: makeReport({refLabel: 'main'}),
        deltas: [delta],
      })
      const md = formatMarkdown(makeReport(), comp)
      assert.ok(md.includes('<font color="green">-100&nbsp;B,&nbsp;-16.7%</font>'))
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
