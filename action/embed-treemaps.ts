#!/usr/bin/env node

/**
 * Embed treemap viewer links into bundle-stats markdown output.
 *
 * Reads markdown from stdin, extracts treemap JSON from rollup-plugin-visualizer
 * HTML files, compacts and gzip+base64url-encodes them into URL fragments pointing
 * at the hosted viewer, and replaces the artifact placeholder in the markdown.
 *
 * Usage:
 *   printf '%s' "$markdown" | node action/embed-treemaps.ts \
 *     --treemap-dir <dir> --report <path> --run-url <url>
 */

import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {parseArgs} from 'node:util'
import {gzipSync} from 'node:zlib'

import type {Report} from '../src/types.ts'

const VIEWER_BASE = 'https://rexxars.github.io/bundle-stats/'
const MAX_ENCODED_LENGTH = 1_500_000
const BACKTICK = '`'
const PNPM_PATH_RE = /\/node_modules\/\.pnpm\/[^/]+\/node_modules\//g

const {values} = parseArgs({
  options: {
    'treemap-dir': {type: 'string'},
    report: {type: 'string'},
    'run-url': {type: 'string'},
  },
  strict: true,
})

const treemapDir = values['treemap-dir']
const reportPath = values.report
const runUrl = values['run-url']

if (!treemapDir || !reportPath || !runUrl) {
  process.stderr.write('Usage: embed-treemaps.ts --treemap-dir <dir> --report <path> --run-url <url>\n')
  process.exit(2)
}

// Read markdown from stdin
let md = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) md += chunk

const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report

interface TreemapLink {
  label: string
  url: string
}

const links: TreemapLink[] = []
const oversized: string[] = []

for (const exp of report.exports) {
  if (!exp.bundledSize) continue

  const fname = (exp.key === '.' ? 'index' : exp.key.replace(/^\.\//, '').replace(/\//g, '-')) + '.html'
  const fpath = join(treemapDir, fname)
  if (!existsSync(fpath)) continue

  const html = readFileSync(fpath, 'utf8')
  const json = extractTreemapJson(html)
  if (!json) continue

  const compacted = compactTreemapData(json)
  const encoded = gzipSync(compacted).toString('base64url')
  if (encoded.length > MAX_ENCODED_LENGTH) {
    oversized.push(exp.key)
    continue
  }

  links.push({label: exp.key, url: `${VIEWER_BASE}#data=${encoded}`})
}

if (links.length > 0 || oversized.length > 0) {
  const parts: string[] = []

  if (links.length > 0) {
    const viewer =
      links.length === 1
        ? `[View treemap](${links[0].url})`
        : links.map((l) => `[${BACKTICK}${l.label}${BACKTICK}](${l.url})`).join(' \u00b7 ')
    parts.push(viewer)
  }

  if (oversized.length > 0) {
    const label =
      oversized.length === 1
        ? `${BACKTICK}${oversized[0]}${BACKTICK} treemap too large to embed`
        : `${oversized.length} treemaps too large to embed`
    parts.push(label)
  }

  parts.push(`[Artifacts](${runUrl})`)

  const treemapLine = `🗺️ ${parts.join(' · ')}`

  // Replace the placeholder with the treemap links
  md = md.replace('<!-- treemap-links -->', treemapLine)

  // Remove the now-redundant note from inside <details>
  md = md.replace(
    '- Treemap artifacts are attached to the CI run for detailed size analysis\n',
    '',
  )
} else {
  // No treemap links — remove the empty placeholder
  md = md.replace('<!-- treemap-links -->\n\n', '')
}

process.stdout.write(md)

/**
 * Extract the JSON string from a rollup-plugin-visualizer HTML file.
 * The data is embedded as `const data = <json>;\n`.
 */
function extractTreemapJson(html: string): string | undefined {
  const marker = 'const data = '
  const i = html.indexOf(marker)
  if (i < 0) return undefined

  const start = i + marker.length
  const end = html.indexOf(';\n', start)
  if (end < 0) return undefined

  return html.substring(start, end)
}

/**
 * Parse treemap JSON and strip fields not used by the viewer to reduce payload size.
 *
 * Removes:
 * - `env` — never read by viewer
 * - `version` — never read by viewer
 * - `nodeParts[uid].brotliLength` — always 0 (brotli disabled in our config)
 * - `nodeMetas[uid].imported` — never read (only `importedBy` is used)
 * - `nodeMetas[uid].isEntry` — not read by viewer
 * - `nodeMetas[uid].isExternal` — not read by viewer
 */
function compactTreemapData(json: string): string {
  const data = JSON.parse(json)

  delete data.env
  delete data.version

  for (const uid in data.nodeParts) {
    delete data.nodeParts[uid].brotliLength
  }

  for (const uid in data.nodeMetas) {
    const meta = data.nodeMetas[uid]
    delete meta.imported
    delete meta.isEntry
    delete meta.isExternal
    if (typeof meta.id === 'string') {
      meta.id = simplifyPnpmId(meta.id)
    }
  }

  simplifyPnpmPaths(data.tree)

  return JSON.stringify(data)
}

interface TreeNode {
  name: string
  children?: TreeNode[]
}

/**
 * Simplify pnpm's verbose `.pnpm/<pkg+version_hash>/node_modules/<pkg>/...` paths
 * to just `<pkg>/...` so treemap labels are readable.
 */
function simplifyPnpmPaths(node: TreeNode): void {
  if (!node.children) return

  for (const child of node.children) {
    if (child.name === 'node_modules/.pnpm') {
      simplifyPnpmChildren(child)
    } else {
      simplifyPnpmPaths(child)
    }
  }
}

function simplifyPnpmChildren(pnpmNode: TreeNode): void {
  if (!pnpmNode.children) return

  for (const child of pnpmNode.children) {
    const idx = child.name.indexOf('/node_modules/')
    if (idx !== -1) {
      child.name = child.name.slice(idx + '/node_modules/'.length)
    }
  }

  // Rename the parent from "node_modules/.pnpm" to just "node_modules"
  // since the children now have clean package names
  pnpmNode.name = 'node_modules'
}

/**
 * Simplify pnpm paths in nodeMeta `id` strings.
 * `/node_modules/.pnpm/<hash>/node_modules/@sanity/ui/dist/theme.mjs`
 * becomes `/node_modules/@sanity/ui/dist/theme.mjs`
 */
function simplifyPnpmId(id: string): string {
  return id.replace(PNPM_PATH_RE, '/node_modules/')
}
