export type {
  ExportEntry,
  SizeResult,
  BundleResult,
  ImportResult,
  ExportReport,
  Report,
  ExportDelta,
  DeltaValue,
  ComparisonReport,
  ReportOptions,
} from './types.ts'

export {globToRegex, matchesAny} from './glob.ts'
export {discoverExports, readPackageJson, getPeerDependencies} from './exports.ts'
export {measureInternalSize} from './measure/sizes.ts'
export {measureBundledSize} from './measure/bundle.ts'
export {measureImportTime} from './measure/imports.ts'
export {compareReports} from './compare.ts'
export {formatCli} from './format/cli.ts'
export {formatMarkdown, type MarkdownOptions} from './format/markdown.ts'
export {formatJson} from './format/json.ts'
export {parseValue, evaluateThresholds, formatViolationsMarkdown} from './thresholds.ts'
export type {ThresholdConfig, ThresholdViolation} from './thresholds.ts'
export {resolveNpmVersion, measureNpmPackage} from './npm.ts'

import {discoverExports, getPeerDependencies, readPackageJson} from './exports.ts'
import {measureBundledSize} from './measure/bundle.ts'
import {measureImportTime} from './measure/imports.ts'
import {measureInternalSize} from './measure/sizes.ts'
import type {ExportReport, Report, ReportOptions} from './types.ts'

export interface ProgressCallback {
  (message: string): void
}

/**
 * Generate a complete bundle stats report for a package.
 *
 * This is the main library API. The CLI is a thin wrapper around this function.
 */
export async function generateReport(
  options: ReportOptions,
  onProgress?: ProgressCallback,
): Promise<Report> {
  const {packagePath, ignorePatterns, onlyPatterns, conditions, noBenchmark, noBundle, outdir} =
    options
  const progress = onProgress ?? (() => {})

  // 1. Discover exports
  const entries = discoverExports(packagePath, ignorePatterns, onlyPatterns, conditions)
  progress(`Found ${entries.length} exports`)

  // 2. Read package metadata
  const pkg = readPackageJson(packagePath)

  // 3. Run measurements
  const exportReports: ExportReport[] = []

  // Internal sizes (always runs)
  progress('Measuring internal sizes...')
  for (const entry of entries) {
    const internalSize = measureInternalSize(entry.filePath)

    // Initialize partial report — bundled and import will be filled in later passes
    exportReports.push({
      name: entry.name,
      key: entry.key,
      file: entry.filePath,
      internalSize,
      bundledSize: null,
      importTime: null,
    })
  }

  // Bundled sizes + treemaps (skipped if --no-bundle)
  if (!noBundle) {
    const peerDeps = getPeerDependencies(packagePath)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      progress(`Bundling ${entry.name}...`)
      try {
        const exportConditions = entry.condition
          ? [entry.condition, 'import', 'default'].filter((v, i, a) => a.indexOf(v) === i)
          : undefined
        const bundleResult = await measureBundledSize({
          entry,
          externals: peerDeps,
          outdir,
          exportConditions,
        })
        exportReports[i].bundledSize = bundleResult
      } catch (err) {
        // Record null for failed bundles — the export still appears in the report
        progress(
          `  Failed to bundle ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  // Import benchmarks (skipped if --no-benchmark)
  if (!noBenchmark) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (entry.condition && entry.condition !== 'node') {
        // Import benchmarks only meaningful under Node's native resolution
        continue
      }
      progress(`Benchmarking import ${entry.name} (${i + 1}/${entries.length})...`)
      const importResult = await measureImportTime(entry.importSpecifier, {cwd: packagePath})
      exportReports[i].importTime = importResult
    }
  }

  // 4. Build and return Report
  return {
    package: pkg.name,
    version: pkg.version,
    timestamp: new Date().toISOString(),
    exports: exportReports,
  }
}
