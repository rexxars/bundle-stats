# Contributing

## Releases

Add a Changeset for each user-facing change:

```bash
pnpm changeset
```

Merges to `main` update a version pull request. Merging that pull request validates and packs the package, publishes it through npm trusted publishing, creates the GitHub release, and moves the matching major action tag.

The repository must allow GitHub Actions to create pull requests. The npm package must also trust the `rexxars/bundle-stats` repository and `.github/workflows/release.yml` workflow. Publishing uses OIDC and does not require an npm token. npm attaches provenance to public packages published through this workflow.
