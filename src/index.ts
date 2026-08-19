// @env node

import {resolve} from 'node:path'

import {VERSION} from 'rolldown'

import {compareReports} from './compare.ts'
import {defineConfig, loadConfig, loadResolvedConfig, resolveConfig} from './config.ts'
import {formatCli} from './format/cli.ts'
import {formatJson} from './format/json.ts'
import {formatMarkdown} from './format/markdown.ts'
import {measureBundle} from './measure/bundle.ts'
import {measureImportTime} from './measure/imports.ts'
import {discoverScenarios} from './scenarios.ts'
import type {
  MeasureOptions,
  PackageReport,
  ProgressCallback,
  Report,
  ResolvedBundleStatsConfig,
  ResolvedPackageConfig,
  ScenarioResult,
} from './types.ts'

export type {
  BundlePlatform,
  BundleResult,
  BundleStatsConfig,
  ChangeSignificance,
  ComparisonReport,
  DeltaValue,
  Diagnostic,
  ExportScenarioConfig,
  ImportResult,
  ImportTimeConfig,
  MeasureOptions,
  PackageConfig,
  PackageReport,
  ProgressCallback,
  Report,
  ResolvedBundleStatsConfig,
  ResolvedImportTimeConfig,
  ResolvedPackageConfig,
  ResolvedScenarioConfig,
  ResolvedSignificanceConfig,
  Scenario,
  ScenarioComparison,
  ScenarioConfig,
  ScenarioKind,
  ScenarioResult,
  SignificanceConfig,
} from './types.ts'

export {compareReports, defineConfig, formatCli, formatJson, formatMarkdown, loadConfig}
export {loadResolvedConfig, resolveConfig}

interface PackageMeasurement {
  config: ResolvedPackageConfig
  report: PackageReport
  peerDependencies: string[]
}

export async function measure(
  config: ResolvedBundleStatsConfig,
  options: MeasureOptions = {},
  onProgress?: ProgressCallback,
): Promise<Report> {
  const progress = onProgress ?? (() => {})
  const outputRoot = resolve(options.outdir ?? config.outdir)
  const packages: PackageMeasurement[] = config.packages.map((packageConfig) => {
    const discovered = discoverScenarios(packageConfig, config.conditions)
    progress(`Found ${discovered.scenarios.length} scenarios in ${discovered.metadata.name}`)
    const report: PackageReport = {
      name: discovered.metadata.name,
      version: discovered.metadata.version,
      root: packageConfig.root,
      scenarios: discovered.scenarios.map((discoveredScenario) => ({
        scenario: discoveredScenario.scenario,
        bundle: null,
        importTime: null,
        diagnostics: discoveredScenario.diagnostics,
      })),
    }
    return {
      config: packageConfig,
      report,
      peerDependencies: discovered.metadata.peerDependencies,
    }
  })

  const bundleTasks = packages.flatMap((packageMeasurement) => {
    const packageOutdir = resolve(outputRoot, packageSlug(packageMeasurement.report.name))
    return packageMeasurement.report.scenarios
      .filter((result) => !hasErrors(result))
      .map((result) => ({packageMeasurement, result, outdir: packageOutdir}))
  })

  await runConcurrently(bundleTasks, config.concurrency, async (task, index) => {
    const {packageMeasurement, result, outdir} = task
    progress(
      `Bundling ${packageMeasurement.report.name} / ${result.scenario.name} ` +
        `(${index + 1}/${bundleTasks.length})`,
    )
    try {
      result.bundle = await measureBundle({
        scenario: result.scenario,
        externals: packageMeasurement.peerDependencies,
        outdir,
        platform: config.platform,
        conditions: config.conditions,
      })
    } catch (error) {
      result.diagnostics.push({
        severity: 'error',
        phase: 'bundle',
        message: errorMessage(error),
      })
    }
  })

  for (const packageMeasurement of packages) {
    for (const result of packageMeasurement.report.scenarios) {
      if (!shouldBenchmark(result, packageMeasurement.config)) continue
      const specifier = result.scenario.importSpecifier
      if (specifier === null) continue
      progress(`Benchmarking import ${packageMeasurement.report.name} / ${result.scenario.name}`)
      const benchmark = packageMeasurement.config.importTime
      result.importTime = await measureImportTime(specifier, {
        cwd: packageMeasurement.config.root,
        runs: benchmark.runs,
        delayMs: benchmark.delayMs,
        trimCount: benchmark.trimCount,
        unrestrictedReads: result.scenario.kind === 'bin',
        allowChildProcess: result.scenario.kind === 'bin' && benchmark.allowBinChildProcess,
      })
      if (result.importTime.failed) {
        result.diagnostics.push({
          severity: 'error',
          phase: 'import',
          message: result.importTime.error ?? 'Import benchmark failed',
        })
      }
    }
  }

  return {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    refLabel: options.refLabel ?? null,
    engine: {name: 'rolldown', version: VERSION},
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    config: {
      fingerprint: config.fingerprint,
      significance: config.significance,
    },
    packages: packages.map((packageMeasurement) => packageMeasurement.report),
  }
}

function shouldBenchmark(result: ScenarioResult, config: ResolvedPackageConfig): boolean {
  if (hasErrors(result)) return false
  if (result.scenario.kind === 'export') return config.importTime.exports
  if (result.scenario.kind === 'bin') return config.importTime.bins
  return false
}

function hasErrors(result: ScenarioResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

async function runConcurrently<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      await worker(items[index], index)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({length: workerCount}, () => runWorker()))
}

function packageSlug(packageName: string): string {
  return packageName.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
