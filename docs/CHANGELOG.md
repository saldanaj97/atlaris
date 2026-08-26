# Changelog

## Unreleased

- PR merge CI is CircleCI `ci-pr` (`.circleci/config.yml`). GitHub Actions `.github/workflows/ci-pr.yml` is removed. `develop` → `main` PRs require a CircleCI GitHub App `pull_request` trigger in project settings.
- Trunk post-merge CI is CircleCI `ci-trunk` on push to `develop`/`main` (keep the GitHub App **All pushes** trigger). GitHub Actions `.github/workflows/ci-trunk.yml` is removed.
- Deprecated `withServerComponentContext()` in favor of `requestBoundary.component()`. See `docs/architecture/auth-and-data-layer.md` for the request-boundary migration path. The compatibility shim remains available for now and is planned for removal in v2.0.
