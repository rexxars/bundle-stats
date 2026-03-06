import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

import {discoverExports} from './exports.ts'

describe('discoverExports', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bundle-stats-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, {recursive: true, force: true})
  })

  it('throws when export files do not exist on disk', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': './dist/index.js',
          './utils': './dist/utils.js',
        },
      }),
    )

    assert.throws(() => discoverExports(tempDir, []), (err: unknown) => {
      if (!(err instanceof Error)) return false
      // Should mention both unresolved exports
      return err.message.includes('.') && err.message.includes('./utils')
    })
  })

  it('throws listing only the missing exports, not the resolvable ones', () => {
    // Create one file so one export resolves, the other doesn't
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'index.js'), 'export default 42')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': './dist/index.js',
          './missing': './dist/missing.js',
        },
      }),
    )

    assert.throws(() => discoverExports(tempDir, []), (err: unknown) => {
      if (!(err instanceof Error)) return false
      // Should mention the missing export but not the resolved one
      return err.message.includes('./missing') && !err.message.includes('"."')
    })
  })

  it('returns entries normally when all exports resolve', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'index.js'), 'export default 42')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': './dist/index.js',
        },
      }),
    )

    const entries = discoverExports(tempDir, [])
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'test-pkg')
  })

  it('does not throw for exports excluded by ignore patterns', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': './dist/index.js',
        },
      }),
    )

    // The "." export is missing, but it's ignored — so no error
    const entries = discoverExports(tempDir, ['.'])
    assert.equal(entries.length, 0)
  })
})
