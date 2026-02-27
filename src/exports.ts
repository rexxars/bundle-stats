import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {matchesAny} from './glob.ts'
import type {ExportEntry} from './types.ts'

interface PackageJson {
  name: string
  version: string
  exports?: Record<string, Record<string, string> | string>
  peerDependencies?: Record<string, string>
}

export function discoverExports(
  packagePath: string,
  ignorePatterns: string[],
  onlyPatterns: string[] = [],
): ExportEntry[] {
  const pkgJsonPath = resolve(packagePath, 'package.json')
  const pkg: PackageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const exportsMap = pkg.exports

  if (!exportsMap) {
    throw new Error(`No "exports" field found in ${pkgJsonPath}`)
  }

  const packageName = pkg.name
  const entries: ExportEntry[] = []

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

  for (const [key, value] of Object.entries(exportsMap)) {
    // Strip leading "./" to get the bare key for matching.
    // The root export "." keeps its key so --ignore=. can target it.
    const bareKey = key === '.' ? '.' : key.replace(/^\.\//, '')

    // Skip package.json export
    if (key === './package.json') continue

    // --only: if provided, only include matching exports
    if (normalizedOnly.length > 0 && !matchesAny(bareKey, normalizedOnly)) continue

    // --ignore: exclude matching exports
    if (matchesAny(bareKey, normalizedIgnore)) continue

    // Resolve the "default" condition
    const defaultPath = typeof value === 'string' ? value : value?.default
    if (!defaultPath) continue

    const filePath = resolve(packagePath, defaultPath)
    const name = key === '.' ? packageName : `${packageName}/${bareKey}`
    const importSpecifier = key === '.' ? packageName : `${packageName}/${bareKey}`

    entries.push({key, name, filePath, importSpecifier})
  }

  return entries
}

export function readPackageJson(packagePath: string): PackageJson {
  const pkgJsonPath = resolve(packagePath, 'package.json')
  return JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
}

export function getPeerDependencies(packagePath: string): string[] {
  const pkg = readPackageJson(packagePath)
  return Object.keys(pkg.peerDependencies ?? {})
}
