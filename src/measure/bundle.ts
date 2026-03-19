import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {gzipSync} from 'node:zlib'

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import {rollup} from 'rollup'
import {visualizer} from 'rollup-plugin-visualizer'

import type {ExportEntry, BundleResult} from '../types.ts'

interface BundleOptions {
  entry: ExportEntry
  externals: string[]
  outdir: string
  exportConditions?: string[]
}

export async function measureBundledSize(options: BundleOptions): Promise<BundleResult> {
  const {entry, externals, outdir} = options
  const baseName = entry.key === '.' ? 'index' : entry.key.replace(/^\.\//, '').replace(/\//g, '-')
  const conditionSuffix = entry.condition ? `.${entry.condition}` : ''
  const treemapFilename = `${baseName}${conditionSuffix}.html`
  const treemapPath = resolve(outdir, treemapFilename)

  mkdirSync(outdir, {recursive: true})

  const bundle = await rollup({
    input: entry.filePath,
    external: (id) => {
      // Externalize peer deps and anything matching them as a prefix
      if (externals.some((ext) => id === ext || id.startsWith(`${ext}/`))) return true
      return false
    },
    plugins: [
      (nodeResolve as any)({
        exportConditions: options.exportConditions ?? ['default', 'module', 'import'],
      }),
      (json as any)(),
      (commonjs as any)(),
      (visualizer as any)({
        filename: treemapPath,
        template: 'treemap',
        gzipSize: true,
        title: `Bundle Treemap: ${entry.name}`,
      }),
    ],
    // Silence noisy warnings from bundled node_modules
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
      if (warning.code === 'THIS_IS_UNDEFINED') return
      if (warning.plugin === 'node-resolve' && warning.message?.includes('preferring built-in'))
        return
      warn(warning)
    },
  })

  const {output} = await bundle.generate({
    format: 'es',
    inlineDynamicImports: true,
  })
  await bundle.close()

  // Sum up all chunk sizes
  let totalCode = ''
  for (const chunk of output) {
    if (chunk.type === 'chunk') {
      totalCode += chunk.code
    }
  }

  const rawBytes = Buffer.byteLength(totalCode, 'utf-8')
  const gzipBytes = gzipSync(totalCode).length

  return {rawBytes, gzipBytes, treemapPath}
}
