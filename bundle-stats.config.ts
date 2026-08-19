import {defineConfig} from './src/config-entry.ts'

export default defineConfig({
  packages: ['.'],
  concurrency: 2,
})
