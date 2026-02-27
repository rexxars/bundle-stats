import type {Report, ComparisonReport, ExportDelta, DeltaValue} from './types.ts'

export function compareReports(current: Report, baseline: Report): ComparisonReport {
  const baselineByKey = new Map(baseline.exports.map((e) => [e.key, e]))
  const currentByKey = new Map(current.exports.map((e) => [e.key, e]))

  const deltas: ExportDelta[] = []

  // Process all current exports
  for (const curr of current.exports) {
    const base = baselineByKey.get(curr.key)

    if (!base) {
      deltas.push({
        name: curr.name,
        key: curr.key,
        internalSize: null,
        bundledRawSize: null,
        bundledSize: null,
        importTime: null,
        status: 'added',
      })
      continue
    }

    deltas.push({
      name: curr.name,
      key: curr.key,
      internalSize: makeDelta(base.internalSize?.gzipBytes, curr.internalSize?.gzipBytes),
      bundledRawSize: makeDelta(base.bundledSize?.rawBytes, curr.bundledSize?.rawBytes),
      bundledSize: makeDelta(base.bundledSize?.gzipBytes, curr.bundledSize?.gzipBytes),
      importTime: makeDelta(base.importTime?.medianMs, curr.importTime?.medianMs),
      status: 'changed',
    })
  }

  // Find removed exports
  for (const base of baseline.exports) {
    if (!currentByKey.has(base.key)) {
      deltas.push({
        name: base.name,
        key: base.key,
        internalSize: null,
        bundledRawSize: null,
        bundledSize: null,
        importTime: null,
        status: 'removed',
      })
    }
  }

  return {current, baseline, deltas}
}

function makeDelta(
  before: number | undefined | null,
  after: number | undefined | null,
): DeltaValue | null {
  if (before == null || after == null) return null
  const delta = after - before
  const percent = before === 0 ? 0 : (delta / before) * 100
  return {before, after, delta, percent}
}
