import type {KnipConfig} from 'knip'

export default {
  entry: ['bin/bundle-stats.ts', 'action/embed-treemaps.ts', 'bundle-stats.config.ts'],
} satisfies KnipConfig
