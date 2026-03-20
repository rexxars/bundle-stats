#!/usr/bin/env node

/**
 * Embed treemap viewer links into bundle-stats markdown output.
 *
 * Reads markdown from stdin. For each package report + treemap directory pair,
 * compacts treemap data and embeds it using a tiered strategy:
 *
 * 1. Small payloads (<=4K encoded): inline in URL fragment (#data=...)
 * 2. Large payloads + public repo: hidden HTML comment in markdown body,
 *    viewer link points to comment via GitHub API (#comment=...&export=...)
 * 3. Large payloads + private repo: artifact link only
 *
 * Usage:
 *   printf '%s' "$markdown" | node action/embed-treemaps.ts \
 *     --treemap-dir <dir> --report <path> \
 *     [--treemap-dir <dir2> --report <path2> ...] \
 *     --run-url <url> --comment-id <id> --repo <owner/repo> \
 *     --visibility <public|private|internal>
 */

import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {parseArgs} from 'node:util'
import {gzipSync} from 'node:zlib'

import type {Report} from '../src/types.ts'

const VIEWER_BASE = 'https://rexxars.github.io/bundle-stats/'

// GitHub enforces a 4,096-char limit on markdown link URLs.
// https://github.com/orgs/community/discussions/48174
// The viewer base URL is ~49 chars, leaving ~4,047 for the encoded payload.
const MAX_INLINE_LENGTH = 4_000

// GitHub comment body limit is 262,144 chars. Reserve margin for the visible
// markdown content and leave the rest for hidden treemap data blocks.
const MAX_COMMENT_BODY = 250_000

const BACKTICK = '`'
const PNPM_PATH_RE = /\/node_modules\/\.pnpm\/[^/]+\/node_modules\//g

const {values} = parseArgs({
  options: {
    'treemap-dir': {type: 'string', multiple: true},
    report: {type: 'string', multiple: true},
    'run-url': {type: 'string'},
    'comment-id': {type: 'string'},
    repo: {type: 'string'},
    visibility: {type: 'string', default: 'public'},
  },
  strict: true,
})

const treemapDirs = values['treemap-dir'] ?? []
const reportPaths = values.report ?? []
const runUrl = values['run-url']
const commentId = values['comment-id']
const repo = values.repo
const visibility = values.visibility ?? 'public'

if (treemapDirs.length === 0 || reportPaths.length === 0 || !runUrl) {
  process.stderr.write(
    'Usage: embed-treemaps.ts --treemap-dir <dir> --report <path> [...] --run-url <url> --comment-id <id> --repo <owner/repo> --visibility <vis>\n',
  )
  process.exit(2)
}

if (treemapDirs.length !== reportPaths.length) {
  process.stderr.write('Each --treemap-dir must have a corresponding --report\n')
  process.exit(2)
}

// Read markdown from stdin
let md = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) md += chunk

const isPublic = visibility === 'public'
const commentApiUrl =
  commentId && repo
    ? `https://api.github.com/repos/${repo}/issues/comments/${commentId}`
    : undefined

interface TreemapLink {
  label: string
  url: string
}

interface TreemapEmbed {
  key: string
  encoded: string
}

const links: TreemapLink[] = []
const embeds: TreemapEmbed[] = []
const oversized: string[] = []

// Process all reports across all treemap dirs
for (let dirIdx = 0; dirIdx < treemapDirs.length; dirIdx++) {
  const treemapDir = treemapDirs[dirIdx]
  const reportPath = reportPaths[dirIdx]
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report

  for (const exp of report.exports) {
    if (!exp.bundledSize) continue

    const fname =
      (exp.key === '.' ? 'index' : exp.key.replace(/^\.\//, '').replace(/\//g, '-')) + '.html'
    const fpath = join(treemapDir, fname)
    if (!existsSync(fpath)) continue

    const html = readFileSync(fpath, 'utf8')
    const json = extractTreemapJson(html)
    if (!json) continue

    const compacted = compactTreemapData(json)
    const encoded = gzipSync(compacted).toString('base64url')

    if (encoded.length <= MAX_INLINE_LENGTH) {
      // Tier 1: small enough for inline URL
      links.push({label: exp.key, url: `${VIEWER_BASE}#data=${encoded}`})
    } else if (isPublic && commentApiUrl) {
      // Tier 2: embed in comment, link via API
      embeds.push({key: exp.key, encoded})
      const exportParam = encodeURIComponent(exp.key)
      const commentParam = encodeURIComponent(commentApiUrl)
      links.push({
        label: exp.key,
        url: `${VIEWER_BASE}#comment=${commentParam}&export=${exportParam}`,
      })
    } else {
      // Tier 3: too large and private/no comment ID — artifact fallback
      oversized.push(exp.key)
    }
  }
}

// Check total size budget for embeds
let totalEmbedSize = embeds.reduce((sum, e) => sum + e.encoded.length + e.key.length + 25, 0)
if (md.length + totalEmbedSize > MAX_COMMENT_BODY) {
  // Over budget — drop embeds from largest to smallest until we fit,
  // moving them to oversized
  const sorted = [...embeds].sort((a, b) => b.encoded.length - a.encoded.length)
  for (const embed of sorted) {
    if (md.length + totalEmbedSize <= MAX_COMMENT_BODY) break
    totalEmbedSize -= embed.encoded.length + embed.key.length + 25
    const idx = embeds.indexOf(embed)
    embeds.splice(idx, 1)
    // Remove corresponding link and add to oversized
    const linkIdx = links.findIndex(
      (l) =>
        l.url.includes(`export=${encodeURIComponent(embed.key)}`) && l.url.includes('comment='),
    )
    if (linkIdx >= 0) links.splice(linkIdx, 1)
    oversized.push(embed.key)
  }
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

// Append hidden data blocks for comment-embedded treemaps
if (embeds.length > 0) {
  md += '\n'
  for (const embed of embeds) {
    md += `\n<!-- treemap-data:${embed.key} ${embed.encoded} -->`
  }
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
