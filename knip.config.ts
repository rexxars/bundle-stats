import type {KnipConfig} from 'knip'

export default {
  entry: ['bin/bundle-stats.ts', 'action/check-thresholds.ts', 'action/embed-treemaps.ts'],
  ignoreDependencies: ['@sanity/semantic-release-preset'],
} satisfies KnipConfig
