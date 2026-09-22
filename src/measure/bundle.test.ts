import assert from 'node:assert/strict'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {measureBundle} from './bundle.ts'

test('gzip size ignores comments and minifies local identifiers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-stats-minify-'))
  const input = join(root, 'index.js')
  const measure = () =>
    measureBundle({
      scenario: {
        id: 'export:.',
        name: '.',
        kind: 'export',
        input,
        importSpecifier: null,
        inputHash: null,
      },
      externals: [],
      outdir: join(root, 'artifacts'),
      platform: 'neutral',
      conditions: [],
    })

  try {
    const source = `export function greet(descriptiveUserName) {
      return "Hello, " + descriptiveUserName + "!"
    }`
    writeFileSync(input, source)
    const original = await measure()

    writeFileSync(
      input,
      `// Regular line comment
      /* Regular block comment */
      /*! Library banner */
      /** @license MIT */
      /** @preserve Attribution */
      //! Preserved line comment
      /** Documentation for the greeting function. */
      ${source}`,
    )
    const commented = await measure()
    assert.equal(commented.gzipBytes, original.gzipBytes)
    assert.ok(commented.rawBytes > original.rawBytes)

    writeFileSync(input, 'export function greet(x){return "Hello, "+x+"!"}')
    const compact = await measure()
    assert.equal(compact.gzipBytes, original.gzipBytes)
    assert.ok(compact.rawBytes < original.rawBytes)
    assert.ok(compact.gzipBytes > 0)

    writeFileSync(input, 'export function greet(x){return "Good morning, "+x+"! Welcome back."}')
    const changed = await measure()
    assert.notEqual(changed.gzipBytes, original.gzipBytes)
  } finally {
    rmSync(root, {recursive: true})
  }
})
