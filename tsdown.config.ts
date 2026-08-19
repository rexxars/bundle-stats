import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    config: 'src/config-entry.ts',
    index: 'src/index.ts',
  },
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  target: 'node24',
  dts: true,
  clean: true,
  sourcemap: true,
  publint: true,
})
