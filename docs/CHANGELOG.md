# Changelog

## Unreleased

- CircleCI `ci-pr` now runs `pnpm build` as the required `build` check (docs-only and empty-diff pipelines report it through no-op aliases), and Vercel builds Preview for `develop` (staging) and `hotfix/*` branches (so hotfix PRs into `main` still get the required Vercel status) and Production for `main`; feature branches get no Vercel deployment.
- Vercel is now the sole Next.js build/deployment owner and a required GitHub status; the duplicate CircleCI `pnpm build` job and no-op aliases are removed while the six CircleCI code/test gates remain required.
- PR merge CI is CircleCI `ci-pr` (`.circleci/config.yml`). GitHub Actions `.github/workflows/ci-pr.yml` is removed. `develop` → `main` PRs require a CircleCI GitHub App `pull_request` trigger in project settings.
- Trunk post-merge CI is CircleCI `ci-trunk` on push to `develop`/`main` (keep the GitHub App **All pushes** trigger). GitHub Actions `.github/workflows/ci-trunk.yml` is removed.
- Removed `withServerComponentContext()`. Server components use `requestBoundary.component()` (`runServerComponentContext` is internal to that path). See `docs/architecture/auth-and-data-layer.md`.
