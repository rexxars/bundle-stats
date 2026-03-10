import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {generateReport} from './index.ts'
import type {ProgressCallback} from './index.ts'
import type {Report, ReportOptions} from './types.ts'

/**
 * Resolve an npm version specifier to a concrete version string.
 *
 * If `version` is a string, return it as-is (it may be a semver range or tag).
 * If `version` is `true`, resolve the `latest` tag from the npm registry.
 */
export function resolveNpmVersion(packageName: string, version: string | true): string {
  if (typeof version === 'string') {
    return version
  }

  try {
    const result = execFileSync('npm', ['view', packageName, 'version'], {
      encoding: 'utf-8',
      timeout: 30_000,
    })
    return result.trim()
  } catch (err) {
    throw new Error(
      `Failed to resolve npm version for ${packageName}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

interface MeasureNpmPackageOptions {
  packageName: string
  version: string
  reportOptions: Pick<
    ReportOptions,
    'ignorePatterns' | 'onlyPatterns' | 'conditions' | 'noBenchmark' | 'noBundle' | 'outdir'
  >
  onProgress?: ProgressCallback
}

/**
 * Install a published npm package into a temporary directory and generate
 * a report against it. The temp directory is cleaned up after measurement.
 */
export async function measureNpmPackage(options: MeasureNpmPackageOptions): Promise<Report> {
  const {packageName, version, reportOptions, onProgress} = options
  const progress = onProgress ?? (() => {})

  const tmpDir = mkdtempSync(join(tmpdir(), 'bundle-stats-npm-'))
  writeFileSync(join(tmpDir, 'package.json'), '{"private":true}')

  try {
    progress(`Installing ${packageName}@${version} into temp directory...`)

    try {
      execFileSync('npm', ['install', '--no-save', `${packageName}@${version}`], {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: 'pipe',
      })
    } catch (err) {
      throw new Error(
        `Failed to install ${packageName}@${version} from npm: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const packagePath = join(tmpDir, 'node_modules', packageName)

    const report = await generateReport(
      {
        packagePath,
        ignorePatterns: reportOptions.ignorePatterns,
        onlyPatterns: reportOptions.onlyPatterns,
        conditions: reportOptions.conditions,
        noBenchmark: reportOptions.noBenchmark,
        noBundle: reportOptions.noBundle,
        outdir: reportOptions.outdir,
      },
      onProgress,
    )

    report.refLabel = version

    return report
  } finally {
    rmSync(tmpDir, {recursive: true, force: true})
  }
}
