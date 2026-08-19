import type {
  ChangeSignificance,
  ComparisonReport,
  DeltaValue,
  Report,
  ResolvedSignificanceConfig,
  ScenarioComparison,
  ScenarioResult,
} from './types.ts'

export function compareReports(current: Report, baseline: Report): ComparisonReport {
  assertCompatibleReport(current, 'current')
  assertCompatibleReport(baseline, 'baseline')

  const currentScenarios = flattenScenarios(current)
  const baselineScenarios = flattenScenarios(baseline)
  const allKeys = new Set([...currentScenarios.keys(), ...baselineScenarios.keys()])
  const changes: ScenarioComparison[] = []

  for (const key of allKeys) {
    const currentEntry = currentScenarios.get(key)
    const baselineEntry = baselineScenarios.get(key)
    if (currentEntry && baselineEntry) {
      if (isUnavailableConsumerEntry(baselineEntry.result) && !hasErrors(currentEntry.result)) {
        changes.push(changeForAddedScenario(currentEntry.packageName, currentEntry.result))
        continue
      }
      changes.push(
        compareScenario(
          currentEntry.packageName,
          currentEntry.result,
          baselineEntry.result,
          current.config.significance,
        ),
      )
      continue
    }
    if (currentEntry) {
      changes.push(changeForAddedScenario(currentEntry.packageName, currentEntry.result))
      continue
    }
    if (baselineEntry) {
      changes.push(changeForRemovedScenario(baselineEntry.packageName, baselineEntry.result))
    }
  }

  changes.sort((left, right) => {
    const packageOrder = left.packageName.localeCompare(right.packageName)
    return packageOrder === 0 ? left.name.localeCompare(right.name) : packageOrder
  })

  return {
    schemaVersion: 2,
    current,
    baseline,
    changes,
    summary: {
      increases: changes.filter((change) => change.significance === 'increase').length,
      decreases: changes.filter((change) => change.significance === 'decrease').length,
      insignificant: changes.filter((change) => change.significance === 'insignificant').length,
      added: changes.filter((change) => change.status === 'added').length,
      removed: changes.filter((change) => change.status === 'removed').length,
      errors: current.packages
        .flatMap((pkg) => pkg.scenarios)
        .filter((result) =>
          result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
        ).length,
      inputChanged: changes.filter((change) => change.significance === 'input-changed').length,
    },
  }
}

function comparisonKey(packageName: string, scenarioId: string): string {
  return `${packageName}\0${scenarioId}`
}

function compareScenario(
  packageName: string,
  current: ScenarioResult,
  baseline: ScenarioResult,
  significanceConfig: ResolvedSignificanceConfig,
): ScenarioComparison {
  const rawSize = delta(current.bundle?.rawBytes, baseline.bundle?.rawBytes)
  const gzipSize = delta(current.bundle?.gzipBytes, baseline.bundle?.gzipBytes)
  const importTime = delta(current.importTime?.medianMs, baseline.importTime?.medianMs)
  const significance = classifyChange(current, baseline, gzipSize, importTime, significanceConfig)

  return {
    packageName,
    id: current.scenario.id,
    name: current.scenario.name,
    kind: current.scenario.kind,
    status: 'changed',
    rawSize,
    gzipSize,
    importTime,
    significance,
    current,
    baseline,
  }
}

function classifyChange(
  current: ScenarioResult,
  baseline: ScenarioResult,
  gzipSize: DeltaValue | null,
  importTime: DeltaValue | null,
  config: ResolvedSignificanceConfig,
): ChangeSignificance {
  if (hasErrors(current) || hasErrors(baseline)) return 'not-comparable'
  if (
    current.scenario.kind === 'consumer' &&
    current.scenario.inputHash !== baseline.scenario.inputHash
  ) {
    return 'input-changed'
  }

  const significantBundle = isSignificant(gzipSize, config.bundle.bytes, config.bundle.percent)
  const significantImport = isSignificant(
    importTime,
    config.importTime.milliseconds,
    config.importTime.percent,
  )
  const significantDeltas = [significantBundle, significantImport].filter(
    (value): value is DeltaValue => value !== null,
  )
  if (significantDeltas.some((value) => value.delta > 0)) return 'increase'
  if (significantDeltas.some((value) => value.delta < 0)) return 'decrease'
  return 'insignificant'
}

function isSignificant(
  value: DeltaValue | null,
  minimumAbsolute: number,
  minimumPercent: number,
): DeltaValue | null {
  if (value === null) return null
  if (Math.abs(value.delta) < minimumAbsolute) return null
  if (Math.abs(value.percent) < minimumPercent) return null
  return value
}

function changeForAddedScenario(packageName: string, current: ScenarioResult): ScenarioComparison {
  return {
    packageName,
    id: current.scenario.id,
    name: current.scenario.name,
    kind: current.scenario.kind,
    status: 'added',
    rawSize: null,
    gzipSize: null,
    importTime: null,
    significance: 'not-comparable',
    current,
    baseline: null,
  }
}

function changeForRemovedScenario(
  packageName: string,
  baseline: ScenarioResult,
): ScenarioComparison {
  return {
    packageName,
    id: baseline.scenario.id,
    name: baseline.scenario.name,
    kind: baseline.scenario.kind,
    status: 'removed',
    rawSize: null,
    gzipSize: null,
    importTime: null,
    significance: 'not-comparable',
    current: null,
    baseline,
  }
}

function delta(after: number | undefined, before: number | undefined): DeltaValue | null {
  if (after === undefined || before === undefined) return null
  const difference = after - before
  const percent = before === 0 ? (after === 0 ? 0 : 100) : (difference / before) * 100
  return {before, after, delta: difference, percent}
}

function flattenScenarios(
  report: Report,
): Map<string, {packageName: string; result: ScenarioResult}> {
  const scenarios = new Map<string, {packageName: string; result: ScenarioResult}>()
  for (const pkg of report.packages) {
    for (const result of pkg.scenarios) {
      scenarios.set(comparisonKey(pkg.name, result.scenario.id), {packageName: pkg.name, result})
    }
  }
  return scenarios
}

function hasErrors(result: ScenarioResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

function isUnavailableConsumerEntry(result: ScenarioResult): boolean {
  return (
    result.scenario.kind === 'consumer' &&
    result.scenario.inputHash === null &&
    result.diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error' && diagnostic.phase === 'discovery',
    )
  )
}

function assertCompatibleReport(report: Report, label: string): void {
  if (report.schemaVersion !== 2) {
    throw new Error(`The ${label} report is not a bundle-stats v2 report`)
  }
}
