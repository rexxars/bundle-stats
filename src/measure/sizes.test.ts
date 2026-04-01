import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolve} from 'node:path'

import {measureInternalSize, parseRelativeImports, stripNonCode} from './sizes.ts'

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
    const code = ['import {', '  foo,', '  bar,', '  baz', '} from "./chunk.js";'].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('finds multi-line re-exports', () => {
    const code = ['export {', '  foo,', '  bar', '} from "./chunk.js";'].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./chunk.js'])
  })

  it('finds side-effect imports', () => {
    const result = parseRelativeImports('import "./polyfill.js";')
    assert.deepEqual(result, ['./polyfill.js'])
  })

  it('finds multiple imports in the same file', () => {
    const code = ['import { a } from "./chunk-a.js";', 'import { b } from "./chunk-b.js";'].join(
      '\n',
    )
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

  it('ignores imports inside single-quoted strings', () => {
    const result = parseRelativeImports("const s = 'import { x } from \"./fake.js\"';")
    assert.deepEqual(result, [])
  })

  it('ignores imports inside double-quoted strings', () => {
    const result = parseRelativeImports('const s = "import { x } from \'./fake.js\'";')
    assert.deepEqual(result, [])
  })

  it('ignores imports inside template literals', () => {
    const result = parseRelativeImports('const t = `import { x } from "./fake.js"`;')
    assert.deepEqual(result, [])
  })

  it('ignores imports inside single-line comments', () => {
    const result = parseRelativeImports('// import { x } from "./fake.js"')
    assert.deepEqual(result, [])
  })

  it('ignores imports inside multi-line comments', () => {
    const result = parseRelativeImports('/* import { x } from "./fake.js" */')
    assert.deepEqual(result, [])
  })

  it('matches real imports but ignores fake ones in strings', () => {
    const code = [
      'import { real } from "./real.js";',
      'const s = "import { fake } from \'./fake.js\'";',
    ].join('\n')
    const result = parseRelativeImports(code)
    assert.deepEqual(result, ['./real.js'])
  })
})

describe('stripNonCode', () => {
  it('blanks single-quoted string contents', () => {
    const result = stripNonCode("const s = 'import { x } from \"./y\"';")
    assert.ok(!result.includes('import { x }'))
    assert.ok(result.startsWith("const s = '"))
  })

  it('blanks double-quoted string contents', () => {
    const result = stripNonCode('const s = "import { x } from \'./y\'";')
    assert.ok(!result.includes('import { x }'))
    assert.ok(result.startsWith('const s = "'))
  })

  it('handles escaped quotes inside strings', () => {
    const result = stripNonCode(String.raw`const s = "she said \"import foo from './bar'\"";`)
    assert.ok(!result.includes('import foo'))
  })

  it('blanks template literal contents', () => {
    const result = stripNonCode('const t = `import { x } from "./y"`;')
    assert.ok(!result.includes('import { x }'))
  })

  it('blanks single-line comment contents', () => {
    const result = stripNonCode('// import { x } from "./y"')
    assert.ok(!result.includes('import { x }'))
  })

  it('blanks multi-line comment contents', () => {
    const result = stripNonCode('/* import { x } from "./y" */')
    assert.ok(!result.includes('import { x }'))
  })

  it('preserves code outside strings and comments', () => {
    const result = stripNonCode('import { a } from "./real.js"; // import fake')
    // The import keyword and surrounding code structure is preserved
    assert.ok(result.includes('import { a } from "'))
    // String contents are blanked (path inside quotes is replaced with spaces)
    assert.ok(!result.includes('./real.js'))
    // Comment contents are blanked
    assert.ok(!result.includes('import fake'))
  })
})

describe('measureInternalSize', () => {
  it('measures a standalone file with no imports', () => {
    const result = measureInternalSize(fixture('entry-no-imports.js'))
    assert.equal(result.rawBytes, 34)
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
    const chunkSize = 75 // "export const foo...\nexport const bar...\nexport const baz...\n"
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
    const entrySize = 46 // entry-single-line.js
    const chunkSize = 75 // chunk-a.js
    assert.equal(result.rawBytes, entrySize + chunkSize)
  })
})
