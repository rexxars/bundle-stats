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

/**
 * Replace the contents of string literals, template literals, and comments
 * with spaces so that import-scanning regexes only match real code.
 * Delimiters are preserved; only inner content is blanked.
 */
// Used with .replace(), which resets lastIndex automatically (no manual reset needed).
const NON_CODE_RE =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g

export function stripNonCode(source: string): string {
  return source.replace(NON_CODE_RE, (match) => {
    if (match.length <= 2) return match
    const open = match[0]
    // For // comments, blank everything after the //
    if (open === '/' && match[1] === '/') {
      return '//' + ' '.repeat(match.length - 2)
    }
    // For /* */ comments, blank everything between delimiters
    if (open === '/' && match[1] === '*') {
      return '/*' + ' '.repeat(match.length - 4) + '*/'
    }
    // For string/template literals, blank between delimiters
    const close = match[match.length - 1]
    return open + ' '.repeat(match.length - 2) + close
  })
}

// Matches import/export ... from "..." — captures the quote char and the
// content between quotes. The path capture [^'"]* matches blanked (space-filled)
// strings too, letting us confirm the import is real code, then read the path
// from the original content at the same index.
const IMPORT_RE = /(?:import|export)\s+[\s\S]*?\s+from\s+(['"])([^'"]*)\1/g

export function parseRelativeImports(content: string): string[] {
  // stripNonCode blanks string/template/comment contents but preserves length,
  // so all character indices align between sanitized and original. We run the
  // regexes on sanitized to skip fake imports inside strings/comments, then
  // read the actual path from the original content at the same index.
  const sanitized = stripNonCode(content)
  const imports: string[] = []
  let match: RegExpExecArray | null

  // Reset regex state (global flag retains lastIndex across calls)
  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(sanitized)) !== null) {
    // The closing quote is at match.index + match[0].length - 1.
    // The path occupies the len(match[2]) chars before the closing quote.
    const pathEnd = match.index + match[0].length - 1
    const pathStart = pathEnd - match[2].length
    const path = content.slice(pathStart, pathEnd)
    if (path.startsWith('.')) imports.push(path)
  }

  // Also match side-effect imports: import "./chunk.js"
  const SIDE_EFFECT_RE = /import\s+(['"])([^'"]*)\1/g
  while ((match = SIDE_EFFECT_RE.exec(sanitized)) !== null) {
    const pathEnd = match.index + match[0].length - 1
    const pathStart = pathEnd - match[2].length
    const path = content.slice(pathStart, pathEnd)
    if (path.startsWith('.')) imports.push(path)
  }
  return imports
}
