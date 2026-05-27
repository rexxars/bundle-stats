import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

import {generateReport} from './index.ts'

describe('generateReport entry discovery errors', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bundle-stats-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, {recursive: true, force: true})
  })

  it('mentions the active filters when all entries are excluded by --only', async () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', '_internal.js'), 'export default 42')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@scope/has-only-subpath',
        version: '1.0.0',
        exports: {
          './_internal': './dist/_internal.js',
          './package.json': './package.json',
        },
      }),
    )

    await assert.rejects(
      () =>
        generateReport({
          packagePath: tempDir,
          ignorePatterns: [],
          onlyPatterns: ['.'],
          conditions: [],
          noBenchmark: true,
          noBundle: true,
          noBinBenchmark: true,
          allowBinChildProcess: false,
          outdir: tempDir,
        }),
      (err: unknown) => {
        if (!(err instanceof Error)) return false
        return (
          err.message.includes('@scope/has-only-subpath') &&
          err.message.includes('--only=.') &&
          err.message.includes('matched the active filters')
        )
      },
    )
  })

  it('mentions both --only and --ignore when both filters are active', async () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'index.js'), 'export default 42')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@scope/all-filtered',
        version: '1.0.0',
        exports: {
          '.': './dist/index.js',
        },
      }),
    )

    await assert.rejects(
      () =>
        generateReport({
          packagePath: tempDir,
          ignorePatterns: ['.'],
          onlyPatterns: ['.'],
          conditions: [],
          noBenchmark: true,
          noBundle: true,
          noBinBenchmark: true,
          allowBinChildProcess: false,
          outdir: tempDir,
        }),
      (err: unknown) => {
        if (!(err instanceof Error)) return false
        return err.message.includes('--only=.') && err.message.includes('--ignore=.')
      },
    )
  })

  it('falls back to the generic message when no filters are active', async () => {
    // exports map present but contains only ./package.json (auto-skipped), no bin
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@scope/no-entries',
        version: '1.0.0',
        exports: {
          './package.json': './package.json',
        },
      }),
    )

    await assert.rejects(
      () =>
        generateReport({
          packagePath: tempDir,
          ignorePatterns: [],
          onlyPatterns: [],
          conditions: [],
          noBenchmark: true,
          noBundle: true,
          noBinBenchmark: true,
          allowBinChildProcess: false,
          outdir: tempDir,
        }),
      (err: unknown) => {
        if (!(err instanceof Error)) return false
        return (
          err.message.includes('@scope/no-entries') &&
          err.message.includes('No measurable') &&
          !err.message.includes('--only') &&
          !err.message.includes('--ignore')
        )
      },
    )
  })
})
