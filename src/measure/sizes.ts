import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {gzipSync} from 'node:zlib'

import type {SizeResult} from '../types.ts'

/**
 * Measure the total size of a JS entry file plus all local chunks it imports.
 * Follows relative import/export-from statements within the same directory tree.
 */
export function measureInternalSize(entryPath: string): SizeResult {
  const visited = new Set<string>()
  const queue = [entryPath]
  let totalRaw = 0
  let totalContent = Buffer.alloc(0)

  while (queue.length > 0) {
    const filePath = queue.pop()!
    const realPath = resolve(filePath)
    if (visited.has(realPath)) continue
    visited.add(realPath)

    const content = readFileSync(realPath)
    totalRaw += content.length
    totalContent = Buffer.concat([totalContent, content])

    // Find relative imports in this file
    const text = content.toString('utf-8')
    const relativeImports = parseRelativeImports(text)
    const dir = dirname(realPath)

    for (const rel of relativeImports) {
      const resolved = resolve(dir, rel)
      if (!visited.has(resolved)) {
        queue.push(resolved)
      }
    }
  }

  const gzipBytes = gzipSync(totalContent).length

  return {rawBytes: totalRaw, gzipBytes}
}

const IMPORT_RE = /(?:import|export)\s+.*?\s+from\s+['"](\.[^'"]+)['"]/g

function parseRelativeImports(content: string): string[] {
  const imports: string[] = []
  let match: RegExpExecArray | null
  while ((match = IMPORT_RE.exec(content)) !== null) {
    imports.push(match[1])
  }
  // Also match side-effect imports: import "./chunk.js"
  const SIDE_EFFECT_RE = /import\s+['"](\.[^'"]+)['"]/g
  while ((match = SIDE_EFFECT_RE.exec(content)) !== null) {
    imports.push(match[1])
  }
  return imports
}
