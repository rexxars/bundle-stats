import {defineConfig} from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  target: 'node24',
  dts: true,
  clean: true,
  splitting: true,
})
