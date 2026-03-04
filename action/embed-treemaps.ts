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
  if (encoded.length > MAX_ENCODED_LENGTH) continue

  links.push({label: exp.key, url: `${VIEWER_BASE}#data=${encoded}`})
}

if (links.length > 0) {
  const viewer =
    links.length === 1
      ? `[View treemap](${links[0].url})`
      : links.map((l) => `[${BACKTICK}${l.label}${BACKTICK}](${l.url})`).join(' \u00b7 ')

  md = md.replace(
    'Treemap artifacts are attached to the CI run for detailed size analysis',
    `${viewer} \u00b7 [Artifacts](${runUrl})`,
  )
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
    delete data.nodeMetas[uid].imported
    delete data.nodeMetas[uid].isEntry
    delete data.nodeMetas[uid].isExternal
  }

  return JSON.stringify(data)
}
