import {createRequire} from 'node:module'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {matchesAny} from './glob.ts'
import type {ExportEntry} from './types.ts'

interface PackageJson {
  name: string
  version: string
  exports?: Record<string, unknown>
  bin?: string | Record<string, string>
  peerDependencies?: Record<string, string>
}

type ExportValue = string | Record<string, string | Record<string, string>>

export function resolveExportCondition(exportValue: ExportValue, condition: string): string | null {
  if (typeof exportValue === 'string') {
    return condition === 'default' ? exportValue : null
  }

  const value = exportValue[condition]
  if (value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    return value.import ?? value.default ?? null
  }
  return null
}

export function discoverExports(
  packagePath: string,
  ignorePatterns: string[],
  onlyPatterns: string[] = [],
  conditions: string[] = [],
): ExportEntry[] {
  const pkgJsonPath = resolve(packagePath, 'package.json')
  const pkg: PackageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const exportsMap = pkg.exports

  if (!exportsMap) {
    if (pkg.bin) {
      return []
    }
    throw new Error(`No "exports" field found in ${pkgJsonPath}`)
  }

  const packageName = pkg.name
  const parentUrl = pathToFileURL(pkgJsonPath).href
  const entries: ExportEntry[] = []
  const unresolved: string[] = []

  // Normalize patterns: strip the package name prefix so that
  // --ignore=sanity/desk and --ignore=desk are equivalent.
  // Also accept the package name alone (e.g. --only=sanity) as the root export ".".
  const prefix = packageName + '/'
  const normalize = (p: string): string => {
    if (p === packageName) return '.'
    return p.startsWith(prefix) ? p.slice(prefix.length) : p
  }
  const normalizedIgnore = ignorePatterns.map(normalize)
  const normalizedOnly = onlyPatterns.map(normalize)

  for (const key of Object.keys(exportsMap)) {
    // Strip leading "./" to get the bare key for matching.
    // The root export "." keeps its key so --ignore=. can target it.
    const bareKey = key === '.' ? '.' : key.replace(/^\.\//, '')

    // Skip package.json export
    if (key === './package.json') continue

    // --only: if provided, only include matching exports
    if (normalizedOnly.length > 0 && !matchesAny(bareKey, normalizedOnly)) continue

    // --ignore: exclude matching exports
    if (matchesAny(bareKey, normalizedIgnore)) continue

    const importSpecifier = key === '.' ? packageName : `${packageName}/${bareKey}`
    const baseName = key === '.' ? packageName : `${packageName}/${bareKey}`

    if (conditions.length > 0) {
      const exportValue = exportsMap[key]
      const seenPaths = new Set<string>()
      let resolvedAny = false

      for (const condition of conditions) {
        if (!isExportValue(exportValue)) continue

        const relativePath = resolveExportCondition(exportValue, condition)
        if (relativePath === null) continue

        const absolutePath = resolve(packagePath, relativePath)
        if (!existsSync(absolutePath)) continue

        resolvedAny = true

        if (seenPaths.has(absolutePath)) continue
        seenPaths.add(absolutePath)

        entries.push({
          key,
          name: `${baseName} [${condition}]`,
          filePath: absolutePath,
          importSpecifier,
          condition,
        })
      }

      // Fall back to import.meta.resolve if no requested condition matched
      if (!resolvedAny) {
        let filePath: string | undefined
        try {
          filePath = fileURLToPath(import.meta.resolve(importSpecifier, parentUrl))
        } catch {
          try {
            filePath = createRequire(pkgJsonPath).resolve(importSpecifier)
          } catch {
            unresolved.push(key)
            continue
          }
        }

        entries.push({key, name: baseName, filePath, importSpecifier})
      }
    } else {
      // Use Node's own resolution algorithm to find the entry point,
      // trying ESM first and falling back to CJS for require-only exports.
      let filePath: string
      try {
        filePath = fileURLToPath(import.meta.resolve(importSpecifier, parentUrl))
      } catch {
        try {
          filePath = createRequire(pkgJsonPath).resolve(importSpecifier)
        } catch {
          unresolved.push(key)
          continue
        }
      }

      entries.push({key, name: baseName, filePath, importSpecifier})
    }
  }

  if (unresolved.length > 0) {
    const list = unresolved.map((key) => `  ${key}`).join('\n')
    throw new Error(
      `The following exports in ${pkg.name} could not be resolved to a file on disk:\n${list}`,
    )
  }

  return entries
}

export function discoverBins(
  packagePath: string,
  ignorePatterns: string[],
  onlyPatterns: string[],
): ExportEntry[] {
  const pkgJsonPath = resolve(packagePath, 'package.json')
  const pkg: PackageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

  if (!pkg.bin) return []

  // Normalize bin to object form
  const binMap: Record<string, string> =
    typeof pkg.bin === 'string' ? {[pkg.name]: pkg.bin} : pkg.bin

  const entries: ExportEntry[] = []
  const binOnlyPatterns = onlyPatterns.filter((p) => p.startsWith('bin:'))

  for (const [binName, relativePath] of Object.entries(binMap)) {
    const key = `bin:${binName}`

    // Apply ignore/only filtering using the key
    if (binOnlyPatterns.length > 0 && !matchesAny(key, binOnlyPatterns)) continue
    if (matchesAny(key, ignorePatterns)) continue

    const filePath = resolve(packagePath, relativePath)
    if (!existsSync(filePath)) continue

    entries.push({
      key,
      name: key,
      filePath,
      importSpecifier: filePath,
      source: 'bin',
    })
  }

  return entries
}

function isExportValue(value: unknown): value is ExportValue {
  if (typeof value === 'string') return true
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).every(
    (v) =>
      typeof v === 'string' ||
      (typeof v === 'object' &&
        v !== null &&
        Object.values(v).every((vv) => typeof vv === 'string')),
  )
}

export function readPackageJson(packagePath: string): PackageJson {
  const pkgJsonPath = resolve(packagePath, 'package.json')
  return JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
}

export function getPeerDependencies(packagePath: string): string[] {
  const pkg = readPackageJson(packagePath)
  return Object.keys(pkg.peerDependencies ?? {})
}
