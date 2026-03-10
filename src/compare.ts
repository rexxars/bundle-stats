import type {Report, ComparisonReport, ExportDelta, DeltaValue} from './types.ts'

/**
 * Build a compound lookup key from export key + optional condition.
 * When conditions are present (e.g. two entries for "." with "node" and "default"),
 * this ensures they are matched separately in the comparison.
 */
export function comparisonKey(exp: {key: string; condition?: string}): string {
  return exp.condition ? `${exp.key}::${exp.condition}` : exp.key
}

export function compareReports(current: Report, baseline: Report): ComparisonReport {
  const baselineByKey = new Map(baseline.exports.map((e) => [comparisonKey(e), e]))
  const currentByKey = new Map(current.exports.map((e) => [comparisonKey(e), e]))

  const deltas: ExportDelta[] = []

  // Process all current exports
  for (const curr of current.exports) {
    const base = baselineByKey.get(comparisonKey(curr))

    if (!base) {
      deltas.push({
        name: curr.name,
        key: curr.key,
        condition: curr.condition,
        internalSize: null,
        internalRawSize: null,
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
      condition: curr.condition,
      internalSize: makeDelta(base.internalSize?.gzipBytes, curr.internalSize?.gzipBytes),
      internalRawSize: makeDelta(base.internalSize?.rawBytes, curr.internalSize?.rawBytes),
      bundledRawSize: makeDelta(base.bundledSize?.rawBytes, curr.bundledSize?.rawBytes),
      bundledSize: makeDelta(base.bundledSize?.gzipBytes, curr.bundledSize?.gzipBytes),
      importTime: makeDelta(base.importTime?.medianMs, curr.importTime?.medianMs),
      status: 'changed',
    })
  }

  // Find removed exports
  for (const base of baseline.exports) {
    if (!currentByKey.has(comparisonKey(base))) {
      deltas.push({
        name: base.name,
        key: base.key,
        condition: base.condition,
        internalSize: null,
        internalRawSize: null,
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
