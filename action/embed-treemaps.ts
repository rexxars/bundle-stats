#!/usr/bin/env node

// @env node

import {existsSync, readFileSync} from 'node:fs'
import {parseArgs} from 'node:util'
import {gzipSync} from 'node:zlib'

import {readReport} from '../src/report.ts'

const VIEWER_BASE = 'https://rexxars.github.io/bundle-stats/'
const MAX_INLINE_LENGTH = 4_000
const MAX_COMMENT_BODY = 250_000
const BACKTICK = '`'
const PNPM_PATH_RE = /\/node_modules\/\.pnpm\/[^/]+\/node_modules\//g

const {values} = parseArgs({
  options: {
    report: {type: 'string', multiple: true},
    'run-url': {type: 'string'},
    'comment-id': {type: 'string'},
    repo: {type: 'string'},
    visibility: {type: 'string', default: 'public'},
  },
  strict: true,
})

const reportPaths = values.report ?? []
const runUrl = values['run-url']
const commentId = values['comment-id']
const repo = values.repo
const visibility = values.visibility ?? 'public'

if (reportPaths.length === 0 || !runUrl) {
  process.stderr.write(
    'Usage: embed-treemaps.ts --report <path> [...] --run-url <url> ' +
      '--comment-id <id> --repo <owner/repo> --visibility <visibility>\n',
  )
  process.exit(2)
}

let markdown = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) markdown += chunk

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

for (const reportPath of reportPaths) {
  const report = readReport(reportPath)
  for (const pkg of report.packages) {
    for (const result of pkg.scenarios) {
      const treemapPath = result.bundle?.treemapPath
      if (!treemapPath || !existsSync(treemapPath)) continue
      const json = extractTreemapJson(readFileSync(treemapPath, 'utf8'))
      if (!json) continue

      const encoded = gzipSync(compactTreemapData(json)).toString('base64url')
      const key = `${pkg.name}:${result.scenario.id}`
      const label = `${pkg.name} / ${result.scenario.name}`
      if (encoded.length <= MAX_INLINE_LENGTH) {
        links.push({label, url: `${VIEWER_BASE}#data=${encoded}`})
      } else if (isPublic && commentApiUrl) {
        embeds.push({key, encoded})
        links.push({
          label,
          url:
            `${VIEWER_BASE}#comment=${encodeURIComponent(commentApiUrl)}` +
            `&export=${encodeURIComponent(key)}`,
        })
      } else {
        oversized.push(label)
      }
    }
  }
}

let totalEmbedSize = embeds.reduce(
  (sum, embed) => sum + embed.encoded.length + embed.key.length + 25,
  0,
)
for (const embed of [...embeds].sort((left, right) => right.encoded.length - left.encoded.length)) {
  if (markdown.length + totalEmbedSize <= MAX_COMMENT_BODY) break
  const embedIndex = embeds.indexOf(embed)
  if (embedIndex >= 0) embeds.splice(embedIndex, 1)
  totalEmbedSize -= embed.encoded.length + embed.key.length + 25
  const exportParameter = encodeURIComponent(embed.key)
  const linkIndex = links.findIndex((link) => link.url.includes(`export=${exportParameter}`))
  if (linkIndex >= 0) {
    oversized.push(links[linkIndex].label)
    links.splice(linkIndex, 1)
  }
}

markdown = markdown.replace('<!-- treemap-links -->', formatLinks(links, oversized, runUrl))
if (embeds.length > 0) {
  markdown += '\n'
  for (const embed of embeds) {
    markdown += `\n<!-- treemap-data:${embed.key} ${embed.encoded} -->`
  }
}

process.stdout.write(markdown)

function formatLinks(
  treemapLinks: TreemapLink[],
  oversizedTreemaps: string[],
  artifactUrl: string,
): string {
  const parts: string[] = []
  if (treemapLinks.length === 1) {
    parts.push(`[View treemap](${treemapLinks[0].url})`)
  } else if (treemapLinks.length > 1) {
    parts.push(
      treemapLinks.map((link) => `[${BACKTICK}${link.label}${BACKTICK}](${link.url})`).join(' · '),
    )
  }
  if (oversizedTreemaps.length === 1) {
    parts.push(`${BACKTICK}${oversizedTreemaps[0]}${BACKTICK} is too large to embed`)
  } else if (oversizedTreemaps.length > 1) {
    parts.push(`${oversizedTreemaps.length} treemaps are too large to embed`)
  }
  parts.push(`[Artifacts](${artifactUrl})`)
  return `🗺️ ${parts.join(' · ')}`
}

function extractTreemapJson(html: string): string | undefined {
  const marker = 'const data = '
  const startMarker = html.indexOf(marker)
  if (startMarker < 0) return undefined
  const start = startMarker + marker.length
  const end = html.indexOf(';\n', start)
  return end < 0 ? undefined : html.substring(start, end)
}

function compactTreemapData(json: string): string {
  const value: unknown = JSON.parse(json)
  if (!isTreemapData(value)) return json
  delete value.env
  delete value.version

  for (const part of Object.values(value.nodeParts)) delete part.brotliLength
  for (const metadata of Object.values(value.nodeMetas)) {
    delete metadata.imported
    delete metadata.isEntry
    delete metadata.isExternal
    if (typeof metadata.id === 'string') metadata.id = simplifyPnpmId(metadata.id)
  }
  simplifyPnpmPaths(value.tree)
  return JSON.stringify(value)
}

interface TreemapPart {
  brotliLength?: unknown
}

interface TreemapMetadata {
  id?: unknown
  imported?: unknown
  isEntry?: unknown
  isExternal?: unknown
}

interface TreeNode {
  name: string
  children?: TreeNode[]
}

interface TreemapData {
  env?: unknown
  version?: unknown
  nodeParts: Record<string, TreemapPart>
  nodeMetas: Record<string, TreemapMetadata>
  tree: TreeNode
}

function isTreemapData(value: unknown): value is TreemapData {
  if (!isRecord(value) || !isRecord(value.nodeParts) || !isRecord(value.nodeMetas)) return false
  return isTreeNode(value.tree)
}

function isTreeNode(value: unknown): value is TreeNode {
  if (!isRecord(value) || typeof value.name !== 'string') return false
  if (value.children === undefined) return true
  return Array.isArray(value.children) && value.children.every(isTreeNode)
}

function simplifyPnpmPaths(node: TreeNode): void {
  if (!node.children) return
  for (const child of node.children) {
    if (child.name === 'node_modules/.pnpm') simplifyPnpmChildren(child)
    else simplifyPnpmPaths(child)
  }
}

function simplifyPnpmChildren(node: TreeNode): void {
  if (!node.children) return
  for (const child of node.children) {
    const index = child.name.indexOf('/node_modules/')
    if (index !== -1) child.name = child.name.slice(index + '/node_modules/'.length)
  }
  node.name = 'node_modules'
}

function simplifyPnpmId(id: string): string {
  return id.replace(PNPM_PATH_RE, '/node_modules/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
