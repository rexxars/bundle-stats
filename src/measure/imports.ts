import {execFileSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'

import type {ImportResult} from '../types.ts'

/**
 * Walk up from `startDir` collecting directories the child process needs to read.
 *
 * For standalone projects this finds the package dir + its node_modules.
 * For monorepos, node_modules often contains symlinks to sibling packages
 * whose real paths live outside node_modules (e.g. packages/@sanity/util).
 * When we detect a workspace root we allow the entire root so that resolved
 * symlink targets are readable too.
 */
function findReadablePaths(startDir: string): string[] {
  const paths: string[] = [startDir + path.sep]
  let dir = path.resolve(startDir)
  while (dir !== path.dirname(dir)) {
    const nm = path.join(dir, 'node_modules')
    if (existsSync(nm)) {
      paths.push(nm + path.sep)
    }
    if (isWorkspaceRoot(dir)) {
      // Allow the entire workspace root — this covers symlinked sibling
      // packages that live outside node_modules (e.g. packages/*).
      paths.push(dir + path.sep)
      break
    }
    dir = path.dirname(dir)
  }
  return paths
}

/** Check if a directory is a workspace/monorepo root. */
function isWorkspaceRoot(dir: string): boolean {
  // pnpm
  if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return true
  // npm / yarn — check for "workspaces" in package.json
  const pkgPath = path.join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.workspaces) return true
    } catch {
      // ignore parse errors
    }
  }
  return false
}

interface BenchmarkOptions {
  /** Number of runs per export */
  runs: number
  /** Delay between runs in ms */
  delayMs: number
  /** Number of outliers to trim from each end */
  trimCount: number
  /** Working directory for the child process (should be the package dir) */
  cwd: string
}

const DEFAULT_OPTIONS: BenchmarkOptions = {
  runs: 10,
  delayMs: 200,
  trimCount: 2,
  cwd: process.cwd(),
}

export async function measureImportTime(
  specifier: string,
  options?: Partial<BenchmarkOptions>,
): Promise<ImportResult> {
  const opts = {...DEFAULT_OPTIONS, ...options}
  const times: number[] = []
  let lastError: string | null = null

  for (let i = 0; i < opts.runs; i++) {
    if (i > 0) {
      await sleep(opts.delayMs)
    }
    const result = runSingleImport(specifier, opts.cwd)
    if (typeof result === 'number') {
      times.push(result)
    } else {
      lastError = result.error
    }
  }

  if (times.length === 0) {
    return {medianMs: 0, runs: [], failed: true, error: lastError}
  }

  // Sort and trim outliers
  const sorted = [...times].sort((a, b) => a - b)
  const trimmed =
    sorted.length > opts.trimCount * 2
      ? sorted.slice(opts.trimCount, sorted.length - opts.trimCount)
      : sorted

  const medianMs = median(trimmed)

  return {medianMs, runs: trimmed, failed: false, error: null}
}

function runSingleImport(specifier: string, cwd: string): number | {error: string} {
  const script = `
    const s = performance.now();
    await import(${JSON.stringify(specifier)});
    process.stdout.write(String(performance.now() - s));
  `
  // Resolve readable paths for --allow-fs-read scoping.
  // The child process needs to read:
  // 1. The package directory itself
  // 2. All node_modules/ directories found walking up from the package
  //    (covers both standalone and monorepo layouts)
  // Node v24 requires separate --allow-fs-read flags (comma-separated is deprecated).
  // Trailing slash grants recursive read access to directories.
  const absCwd = path.resolve(cwd)
  const readablePaths = findReadablePaths(absCwd)

  try {
    const result = execFileSync(
      'node',
      [
        '--permission',
        ...readablePaths.map((p) => `--allow-fs-read=${p}`),
        '--input-type=module',
        '-e',
        script,
      ],
      {
        cwd: absCwd,
        env: {...process.env, NODE_NO_WARNINGS: '1', NODE_OPTIONS: ''},
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    )
    return parseFloat(result.trim())
  } catch (err) {
    // stderr is captured via stdio: 'pipe' so it won't leak to the terminal.
    // Extract a short, meaningful error message from the child process stderr.
    const stderr =
      err && typeof err === 'object' && 'stderr' in err ? String(err.stderr).trim() : ''
    const message = summarizeError(stderr) || (err instanceof Error ? err.message : String(err))
    return {error: message}
  }
}

/**
 * Extract a short error summary from a (potentially long) stderr string.
 * Looks for common Node error patterns and returns just the message line.
 *
 * For permission errors (ERR_ACCESS_DENIED), Node prints the denied path
 * in a `resource: '/some/path'` property on the error object. We extract
 * that to produce a message like "FileSystemRead denied: /some/path".
 */
function summarizeError(stderr: string): string {
  if (!stderr) return ''

  // Permission denial — extract the resource path for a useful message
  const permMatch = stderr.match(/permission: '(\w+)'/)
  const resourceMatch = stderr.match(/resource: '([^']+)'/)
  if (permMatch && resourceMatch) {
    return `${permMatch[1]} denied: ${resourceMatch[1]}`
  }

  // Match "Error: <message>" or "TypeError: <message>" etc.
  const match = stderr.match(/^\w*Error:\s*(.+)$/m)
  if (match) return match[0]
  // Fallback: first non-empty line
  const first = stderr.split('\n').find((l) => l.trim())
  return first?.trim() ?? ''
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
