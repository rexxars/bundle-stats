// @env node

import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {gzipSync} from 'node:zlib'

import {rolldown} from 'rolldown'
import {visualizer} from 'rollup-plugin-visualizer'

import type {BundlePlatform, BundleResult, Scenario} from '../types.ts'

interface BundleOptions {
  scenario: Scenario
  externals: string[]
  outdir: string
  platform: BundlePlatform
  conditions: string[]
}

export async function measureBundle(options: BundleOptions): Promise<BundleResult> {
  const {scenario, externals, outdir, platform, conditions} = options
  mkdirSync(outdir, {recursive: true})
  const treemapPath = resolve(outdir, `${scenarioFilename(scenario)}.html`)
  const external = [
    /\.node$/,
    ...externals.map((dependency) => new RegExp(`^${escapeRegExp(dependency)}(?:/|$)`)),
  ]

  const bundle = await rolldown({
    input: scenario.input,
    external,
    platform,
    resolve: {
      conditionNames: conditions,
      mainFields: platform === 'browser' ? ['browser', 'module', 'main'] : ['module', 'main'],
    },
    plugins: [
      visualizer({
        filename: treemapPath,
        template: 'treemap',
        gzipSize: true,
        title: `Bundle Treemap: ${scenario.name}`,
      }),
    ],
    logLevel: 'silent',
  })

  try {
    const generated = await bundle.generate({format: 'esm', codeSplitting: false})
    const code = generated.output
      .filter((output) => output.type === 'chunk')
      .map((output) => output.code)
      .join('\n')

    return {
      rawBytes: Buffer.byteLength(code, 'utf8'),
      gzipBytes: gzipSync(code).length,
      treemapPath,
    }
  } finally {
    await bundle.close()
  }
}

function scenarioFilename(scenario: Scenario): string {
  return scenario.id.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
