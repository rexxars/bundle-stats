import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {resolveConfig} from './config.ts'
import {discoverScenarios} from './scenarios.ts'

test('discovers ESM exports, consumer entries, and bins', () => {
  const root = createPackage({type: 'module'})
  try {
    const config = resolveConfig(
      {
        packages: [
          {
            root: '.',
            scenarios: {entries: {'small-import': './checks/small.ts'}},
          },
        ],
      },
      root,
      null,
    )
    const discovered = discoverScenarios(config.packages[0], config.conditions)

    assert.deepEqual(
      discovered.scenarios.map((scenario) => scenario.scenario.id),
      ['export:.', 'consumer:small-import', 'bin:fixture'],
    )
    assert.equal(discovered.scenarios[1].scenario.inputHash?.length, 64)
  } finally {
    rmSync(root, {recursive: true})
  }
})

test('rejects CommonJS package exports', () => {
  const root = createPackage({type: 'commonjs', exportTarget: './dist/index.cjs'})
  try {
    const config = resolveConfig({packages: ['.']}, root, null)
    const discovered = discoverScenarios(config.packages[0], config.conditions)
    assert.match(discovered.scenarios[0].diagnostics[0].message, /only supports ESM/)
  } finally {
    rmSync(root, {recursive: true})
  }
})

function createPackage(options: {type: string; exportTarget?: string}): string {
  const root = mkdtempSync(join(tmpdir(), 'bundle-stats-scenarios-'))
  mkdirSync(join(root, 'dist'))
  mkdirSync(join(root, 'checks'))
  const exportTarget = options.exportTarget ?? './dist/index.js'
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      version: '1.0.0',
      type: options.type,
      exports: {'.': {import: exportTarget}},
      bin: {fixture: './dist/cli.js'},
    }),
  )
  writeFileSync(join(root, exportTarget), 'export const value = 1\n')
  writeFileSync(join(root, 'dist/cli.js'), '#!/usr/bin/env node\nexport {}\n')
  writeFileSync(
    join(root, 'checks/small.ts'),
    "import {value} from '../dist/index.js'\nvoid value\n",
  )
  return root
}
