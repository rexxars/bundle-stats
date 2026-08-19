// @env node

import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {extname, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {matchesAny} from './glob.ts'
import type {Diagnostic, ResolvedPackageConfig, Scenario} from './types.ts'

interface PackageMetadata {
  name: string
  version: string
  type: string | null
  peerDependencies: string[]
}

interface DiscoveredPackage {
  metadata: PackageMetadata
  scenarios: DiscoveredScenario[]
}

interface DiscoveredScenario {
  scenario: Scenario
  diagnostics: Diagnostic[]
}

interface PackageJson {
  name: string
  version: string
  type: string | null
  exports: unknown
  bin: string | Record<string, string> | null
  peerDependencies: string[]
}

export function discoverScenarios(
  config: ResolvedPackageConfig,
  conditions: string[],
): DiscoveredPackage {
  const pkg = readPackageJson(config.root)
  const scenarios: DiscoveredScenario[] = []

  if (config.scenarios.exports.enabled) {
    scenarios.push(...discoverExportScenarios(config, pkg, conditions))
  }
  scenarios.push(...discoverConsumerScenarios(config, pkg))
  if (config.scenarios.bins) {
    scenarios.push(...discoverBinScenarios(config, pkg))
  }

  if (scenarios.length === 0) {
    throw new Error(`No scenarios were discovered for ${pkg.name}`)
  }

  return {
    metadata: {
      name: pkg.name,
      version: pkg.version,
      type: pkg.type,
      peerDependencies: pkg.peerDependencies,
    },
    scenarios,
  }
}

function discoverExportScenarios(
  config: ResolvedPackageConfig,
  pkg: PackageJson,
  conditions: string[],
): DiscoveredScenario[] {
  const exportEntries = normalizeExports(pkg.exports)
  const scenarios: DiscoveredScenario[] = []

  for (const [key, value] of exportEntries) {
    if (key === './package.json' || key.includes('*')) continue
    const bareKey = key === '.' ? '.' : key.replace(/^\.\//, '')
    if (config.scenarios.exports.include.length > 0) {
      if (!matchesAny(bareKey, config.scenarios.exports.include)) continue
    }
    if (matchesAny(bareKey, config.scenarios.exports.exclude)) continue

    const target = selectExportTarget(value, conditions)
    if (target === null) {
      scenarios.push(
        withDiscoveryError(
          {
            id: `export:${key}`,
            name: key === '.' ? pkg.name : `${pkg.name}/${bareKey}`,
            kind: 'export',
            input: config.root,
            importSpecifier: key === '.' ? pkg.name : `${pkg.name}/${bareKey}`,
            inputHash: null,
          },
          `No ESM target matched the configured conditions for ${key}`,
        ),
      )
      continue
    }
    const specifier = key === '.' ? pkg.name : `${pkg.name}/${bareKey}`
    const input = resolve(config.root, target)
    const scenario: Scenario = {
      id: `export:${key}`,
      name: specifier,
      kind: 'export',
      input,
      importSpecifier: specifier,
      inputHash: null,
    }
    try {
      resolveTarget(config.root, target, `${pkg.name} export ${key}`)
      assertEsmInput(input, pkg.type, `${pkg.name} export ${key}`)
      scenarios.push({scenario, diagnostics: []})
    } catch (error) {
      scenarios.push(withDiscoveryError(scenario, errorMessage(error)))
    }
  }
  return scenarios
}

function discoverConsumerScenarios(
  config: ResolvedPackageConfig,
  pkg: PackageJson,
): DiscoveredScenario[] {
  const scenarios: DiscoveredScenario[] = []
  for (const [name, relativePath] of Object.entries(config.scenarios.entries)) {
    if (!name.trim()) throw new Error(`A consumer scenario in ${pkg.name} has an empty name`)
    const input = resolve(config.root, relativePath)
    const scenario: Scenario = {
      id: `consumer:${name}`,
      name,
      kind: 'consumer',
      input,
      importSpecifier: null,
      inputHash: existsSync(input)
        ? createHash('sha256').update(readFileSync(input)).digest('hex')
        : null,
    }
    try {
      if (!existsSync(input)) {
        throw new Error(`Consumer scenario "${name}" was not found at ${input}`)
      }
      assertEsmInput(input, pkg.type, `consumer scenario "${name}"`)
      scenarios.push({scenario, diagnostics: []})
    } catch (error) {
      scenarios.push(withDiscoveryError(scenario, errorMessage(error)))
    }
  }
  return scenarios
}

function discoverBinScenarios(
  config: ResolvedPackageConfig,
  pkg: PackageJson,
): DiscoveredScenario[] {
  if (pkg.bin === null) return []
  const binEntries = typeof pkg.bin === 'string' ? {[pkg.name]: pkg.bin} : pkg.bin
  const scenarios: DiscoveredScenario[] = []

  for (const [name, relativePath] of Object.entries(binEntries)) {
    const input = resolve(config.root, relativePath)
    const scenario: Scenario = {
      id: `bin:${name}`,
      name,
      kind: 'bin',
      input,
      importSpecifier: pathToFileURL(input).href,
      inputHash: null,
    }
    try {
      if (!existsSync(input)) throw new Error(`Bin "${name}" was not found at ${input}`)
      assertEsmInput(input, pkg.type, `bin "${name}"`)
      scenarios.push({scenario, diagnostics: []})
    } catch (error) {
      scenarios.push(withDiscoveryError(scenario, errorMessage(error)))
    }
  }
  return scenarios
}

function normalizeExports(exportsValue: unknown): Array<[string, unknown]> {
  if (exportsValue === undefined || exportsValue === null) return []
  if (!isRecord(exportsValue)) return [['.', exportsValue]]

  const entries = Object.entries(exportsValue)
  const isSubpathMap = entries.some(([key]) => key.startsWith('.'))
  return isSubpathMap ? entries : [['.', exportsValue]]
}

function selectExportTarget(value: unknown, conditions: string[]): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const selected = selectExportTarget(candidate, conditions)
      if (selected !== null) return selected
    }
    return null
  }
  if (!isRecord(value)) return null

  for (const condition of conditions) {
    if (!(condition in value)) continue
    const selected = selectExportTarget(value[condition], conditions)
    if (selected !== null) return selected
  }
  if ('default' in value) return selectExportTarget(value.default, conditions)
  return null
}

function resolveTarget(packageRoot: string, target: string, label: string): string {
  if (!target.startsWith('./')) {
    throw new Error(`${label} points outside the package: ${target}`)
  }
  const input = resolve(packageRoot, target)
  if (!existsSync(input)) throw new Error(`${label} was not found at ${input}`)
  return input
}

function assertEsmInput(input: string, packageType: string | null, label: string): void {
  const extension = extname(input)
  if (extension === '.cjs' || extension === '.cts') {
    throw new Error(`${label} resolves to CommonJS (${input}). bundle-stats v2 only supports ESM.`)
  }
  if ((extension === '.js' || extension === '.jsx') && packageType !== 'module') {
    throw new Error(
      `${label} resolves to ${extension} in a package without "type": "module". ` +
        'bundle-stats v2 only supports ESM.',
    )
  }
}

function withDiscoveryError(scenario: Scenario, message: string): DiscoveredScenario {
  return {
    scenario,
    diagnostics: [{severity: 'error', phase: 'discovery', message}],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readPackageJson(packageRoot: string): PackageJson {
  const path = resolve(packageRoot, 'package.json')
  if (!existsSync(path)) throw new Error(`package.json not found at ${path}`)
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.version !== 'string') {
    throw new Error(`${path} must contain string name and version fields`)
  }

  return {
    name: value.name,
    version: value.version,
    type: typeof value.type === 'string' ? value.type : null,
    exports: value.exports,
    bin: readBin(value.bin, path),
    peerDependencies: isRecord(value.peerDependencies) ? Object.keys(value.peerDependencies) : [],
  }
}

function readBin(value: unknown, packageJsonPath: string): string | Record<string, string> | null {
  if (value === undefined) return null
  if (typeof value === 'string') return value
  if (isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')) {
    const bins: Record<string, string> = {}
    for (const [name, entry] of Object.entries(value)) {
      if (typeof entry === 'string') bins[name] = entry
    }
    return bins
  }
  throw new Error(`${packageJsonPath} has an invalid bin field`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
