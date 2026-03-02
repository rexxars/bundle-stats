<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
