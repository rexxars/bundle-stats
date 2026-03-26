export interface ExportEntry {
  /** The raw export key from package.json, e.g. "." or "./_internal" */
  key: string
  /** Friendly display name, e.g. "sanity" or "sanity/_internal" */
  name: string
  /** Absolute path to the JS file resolved from the export condition */
  filePath: string
  /** The import specifier for Node resolution, e.g. "sanity" or "sanity/_internal" */
  importSpecifier: string
  /** Export condition this entry was resolved under, e.g. "node", "default" */
  condition?: string
  /** Set to 'bin' for entries discovered from the "bin" field in package.json */
  source?: 'bin'
}

export interface SizeResult {
  rawBytes: number
  gzipBytes: number
}

export interface BundleResult {
  rawBytes: number
  gzipBytes: number
  treemapPath: string | null
}

export interface ImportResult {
  medianMs: number
  runs: number[]
  failed: boolean
  error: string | null
}

export interface ExportReport {
  name: string
  key: string
  file: string
  /** Export condition this entry was resolved under, e.g. "node", "default" */
  condition?: string
  internalSize: SizeResult | null
  bundledSize: BundleResult | null
  importTime: ImportResult | null
}

export interface Report {
  package: string
  version: string
  timestamp: string
  refLabel?: string
  exports: ExportReport[]
}

export interface ExportDelta {
  name: string
  key: string
  /** Export condition this entry was resolved under, e.g. "node", "default" */
  condition?: string
  internalSize: DeltaValue | null
  internalRawSize: DeltaValue | null
  bundledRawSize: DeltaValue | null
  bundledSize: DeltaValue | null
  importTime: DeltaValue | null
  status: 'added' | 'removed' | 'changed'
}

export interface DeltaValue {
  before: number
  after: number
  delta: number
  percent: number
}

export interface ComparisonReport {
  current: Report
  baseline: Report
  deltas: ExportDelta[]
}

export interface ReportOptions {
  packagePath: string
  ignorePatterns: string[]
  onlyPatterns: string[]
  conditions: string[]
  noBenchmark: boolean
  noBundle: boolean
  noBinBenchmark: boolean
  outdir: string
}
