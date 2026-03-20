import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolve} from 'node:path'

import {measureInternalSize, parseRelativeImports} from './sizes.ts'

const fixture = (name: string) => resolve(import.meta.dirname, '__fixtures__', name)

describe('parseRelativeImports', () => {
  it('finds single-line named imports', () => {
    const result = parseRelativeImports('import { foo } from "./chunk.js";')
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('finds single-line default imports', () => {
    const result = parseRelativeImports('import foo from "./chunk.js";')
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('finds multi-line named imports', () => {
    const code = [
      'import {',
      '  foo,',
      '  bar,',
      '  baz',
      '} from "./chunk.js";',
    ].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('finds multi-line re-exports', () => {
    const code = [
      'export {',
      '  foo,',
      '  bar',
      '} from "./chunk.js";',
    ].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('finds side-effect imports', () => {
    const result = parseRelativeImports('import "./polyfill.js";')
    assert.deepEqual(result, ['./polyfill.js'])
  })

  it('finds multiple imports in the same file', () => {
    const code = [
      'import { a } from "./chunk-a.js";',
      'import { b } from "./chunk-b.js";',
    ].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./chunk-a.js', './chunk-b.js'])
  })

  it('ignores bare-specifier (non-relative) imports', () => {
    const result = parseRelativeImports('import express from "express";')
    assert.deepEqual(result, [])
  })

  it('handles single-quoted paths', () => {
    const result = parseRelativeImports("import foo from './chunk.js';")
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('handles tsup-style barrel with import + re-export', () => {
    const code = [
      'import {',
      '  compareReports,',
      '  generateReport',
      '} from "./chunk-2L3ELBJG.js";',
      'export {',
      '  compareReports,',
      '  generateReport',
      '};',
    ].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./chunk-2L3ELBJG.js'])
  })
})

describe('measureInternalSize', () => {
  it('measures a standalone file with no imports', () => {
    const result = measureInternalSize(fixture('entry-no-imports.js'))
    assert.equal(result.rawBytes, 35)
    assert.ok(result.gzipBytes > 0)
  })

  it('follows single-line relative imports', () => {
    const entryOnly = measureInternalSize(fixture('entry-no-imports.js'))
    const withImport = measureInternalSize(fixture('entry-single-line.js'))
    assert.ok(withImport.rawBytes > entryOnly.rawBytes, 'should include chunk size')
  })

  it('follows multi-line relative imports', () => {
    const withImport = measureInternalSize(fixture('entry-multi-line.js'))
    const singleLine = measureInternalSize(fixture('entry-single-line.js'))
    // Both reference the same chunk, multi-line entry is larger but chunk is same
    assert.ok(withImport.rawBytes > singleLine.rawBytes, 'multi-line entry is larger')
    // Both should include chunk-a.js content
    const chunkSize = 78 // "export const foo...\nexport const bar...\nexport const baz...\n"
    assert.ok(withImport.rawBytes > chunkSize, 'should include chunk content')
    assert.ok(singleLine.rawBytes > chunkSize, 'should include chunk content')
  })

  it('follows side-effect imports', () => {
    const result = measureInternalSize(fixture('entry-side-effect.js'))
    const standalone = measureInternalSize(fixture('entry-no-imports.js'))
    assert.ok(result.rawBytes > standalone.rawBytes, 'should include side-effect chunk')
  })

  it('does not double-count shared chunks', () => {
    // entry-single-line and entry-multi-line both import chunk-a.js
    // If we measured each, the chunk should only be counted once per entry
    const result = measureInternalSize(fixture('entry-single-line.js'))
    const entrySize = 52 // entry-single-line.js
    const chunkSize = 78 // chunk-a.js
    assert.equal(result.rawBytes, entrySize + chunkSize)
  })
})
