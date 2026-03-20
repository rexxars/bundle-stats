<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.9.3](https://github.com/rexxars/bundle-stats/compare/v1.9.2...v1.9.3) (2026-03-20)

### Bug Fixes

- handle multi-package treemaps correctly in PR comments ([#10](https://github.com/rexxars/bundle-stats/issues/10)) ([3a9fd7d](https://github.com/rexxars/bundle-stats/commit/3a9fd7d4b71952061408a49e891a691caeeb2821))

## [1.9.2](https://github.com/rexxars/bundle-stats/compare/v1.9.1...v1.9.2) (2026-03-20)

### Bug Fixes

- always install deps to temp dir, skip symlink when node_modules exists ([#9](https://github.com/rexxars/bundle-stats/issues/9)) ([eff76c0](https://github.com/rexxars/bundle-stats/commit/eff76c0292908407ef9576cf8ee8709a9bc60148))

## [1.9.1](https://github.com/rexxars/bundle-stats/compare/v1.9.0...v1.9.1) (2026-03-20)

### Bug Fixes

- use symlink for ESM module resolution instead of NODE_PATH ([#8](https://github.com/rexxars/bundle-stats/issues/8)) ([e97f558](https://github.com/rexxars/bundle-stats/commit/e97f558bdfa20104f347d2a0e8974f29d74037a7))

## [1.9.0](https://github.com/rexxars/bundle-stats/compare/v1.8.1...v1.9.0) (2026-03-20)

### Features

- comment-based treemap embedding for large payloads ([#5](https://github.com/rexxars/bundle-stats/issues/5)) ([f250d1c](https://github.com/rexxars/bundle-stats/commit/f250d1cf38d432aae9e6bd96161d76659fefc380))

### Bug Fixes

- add @rollup/plugin-json to support JSON imports in bundles ([e1a959a](https://github.com/rexxars/bundle-stats/commit/e1a959ad256989b1e0b76d89188b4456f12b4558))
- handle multi-line imports in internal size measurement ([7fae7b4](https://github.com/rexxars/bundle-stats/commit/7fae7b46ac914763a6108019df3afd489748a741))

## [1.8.1](https://github.com/rexxars/bundle-stats/compare/v1.8.0...v1.8.1) (2026-03-19)

### Bug Fixes

- correct embed-treemaps script path and add error details to warning ([#1](https://github.com/rexxars/bundle-stats/issues/1)) ([0031181](https://github.com/rexxars/bundle-stats/commit/0031181c9241b3dfba6be166e626623e4346061f))

## [1.8.0](https://github.com/rexxars/bundle-stats/compare/v1.7.2...v1.8.0) (2026-03-19)

### Features

- add conditions input to GitHub Action ([a45adf3](https://github.com/rexxars/bundle-stats/commit/a45adf3ce7a58ad788e6df19286fd8cd0e46a75c))
- add export condition resolution support ([2563f07](https://github.com/rexxars/bundle-stats/commit/2563f07f9626870827abd806651c727aa5cc7575))
- match exports by key+condition in comparisons and formatters ([94b7e75](https://github.com/rexxars/bundle-stats/commit/94b7e75ea00d28136ad66021f45ce9bec86dc1b7))
- show fallback message for oversized treemaps, add compare tests ([ddc0171](https://github.com/rexxars/bundle-stats/commit/ddc0171d84f3fd47cd6ca687d6aec75fe8ebbde7))
- thread export conditions through bundler, report pipeline, and CLI ([c379230](https://github.com/rexxars/bundle-stats/commit/c379230065e1812f3e813d37ac8922b316afb0d6))

### Bug Fixes

- make bin/bundle-stats.js executable ([916e580](https://github.com/rexxars/bundle-stats/commit/916e580621192be65a0012130529a3bb421bd921))
- treemap embedding broken by const temporal dead zone ([a51d3e1](https://github.com/rexxars/bundle-stats/commit/a51d3e16290a91829a5e12f2c9c45d4022b1c923))

## [1.7.2](https://github.com/rexxars/bundle-stats/compare/v1.7.1...v1.7.2) (2026-03-06)

### Bug Fixes

- error on exports that cannot be resolved to files on disk ([d3c4d31](https://github.com/rexxars/bundle-stats/commit/d3c4d31e2284ed7fc7f3b66850730365290076e3))

## [1.7.1](https://github.com/rexxars/bundle-stats/compare/v1.7.0...v1.7.1) (2026-03-06)

### Bug Fixes

- use visual string width for CLI table column alignment ([216c1f2](https://github.com/rexxars/bundle-stats/commit/216c1f2b85e8f9aacd1dc3dffe445c20d74beab7))

## [1.7.0](https://github.com/rexxars/bundle-stats/compare/v1.6.1...v1.7.0) (2026-03-04)

### Features

- compact treemap data and use Node's resolver for exports ([6970618](https://github.com/rexxars/bundle-stats/commit/6970618e474f4fbfffc99628e710ebbed6858a6c))
- hoist treemap links above details and simplify pnpm paths ([0813611](https://github.com/rexxars/bundle-stats/commit/0813611f33586b171e819e55b92beac68afb1d8b))

### Bug Fixes

- add embed-treemaps.ts to knip entry points ([1d9deee](https://github.com/rexxars/bundle-stats/commit/1d9deee785e804c20064370a729f0f449a4069ee))
- gracefully handle fork PRs with read-only tokens ([fc1a7c5](https://github.com/rexxars/bundle-stats/commit/fc1a7c55bf681b3b578f88450a72356c72c966ab))

## [1.6.1](https://github.com/rexxars/bundle-stats/compare/v1.6.0...v1.6.1) (2026-03-04)

### Bug Fixes

- use temp file for PR comment body to avoid ARG_MAX limit ([0e00167](https://github.com/rexxars/bundle-stats/commit/0e001674a84a93f44ad9ce5269fd492ab452e396))

## [1.6.0](https://github.com/rexxars/bundle-stats/compare/v1.5.2...v1.6.0) (2026-03-04)

### Features

- hosted treemap viewer with one-click links in PR comments ([482c95e](https://github.com/rexxars/bundle-stats/commit/482c95edf866b2c81e1374c7b1ff8e21f008bf4b))

## [1.5.2](https://github.com/rexxars/bundle-stats/compare/v1.5.1...v1.5.2) (2026-03-04)

### Bug Fixes

- enable hidden file upload for treemap artifacts ([41c87ad](https://github.com/rexxars/bundle-stats/commit/41c87ad30a0184364d90f1043abfef42bdacf5cf))

## [1.5.1](https://github.com/rexxars/bundle-stats/compare/v1.5.0...v1.5.1) (2026-03-04)

### Bug Fixes

- use absolute paths for treemap artifact upload ([ca45a1f](https://github.com/rexxars/bundle-stats/commit/ca45a1f7d4c2cc8f13e5c0696743967d06083663))

## [1.5.0](https://github.com/rexxars/bundle-stats/compare/v1.4.0...v1.5.0) (2026-03-04)

### Features

- upload artifacts to github ([53b6d38](https://github.com/rexxars/bundle-stats/commit/53b6d3867d437c0de01829c42e2a4ba3ee7782a1))

## [1.4.0](https://github.com/rexxars/bundle-stats/compare/v1.3.2...v1.4.0) (2026-03-03)

### Features

- add internalRawSize delta to ExportDelta ([719e502](https://github.com/rexxars/bundle-stats/commit/719e502ac281626c9c454d5c20ad75460df4864b))
- rewrite markdown formatter to metric-rows layout ([67b1da3](https://github.com/rexxars/bundle-stats/commit/67b1da3501049422866863a3e4f4fc7dc95cf149))

## [1.3.2](https://github.com/rexxars/bundle-stats/compare/v1.3.1...v1.3.2) (2026-03-02)

### Bug Fixes

- wrapping in markdown tables ([04e477d](https://github.com/rexxars/bundle-stats/commit/04e477d10ff1a0aa7b39d278d9e82860468ecd66))

## [1.3.1](https://github.com/rexxars/bundle-stats/compare/v1.3.0...v1.3.1) (2026-03-02)

### Bug Fixes

- use HTML font color instead of LaTeX for markdown deltas, add tests ([689c7db](https://github.com/rexxars/bundle-stats/commit/689c7db67b5a4456a36119958bfbd95c4a7a49ab))

## [1.3.0](https://github.com/rexxars/bundle-stats/compare/v1.2.0...v1.3.0) (2026-03-02)

### Features

- use colored comparison lines for markdown delta formatting ([6377f73](https://github.com/rexxars/bundle-stats/commit/6377f73a37b2868691e8002646426f66a74585a4))

## [1.2.0](https://github.com/rexxars/bundle-stats/compare/v1.1.0...v1.2.0) (2026-03-02)

### Features

- add --compare-npm flag for comparing against published npm versions ([d9c97e9](https://github.com/rexxars/bundle-stats/commit/d9c97e9386f1ab26fa33b6a25ca12c74ec2f08fc))

### Bug Fixes

- remove unused export from MeasureNpmPackageOptions interface ([d813efd](https://github.com/rexxars/bundle-stats/commit/d813efd2b01f679a045a519188ffffc01f3e0bfe))

## [1.1.0](https://github.com/rexxars/bundle-stats/compare/v1.0.4...v1.1.0) (2026-03-02)

### Features

- add --ref-label flag for baseline identification in reports ([57ae8ca](https://github.com/rexxars/bundle-stats/commit/57ae8ca14f71cae7f6f446d4212c41885bb8e41d))

## [1.0.4](https://github.com/rexxars/bundle-stats/compare/v1.0.3...v1.0.4) (2026-03-02)

### Bug Fixes

- fetch refs before checkout, improve markdown table output ([4171f35](https://github.com/rexxars/bundle-stats/commit/4171f352c6257a1bdebb8bed0b4dc4b6c8c23150))

## [1.0.3](https://github.com/rexxars/bundle-stats/compare/v1.0.2...v1.0.3) (2026-03-02)

### Bug Fixes

- install runtime dependencies in GitHub Action ([a5d10d8](https://github.com/rexxars/bundle-stats/commit/a5d10d8d5e000d3ab4bf1fc572736be4aa291fea))

## [1.0.2](https://github.com/rexxars/bundle-stats/compare/v1.0.1...v1.0.2) (2026-03-02)

### Bug Fixes

- improve error reporting in CLI and GitHub Action ([bc15b04](https://github.com/rexxars/bundle-stats/commit/bc15b04a8f0b192b1e87ffba097e62d867e5a089))

## [1.0.1](https://github.com/rexxars/bundle-stats/compare/v1.0.0...v1.0.1) (2026-03-02)

### Bug Fixes

- invalid bin path ([734b2d0](https://github.com/rexxars/bundle-stats/commit/734b2d08e7d1fdda038b44fa441fb14c93363f42))
- missing prepublish step ([0db4705](https://github.com/rexxars/bundle-stats/commit/0db470569317ab80f3d1a6caa39e50756a791fdc))

## 1.0.0 (2026-03-02)

### Features

- add action.yml for composite GitHub Action ([624fc2b](https://github.com/rexxars/bundle-stats/commit/624fc2bb8b4e87b3330990de6ac8282caba1a1df))
- add build orchestration script ([e19d9e1](https://github.com/rexxars/bundle-stats/commit/e19d9e1cadc48ec7ec1f92601254e07fb85faf85))
- add main action orchestration script ([34cf5ed](https://github.com/rexxars/bundle-stats/commit/34cf5ed05940d39c03cb152bf0c542cfd48557f6))
- add PR comment management script ([5998549](https://github.com/rexxars/bundle-stats/commit/5998549a1e3cf49839b7efa2d7ed7528d6baba1d))
- add semantic-release automation with GitHub Action tag management ([f4233c9](https://github.com/rexxars/bundle-stats/commit/f4233c9f332c98794c1bb8f72bfd57e71e1b327f))
- add threshold check action script ([8ce9f38](https://github.com/rexxars/bundle-stats/commit/8ce9f38039bfce570cbced34e2820a8533f03acb))
- add threshold evaluation module with tests ([bb36545](https://github.com/rexxars/bundle-stats/commit/bb365458fa0f54b2d677ffdda7473f9a990c7881))
- add threshold value parser with tests ([ae388e5](https://github.com/rexxars/bundle-stats/commit/ae388e575bfc1cf94eb675c0684560ffd05e1819))
- add threshold violations markdown formatter ([be97527](https://github.com/rexxars/bundle-stats/commit/be975274951c50a593a5c078f44a4cf611e8bf50))
- add workspace resolution script ([d21f94b](https://github.com/rexxars/bundle-stats/commit/d21f94bebfe10f38adf8516bc47e7a967180fa91))
- initial version ([61bc7e6](https://github.com/rexxars/bundle-stats/commit/61bc7e63ae24da3c71399099b4fb16e5a2835649))

### Bug Fixes

- address code review findings for action scripts ([2834fd0](https://github.com/rexxars/bundle-stats/commit/2834fd0ad4c3cd4023290becb3d253815ffb3318))
- tighten parseValue regex to reject malformed numbers ([db40a39](https://github.com/rexxars/bundle-stats/commit/db40a39eb1832a4276b403e4b0323822479fa0ca))
