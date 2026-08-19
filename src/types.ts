export type BundlePlatform = 'browser' | 'node' | 'neutral'

export interface ExportScenarioConfig {
  include?: string[]
  exclude?: string[]
}

export interface ScenarioConfig {
  /** Measure ESM package exports. Enabled by default. */
  exports?: boolean | ExportScenarioConfig
  /** Measure ESM command-line entry points. Enabled by default when package.json has bins. */
  bins?: boolean
  /** Named consumer entry points, relative to the package root. */
  entries?: Record<string, string>
}

export interface ImportTimeConfig {
  /** Benchmark package exports. */
  exports?: boolean
  /** Benchmark command-line entry points. */
  bins?: boolean
  runs?: number
  delayMs?: number
  trimCount?: number
  allowBinChildProcess?: boolean
}

export interface PackageConfig {
  root: string
  scenarios?: ScenarioConfig
  importTime?: boolean | ImportTimeConfig
}

export interface SignificanceConfig {
  bundle?: {
    bytes?: number
    percent?: number
  }
  importTime?: {
    milliseconds?: number
    percent?: number
  }
}

export interface BundleStatsConfig {
  packages?: Array<string | PackageConfig>
  concurrency?: number
  platform?: BundlePlatform
  conditions?: string[]
  outdir?: string
  significance?: SignificanceConfig
}

export interface ResolvedExportScenarioConfig {
  enabled: boolean
  include: string[]
  exclude: string[]
}

export interface ResolvedScenarioConfig {
  exports: ResolvedExportScenarioConfig
  bins: boolean
  entries: Record<string, string>
}

export interface ResolvedImportTimeConfig {
  exports: boolean
  bins: boolean
  runs: number
  delayMs: number
  trimCount: number
  allowBinChildProcess: boolean
}

export interface ResolvedPackageConfig {
  root: string
  scenarios: ResolvedScenarioConfig
  importTime: ResolvedImportTimeConfig
}

export interface ResolvedSignificanceConfig {
  bundle: {
    bytes: number
    percent: number
  }
  importTime: {
    milliseconds: number
    percent: number
  }
}

export interface ResolvedBundleStatsConfig {
  schemaVersion: 2
  workspaceRoot: string
  configPath: string | null
  fingerprint: string
  packages: ResolvedPackageConfig[]
  concurrency: number
  platform: BundlePlatform
  conditions: string[]
  outdir: string
  significance: ResolvedSignificanceConfig
}

export type ScenarioKind = 'export' | 'consumer' | 'bin'

export interface Scenario {
  id: string
  name: string
  kind: ScenarioKind
  input: string
  importSpecifier: string | null
  inputHash: string | null
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

export interface Diagnostic {
  severity: 'warning' | 'error'
  phase: 'discovery' | 'bundle' | 'import'
  message: string
}

export interface ScenarioResult {
  scenario: Scenario
  bundle: BundleResult | null
  importTime: ImportResult | null
  diagnostics: Diagnostic[]
}

export interface PackageReport {
  name: string
  version: string
  root: string
  scenarios: ScenarioResult[]
}

export interface Report {
  schemaVersion: 2
  createdAt: string
  refLabel: string | null
  engine: {
    name: 'rolldown'
    version: string
  }
  environment: {
    node: string
    platform: NodeJS.Platform
    arch: NodeJS.Architecture
  }
  config: {
    fingerprint: string
    significance: ResolvedSignificanceConfig
  }
  packages: PackageReport[]
}

export interface DeltaValue {
  before: number
  after: number
  delta: number
  percent: number
}

export type ChangeSignificance =
  | 'regression'
  | 'improvement'
  | 'insignificant'
  | 'input-changed'
  | 'not-comparable'

export interface ScenarioComparison {
  packageName: string
  id: string
  name: string
  kind: ScenarioKind
  status: 'added' | 'removed' | 'changed'
  rawSize: DeltaValue | null
  gzipSize: DeltaValue | null
  importTime: DeltaValue | null
  significance: ChangeSignificance
  current: ScenarioResult | null
  baseline: ScenarioResult | null
}

export interface ComparisonReport {
  schemaVersion: 2
  current: Report
  baseline: Report
  changes: ScenarioComparison[]
  summary: {
    regressions: number
    improvements: number
    insignificant: number
    added: number
    removed: number
    errors: number
    inputChanged: number
  }
}

export interface MeasureOptions {
  outdir?: string
  refLabel?: string
}

export interface ProgressCallback {
  (message: string): void
}
