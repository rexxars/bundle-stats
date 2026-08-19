import assert from 'node:assert/strict'
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {resolveConfig} from './config.ts'
import {measure} from './index.ts'

test('measures exports and consumer entries with Rolldown', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-stats-measure-'))
  try {
    mkdirSync(join(root, 'dist'))
    mkdirSync(join(root, 'checks'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './dist/index.js'},
      }),
    )
    writeFileSync(
      join(root, 'dist/index.js'),
      'export const small = 1\nexport const large = "x".repeat(1000)\n',
    )
    writeFileSync(
      join(root, 'checks/small.ts'),
      "import {small} from '../dist/index.js'\nconsole.log(small)\n",
    )

    const config = resolveConfig(
      {
        packages: [
          {
            root: '.',
            scenarios: {bins: false, entries: {small: './checks/small.ts'}},
            importTime: false,
          },
        ],
        concurrency: 2,
        outdir: './artifacts',
      },
      root,
      null,
    )
    const report = await measure(config)

    assert.equal(report.engine.name, 'rolldown')
    assert.deepEqual(
      report.packages[0].scenarios.map((scenario) => scenario.scenario.id),
      ['export:.', 'consumer:small'],
    )
    for (const scenario of report.packages[0].scenarios) {
      assert.ok(scenario.bundle)
      assert.ok(scenario.bundle.rawBytes > 0)
      assert.ok(scenario.bundle.treemapPath)
      assert.equal(existsSync(scenario.bundle.treemapPath), true)
      assert.deepEqual(scenario.diagnostics, [])
    }
  } finally {
    rmSync(root, {recursive: true})
  }
})
