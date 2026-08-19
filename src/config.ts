// @env node

import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {availableParallelism} from 'node:os'
import {dirname, isAbsolute, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

export {defineConfig} from './define-config.ts'
import type {
  BundlePlatform,
  BundleStatsConfig,
  ExportScenarioConfig,
  ImportTimeConfig,
  PackageConfig,
  ResolvedBundleStatsConfig,
  ResolvedImportTimeConfig,
  ResolvedPackageConfig,
  ResolvedScenarioConfig,
} from './types.ts'

const CONFIG_FILENAMES = [
  'bundle-stats.config.ts',
  'bundle-stats.config.js',
  'bundle-stats.config.mjs',
]

export async function loadConfig(
  configPath: string | undefined,
  cwd = process.cwd(),
): Promise<ResolvedBundleStatsConfig> {
  const absoluteConfigPath = findConfigPath(configPath, cwd)
  if (absoluteConfigPath === null) {
    return resolveConfig({packages: ['.']}, cwd, null)
  }

  const loaded: unknown = await import(pathToFileURL(absoluteConfigPath).href)
  if (!isRecord(loaded) || !('default' in loaded)) {
    throw new Error(`${absoluteConfigPath} must have a default export`)
  }

  if (!isBundleStatsConfig(loaded.default)) {
    throw new Error(`${absoluteConfigPath} does not export a valid bundle-stats config`)
  }

  return resolveConfig(loaded.default, dirname(absoluteConfigPath), absoluteConfigPath)
}

export function loadResolvedConfig(path: string): ResolvedBundleStatsConfig {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isResolvedBundleStatsConfig(value)) {
    throw new Error(`${path} is not a bundle-stats v2 resolved config`)
  }
  return value
}

export function resolveConfig(
  config: BundleStatsConfig,
  workspaceRoot: string,
  configPath: string | null,
): ResolvedBundleStatsConfig {
  const root = resolve(workspaceRoot)
  const packages = (config.packages ?? ['.']).map((packageConfig) =>
    resolvePackageConfig(packageConfig, root),
  )
  if (packages.length === 0) {
    throw new Error('At least one package must be configured')
  }

  const platform = config.platform ?? 'browser'
  const conditions = config.conditions ?? defaultConditions(platform)
  const significance = {
    bundle: {
      bytes: nonNegative(config.significance?.bundle?.bytes, 1024, 'significance.bundle.bytes'),
      percent: nonNegative(config.significance?.bundle?.percent, 1, 'significance.bundle.percent'),
    },
    importTime: {
      milliseconds: nonNegative(
        config.significance?.importTime?.milliseconds,
        5,
        'significance.importTime.milliseconds',
      ),
      percent: nonNegative(
        config.significance?.importTime?.percent,
        10,
        'significance.importTime.percent',
      ),
    },
  }
  const concurrency = positiveInteger(
    config.concurrency,
    Math.min(4, Math.max(1, availableParallelism())),
    'concurrency',
  )
  const outdir = resolve(root, config.outdir ?? '.bundle-stats')

  const fingerprint = createHash('sha256')
    .update(JSON.stringify({packages, concurrency, platform, conditions, outdir, significance}))
    .digest('hex')

  return {
    schemaVersion: 2,
    workspaceRoot: root,
    configPath,
    fingerprint,
    packages,
    concurrency,
    platform,
    conditions,
    outdir,
    significance,
  }
}

function findConfigPath(configPath: string | undefined, cwd: string): string | null {
  if (configPath) {
    const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath)
    if (!existsSync(absolute)) {
      throw new Error(`Config file not found: ${absolute}`)
    }
    if (absolute.endsWith('.cjs') || absolute.endsWith('.cts')) {
      throw new Error('CommonJS config files are not supported. Use an ESM .js, .mjs, or .ts file.')
    }
    return absolute
  }

  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(cwd, filename)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function resolvePackageConfig(
  value: string | PackageConfig,
  workspaceRoot: string,
): ResolvedPackageConfig {
  const config = typeof value === 'string' ? {root: value} : value
  if (!config.root) throw new Error('Each package config needs a root path')

  return {
    root: resolve(workspaceRoot, config.root),
    scenarios: resolveScenarios(config.scenarios),
    importTime: resolveImportTime(config.importTime),
  }
}

function resolveScenarios(config: PackageConfig['scenarios']): ResolvedScenarioConfig {
  const exportConfig = config?.exports
  let resolvedExports: ExportScenarioConfig
  if (typeof exportConfig === 'object') {
    resolvedExports = exportConfig
  } else {
    resolvedExports = {}
  }

  return {
    exports: {
      enabled: exportConfig !== false,
      include: resolvedExports.include ?? [],
      exclude: resolvedExports.exclude ?? [],
    },
    bins: config?.bins !== false,
    entries: config?.entries ?? {},
  }
}

function resolveImportTime(
  config: boolean | ImportTimeConfig | undefined,
): ResolvedImportTimeConfig {
  const options = typeof config === 'object' ? config : {}
  const enabled = config !== false
  const runs = positiveInteger(options.runs, 7, 'importTime.runs')
  const trimCount = nonNegativeInteger(options.trimCount, 1, 'importTime.trimCount')
  if (trimCount * 2 >= runs) {
    throw new Error('importTime.trimCount must leave at least one benchmark run')
  }

  return {
    exports: enabled && options.exports !== false,
    bins: enabled && options.bins === true,
    runs,
    delayMs: nonNegativeInteger(options.delayMs, 0, 'importTime.delayMs'),
    trimCount,
    allowBinChildProcess: options.allowBinChildProcess === true,
  }
}

function defaultConditions(platform: BundlePlatform): string[] {
  if (platform === 'browser') return ['browser', 'import', 'default']
  if (platform === 'node') return ['node', 'import', 'default']
  return ['import', 'default']
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolvedValue = value ?? fallback
  if (!Number.isInteger(resolvedValue) || resolvedValue < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return resolvedValue
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
  const resolvedValue = value ?? fallback
  if (!Number.isInteger(resolvedValue) || resolvedValue < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return resolvedValue
}

function nonNegative(value: number | undefined, fallback: number, name: string): number {
  const resolvedValue = value ?? fallback
  if (!Number.isFinite(resolvedValue) || resolvedValue < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
  return resolvedValue
}

function isBundleStatsConfig(value: unknown): value is BundleStatsConfig {
  if (!isRecord(value)) return false
  if (value.packages !== undefined) {
    if (!Array.isArray(value.packages)) return false
    if (!value.packages.every(isPackageConfig)) return false
  }
  if (value.concurrency !== undefined && typeof value.concurrency !== 'number') return false
  if (value.platform !== undefined && !isBundlePlatform(value.platform)) return false
  if (value.conditions !== undefined && !isStringArray(value.conditions)) return false
  if (value.outdir !== undefined && typeof value.outdir !== 'string') return false
  if (value.significance !== undefined && !isRecord(value.significance)) return false
  return true
}

function isPackageConfig(value: unknown): value is string | PackageConfig {
  if (typeof value === 'string') return true
  if (!isRecord(value) || typeof value.root !== 'string') return false
  if (value.scenarios !== undefined && !isRecord(value.scenarios)) return false
  if (
    value.importTime !== undefined &&
    typeof value.importTime !== 'boolean' &&
    !isRecord(value.importTime)
  ) {
    return false
  }
  return true
}

function isResolvedBundleStatsConfig(value: unknown): value is ResolvedBundleStatsConfig {
  if (!isRecord(value) || value.schemaVersion !== 2) return false
  if (typeof value.workspaceRoot !== 'string') return false
  if (value.configPath !== null && typeof value.configPath !== 'string') return false
  if (typeof value.fingerprint !== 'string') return false
  if (!Array.isArray(value.packages) || !value.packages.every(isResolvedPackageConfig)) return false
  if (typeof value.concurrency !== 'number') return false
  if (!isBundlePlatform(value.platform)) return false
  if (!isStringArray(value.conditions) || typeof value.outdir !== 'string') return false
  return isResolvedSignificance(value.significance)
}

function isResolvedPackageConfig(value: unknown): value is ResolvedPackageConfig {
  if (!isRecord(value) || typeof value.root !== 'string') return false
  if (!isRecord(value.scenarios) || !isRecord(value.scenarios.exports)) return false
  if (typeof value.scenarios.exports.enabled !== 'boolean') return false
  if (!isStringArray(value.scenarios.exports.include)) return false
  if (!isStringArray(value.scenarios.exports.exclude)) return false
  if (typeof value.scenarios.bins !== 'boolean') return false
  if (!isStringRecord(value.scenarios.entries)) return false
  if (!isRecord(value.importTime)) return false
  return (
    typeof value.importTime.exports === 'boolean' &&
    typeof value.importTime.bins === 'boolean' &&
    typeof value.importTime.runs === 'number' &&
    typeof value.importTime.delayMs === 'number' &&
    typeof value.importTime.trimCount === 'number' &&
    typeof value.importTime.allowBinChildProcess === 'boolean'
  )
}

function isResolvedSignificance(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.bundle) || !isRecord(value.importTime)) return false
  return (
    typeof value.bundle.bytes === 'number' &&
    typeof value.bundle.percent === 'number' &&
    typeof value.importTime.milliseconds === 'number' &&
    typeof value.importTime.percent === 'number'
  )
}

function isBundlePlatform(value: unknown): value is BundlePlatform {
  return value === 'browser' || value === 'node' || value === 'neutral'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
