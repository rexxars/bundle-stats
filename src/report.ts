// @env node

import {readFileSync} from 'node:fs'

import type {Report} from './types.ts'

export function readReport(path: string): Report {
  const source = path === '-' ? readFileSync('/dev/stdin', 'utf8') : readFileSync(path, 'utf8')
  const value: unknown = JSON.parse(source)
  if (!isReport(value)) throw new Error(`${path} is not a bundle-stats v2 report`)
  return value
}

function isReport(value: unknown): value is Report {
  if (!isRecord(value) || value.schemaVersion !== 2) return false
  if (typeof value.createdAt !== 'string') return false
  if (value.refLabel !== null && typeof value.refLabel !== 'string') return false
  if (!isRecord(value.engine) || value.engine.name !== 'rolldown') return false
  if (typeof value.engine.version !== 'string') return false
  if (!isRecord(value.environment)) return false
  if (
    typeof value.environment.node !== 'string' ||
    typeof value.environment.platform !== 'string' ||
    typeof value.environment.arch !== 'string'
  ) {
    return false
  }
  if (!isRecord(value.config) || typeof value.config.fingerprint !== 'string') return false
  if (!isSignificance(value.config.significance)) return false
  if (!Array.isArray(value.packages) || !value.packages.every(isPackageReport)) return false
  return true
}

function isPackageReport(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    typeof value.name !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.root !== 'string'
  ) {
    return false
  }
  return Array.isArray(value.scenarios) && value.scenarios.every(isScenarioResult)
}

function isScenarioResult(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.scenario)) return false
  if (
    typeof value.scenario.id !== 'string' ||
    typeof value.scenario.name !== 'string' ||
    !isScenarioKind(value.scenario.kind) ||
    typeof value.scenario.input !== 'string'
  ) {
    return false
  }
  if (
    value.scenario.importSpecifier !== null &&
    typeof value.scenario.importSpecifier !== 'string'
  ) {
    return false
  }
  if (value.scenario.inputHash !== null && typeof value.scenario.inputHash !== 'string') {
    return false
  }
  if (value.bundle !== null && !isBundleResult(value.bundle)) return false
  if (value.importTime !== null && !isImportResult(value.importTime)) return false
  return Array.isArray(value.diagnostics) && value.diagnostics.every(isDiagnostic)
}

function isBundleResult(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.rawBytes === 'number' &&
    typeof value.gzipBytes === 'number' &&
    (value.treemapPath === null || typeof value.treemapPath === 'string')
  )
}

function isImportResult(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.medianMs === 'number' &&
    Array.isArray(value.runs) &&
    value.runs.every((run) => typeof run === 'number') &&
    typeof value.failed === 'boolean' &&
    (value.error === null || typeof value.error === 'string')
  )
}

function isDiagnostic(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    (value.severity === 'warning' || value.severity === 'error') &&
    (value.phase === 'discovery' || value.phase === 'bundle' || value.phase === 'import') &&
    typeof value.message === 'string'
  )
}

function isSignificance(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.bundle) || !isRecord(value.importTime)) return false
  return (
    typeof value.bundle.bytes === 'number' &&
    typeof value.bundle.percent === 'number' &&
    typeof value.importTime.milliseconds === 'number' &&
    typeof value.importTime.percent === 'number'
  )
}

function isScenarioKind(value: unknown): boolean {
  return value === 'export' || value === 'consumer' || value === 'bin'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
