import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {compareReports, comparisonKey} from './compare.ts'
import type {ExportReport, Report} from './types.ts'

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

// -- Tests --------------------------------------------------------------------

describe('comparisonKey', () => {
  it('returns bare key when no condition', () => {
    assert.equal(comparisonKey({key: '.'}), '.')
  })

  it('returns key::condition when condition is present', () => {
    assert.equal(comparisonKey({key: '.', condition: 'node'}), '.::node')
  })

  it('returns bare key when condition is undefined', () => {
    assert.equal(comparisonKey({key: './utils', condition: undefined}), './utils')
  })
})

describe('compareReports', () => {
  it('matches conditioned exports by key and condition', () => {
    const baseline = makeReport({
      exports: [
        makeExport({
          key: '.',
          condition: 'node',
          name: 'my-pkg [node]',
          internalSize: {rawBytes: 1000, gzipBytes: 500},
        }),
        makeExport({
          key: '.',
          condition: 'default',
          name: 'my-pkg [default]',
          internalSize: {rawBytes: 2000, gzipBytes: 900},
        }),
      ],
    })
    const current = makeReport({
      exports: [
        makeExport({
          key: '.',
          condition: 'node',
          name: 'my-pkg [node]',
          internalSize: {rawBytes: 1100, gzipBytes: 550},
        }),
        makeExport({
          key: '.',
          condition: 'default',
          name: 'my-pkg [default]',
          internalSize: {rawBytes: 2000, gzipBytes: 900},
        }),
      ],
    })

    const {deltas} = compareReports(current, baseline)
    assert.equal(deltas.length, 2)

    // Node condition should show a delta
    const nodeDelta = deltas.find((d) => d.condition === 'node')
    if (!nodeDelta) throw new Error('expected node delta')
    assert.equal(nodeDelta.status, 'changed')
    assert.equal(nodeDelta.internalSize?.before, 500)
    assert.equal(nodeDelta.internalSize?.after, 550)
    assert.equal(nodeDelta.internalSize?.delta, 50)

    // Default condition should show zero delta
    const defaultDelta = deltas.find((d) => d.condition === 'default')
    if (!defaultDelta) throw new Error('expected default delta')
    assert.equal(defaultDelta.status, 'changed')
    assert.equal(defaultDelta.internalSize?.delta, 0)
  })

  it('detects added conditioned export', () => {
    const baseline = makeReport({
      exports: [makeExport({key: '.', condition: 'node', name: 'my-pkg [node]'})],
    })
    const current = makeReport({
      exports: [
        makeExport({key: '.', condition: 'node', name: 'my-pkg [node]'}),
        makeExport({key: '.', condition: 'default', name: 'my-pkg [default]'}),
      ],
    })

    const {deltas} = compareReports(current, baseline)
    assert.equal(deltas.length, 2)

    const added = deltas.find((d) => d.condition === 'default')
    if (!added) throw new Error('expected added delta for default condition')
    assert.equal(added.status, 'added')
    assert.equal(added.key, '.')
  })

  it('detects removed conditioned export', () => {
    const baseline = makeReport({
      exports: [
        makeExport({key: '.', condition: 'node', name: 'my-pkg [node]'}),
        makeExport({key: '.', condition: 'default', name: 'my-pkg [default]'}),
      ],
    })
    const current = makeReport({
      exports: [makeExport({key: '.', condition: 'node', name: 'my-pkg [node]'})],
    })

    const {deltas} = compareReports(current, baseline)
    assert.equal(deltas.length, 2)

    const removed = deltas.find((d) => d.condition === 'default')
    if (!removed) throw new Error('expected removed delta for default condition')
    assert.equal(removed.status, 'removed')
    assert.equal(removed.key, '.')
  })

  it('does not cross-match exports with same key but different conditions', () => {
    const baseline = makeReport({
      exports: [
        makeExport({
          key: '.',
          condition: 'node',
          name: 'my-pkg [node]',
          internalSize: {rawBytes: 1000, gzipBytes: 500},
        }),
      ],
    })
    const current = makeReport({
      exports: [
        makeExport({
          key: '.',
          condition: 'default',
          name: 'my-pkg [default]',
          internalSize: {rawBytes: 2000, gzipBytes: 900},
        }),
      ],
    })

    const {deltas} = compareReports(current, baseline)
    assert.equal(deltas.length, 2)

    const added = deltas.find((d) => d.status === 'added')
    if (!added) throw new Error('expected added delta')
    assert.equal(added.condition, 'default')

    const removed = deltas.find((d) => d.status === 'removed')
    if (!removed) throw new Error('expected removed delta')
    assert.equal(removed.condition, 'node')
  })

  it('handles mix of conditioned and unconditioned exports', () => {
    const baseline = makeReport({
      exports: [
        makeExport({key: '.', condition: 'node', name: 'my-pkg [node]'}),
        makeExport({key: './utils', name: 'my-pkg/utils'}),
      ],
    })
    const current = makeReport({
      exports: [
        makeExport({key: '.', condition: 'node', name: 'my-pkg [node]'}),
        makeExport({key: './utils', name: 'my-pkg/utils'}),
      ],
    })

    const {deltas} = compareReports(current, baseline)
    assert.equal(deltas.length, 2)
    assert.ok(deltas.every((d) => d.status === 'changed'))

    const nodeDelta = deltas.find((d) => d.condition === 'node')
    if (!nodeDelta) throw new Error('expected conditioned delta')
    assert.equal(nodeDelta.key, '.')

    const utilsDelta = deltas.find((d) => d.key === './utils')
    if (!utilsDelta) throw new Error('expected utils delta')
    assert.equal(utilsDelta.condition, undefined)
  })
})
