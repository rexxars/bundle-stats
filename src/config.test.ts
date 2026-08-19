import assert from 'node:assert/strict'
import {test} from 'node:test'

import {resolveConfig} from './config.ts'

test('resolveConfig applies v2 defaults', () => {
  const config = resolveConfig({packages: ['packages/example']}, '/workspace', null)

  assert.equal(config.schemaVersion, 2)
  assert.equal(config.platform, 'browser')
  assert.deepEqual(config.conditions, ['browser', 'import', 'default'])
  assert.equal(config.concurrency >= 1, true)
  assert.equal(config.packages[0].root, '/workspace/packages/example')
  assert.equal(config.packages[0].scenarios.exports.enabled, true)
  assert.equal(config.packages[0].scenarios.bins, true)
  assert.equal(config.packages[0].importTime.exports, true)
  assert.equal(config.packages[0].importTime.bins, false)
  assert.deepEqual(config.significance.bundle, {bytes: 1024, percent: 1})
})

test('resolveConfig keeps named entries and custom significance', () => {
  const config = resolveConfig(
    {
      packages: [
        {
          root: '.',
          scenarios: {
            exports: false,
            bins: false,
            entries: {'query-only': './checks/query.ts'},
          },
          importTime: false,
        },
      ],
      concurrency: 2,
      significance: {bundle: {bytes: 2048, percent: 2}},
    },
    '/workspace',
    null,
  )

  assert.deepEqual(config.packages[0].scenarios.entries, {
    'query-only': './checks/query.ts',
  })
  assert.equal(config.packages[0].scenarios.exports.enabled, false)
  assert.equal(config.packages[0].importTime.exports, false)
  assert.deepEqual(config.significance.bundle, {bytes: 2048, percent: 2})
})

test('resolveConfig rejects import trimming that removes every run', () => {
  assert.throws(
    () =>
      resolveConfig(
        {packages: [{root: '.', importTime: {runs: 3, trimCount: 2}}]},
        '/workspace',
        null,
      ),
    /must leave at least one benchmark run/,
  )
})
