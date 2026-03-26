import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

import {discoverExports, resolveExportCondition, discoverBins} from './exports.ts'

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

    assert.throws(
      () => discoverExports(tempDir, []),
      (err: unknown) => {
        if (!(err instanceof Error)) return false
        // Should mention both unresolved exports
        return err.message.includes('.') && err.message.includes('./utils')
      },
    )
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

    assert.throws(
      () => discoverExports(tempDir, []),
      (err: unknown) => {
        if (!(err instanceof Error)) return false
        // Should mention the missing export but not the resolved one
        return err.message.includes('./missing') && !err.message.includes('"."')
      },
    )
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

  it('resolves multiple conditions for the same export key', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'index.node.js'), 'export default 1')
    writeFileSync(join(tempDir, 'dist', 'index.default.js'), 'export default 2')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': {
            node: './dist/index.node.js',
            default: './dist/index.default.js',
          },
        },
      }),
    )

    const entries = discoverExports(tempDir, [], [], ['node', 'default'])
    assert.equal(entries.length, 2)
    assert.equal(entries[0].name, 'test-pkg [node]')
    assert.equal(entries[0].condition, 'node')
    assert.ok(entries[0].filePath.endsWith('index.node.js'))
    assert.equal(entries[1].name, 'test-pkg [default]')
    assert.equal(entries[1].condition, 'default')
    assert.ok(entries[1].filePath.endsWith('index.default.js'))
  })

  it('deduplicates when conditions resolve to the same file', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'index.js'), 'export default 1')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': {
            node: './dist/index.js',
            default: './dist/index.js',
          },
        },
      }),
    )

    const entries = discoverExports(tempDir, [], [], ['node', 'default'])
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'test-pkg [node]')
    assert.equal(entries[0].condition, 'node')
  })

  it('handles mix of conditional and non-conditional exports', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'index.node.js'), 'export default 1')
    writeFileSync(join(tempDir, 'dist', 'index.default.js'), 'export default 2')
    writeFileSync(join(tempDir, 'dist', 'utils.js'), 'export default 3')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        exports: {
          '.': {
            node: './dist/index.node.js',
            default: './dist/index.default.js',
          },
          './utils': './dist/utils.js',
        },
      }),
    )

    const entries = discoverExports(tempDir, [], [], ['node'])
    assert.equal(entries.length, 2)

    // Root export resolves via the "node" condition
    assert.equal(entries[0].name, 'test-pkg [node]')
    assert.equal(entries[0].condition, 'node')
    assert.ok(entries[0].filePath.endsWith('index.node.js'))

    // ./utils is a bare string — "node" condition doesn't match,
    // so it falls back to import.meta.resolve without a condition
    assert.equal(entries[1].name, 'test-pkg/utils')
    assert.equal(entries[1].condition, undefined)
    assert.ok(entries[1].filePath.endsWith('utils.js'))
  })

  it('returns empty array instead of throwing when exports is missing but bin exists', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'cli.js'), 'console.log("hi")')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: './dist/cli.js',
      }),
    )

    const entries = discoverExports(tempDir, [])
    assert.equal(entries.length, 0)
  })
})

describe('resolveExportCondition', () => {
  it('resolves top-level condition with nested import', () => {
    const exportValue = {
      node: {import: './dist/node.mjs', default: './dist/node.cjs'},
      default: {import: './dist/browser.mjs', default: './dist/browser.cjs'},
    }
    assert.equal(resolveExportCondition(exportValue, 'node'), './dist/node.mjs')
  })

  it('returns null when condition does not exist', () => {
    const exportValue = {
      node: './dist/node.js',
    }
    assert.equal(resolveExportCondition(exportValue, 'browser'), null)
  })

  it('handles string export values', () => {
    assert.equal(resolveExportCondition('./dist/index.js', 'default'), './dist/index.js')
    assert.equal(resolveExportCondition('./dist/index.js', 'node'), null)
  })

  it('resolves nested import/require inside a condition', () => {
    const exportValue = {
      node: {import: './dist/node.mjs', require: './dist/node.cjs'},
    }
    // import is preferred
    assert.equal(resolveExportCondition(exportValue, 'node'), './dist/node.mjs')
  })

  it('falls back to default inside nested condition when import is missing', () => {
    const exportValue = {
      node: {default: './dist/node.cjs'},
    }
    assert.equal(resolveExportCondition(exportValue, 'node'), './dist/node.cjs')
  })

  it('returns null for nested object with no import or default', () => {
    const exportValue = {
      node: {require: './dist/node.cjs'},
    }
    assert.equal(resolveExportCondition(exportValue, 'node'), null)
  })
})

describe('discoverBins', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bundle-stats-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, {recursive: true, force: true})
  })

  it('discovers string bin form', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'cli.js'), '#!/usr/bin/env node\nconsole.log("hi")')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: './dist/cli.js',
      }),
    )

    const entries = discoverBins(tempDir, [], [])
    assert.equal(entries.length, 1)
    assert.equal(entries[0].key, 'bin:test-pkg')
    assert.equal(entries[0].name, 'bin:test-pkg')
    assert.equal(entries[0].source, 'bin')
    assert.ok(entries[0].filePath.endsWith('dist/cli.js'))
    assert.equal(entries[0].importSpecifier, entries[0].filePath)
  })

  it('discovers object bin form with multiple entries', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'cli-a.js'), 'console.log("a")')
    writeFileSync(join(tempDir, 'dist', 'cli-b.js'), 'console.log("b")')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: {
          'cmd-a': './dist/cli-a.js',
          'cmd-b': './dist/cli-b.js',
        },
      }),
    )

    const entries = discoverBins(tempDir, [], [])
    assert.equal(entries.length, 2)
    assert.equal(entries[0].key, 'bin:cmd-a')
    assert.equal(entries[0].name, 'bin:cmd-a')
    assert.equal(entries[0].source, 'bin')
    assert.ok(entries[0].filePath.endsWith('dist/cli-a.js'))
    assert.equal(entries[1].key, 'bin:cmd-b')
    assert.equal(entries[1].name, 'bin:cmd-b')
  })

  it('returns empty array when no bin field', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
      }),
    )

    const entries = discoverBins(tempDir, [], [])
    assert.equal(entries.length, 0)
  })

  it('respects ignore patterns', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'cli-a.js'), 'console.log("a")')
    writeFileSync(join(tempDir, 'dist', 'cli-b.js'), 'console.log("b")')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: {
          'cmd-a': './dist/cli-a.js',
          'cmd-b': './dist/cli-b.js',
        },
      }),
    )

    const entries = discoverBins(tempDir, ['bin:cmd-a'], [])
    assert.equal(entries.length, 1)
    assert.equal(entries[0].key, 'bin:cmd-b')
  })

  it('respects only patterns', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'cli-a.js'), 'console.log("a")')
    writeFileSync(join(tempDir, 'dist', 'cli-b.js'), 'console.log("b")')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: {
          'cmd-a': './dist/cli-a.js',
          'cmd-b': './dist/cli-b.js',
        },
      }),
    )

    const entries = discoverBins(tempDir, [], ['bin:cmd-a'])
    assert.equal(entries.length, 1)
    assert.equal(entries[0].key, 'bin:cmd-a')
  })

  it('skips bin entries whose files do not exist', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: './dist/missing.js',
      }),
    )

    const entries = discoverBins(tempDir, [], [])
    assert.equal(entries.length, 0)
  })

  it('ignores all bins with bin:* glob pattern', () => {
    mkdirSync(join(tempDir, 'dist'), {recursive: true})
    writeFileSync(join(tempDir, 'dist', 'cli.js'), 'console.log("hi")')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        bin: './dist/cli.js',
      }),
    )

    const entries = discoverBins(tempDir, ['bin:*'], [])
    assert.equal(entries.length, 0)
  })
})
