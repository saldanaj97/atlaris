#!/bin/sh
# Run pnpm with minimumReleaseAge skipped on main and hotfix/* only.
# Usage: sh scripts/ci/pnpm-release-age.sh <pnpm args...>
# Gates solely on the branch name and fails closed: an unknown branch keeps
# the strict rule from pnpm-workspace.yaml. Frozen installs and `pnpm fetch`
# re-check the lockfile against the policy, so every install needs this.
# Only pnpm_config_minimum_release_age works; npm_config_* and camelCase don't.
# A PR into any base other than main stays strict, so a hotfix/* merge-back into
# develop cannot land a version develop's strict installs would then reject.

branch="${CIRCLE_BRANCH:-}"
[ -n "$branch" ] || branch="${VERCEL_GIT_COMMIT_REF:-}"
[ -n "$branch" ] || branch="${WORKERS_CI_BRANCH:-}"
[ -n "$branch" ] || branch="${GITHUB_HEAD_REF:-}"
if [ -z "$branch" ] && [ "${GITHUB_REF_TYPE:-}" = "branch" ]; then
  branch="${GITHUB_REF_NAME:-}"
fi
[ -n "$branch" ] || branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"

base="${RELEASE_AGE_PR_BASE:-${GITHUB_BASE_REF:-}}"

skip=false
case "$branch" in
  main | hotfix/?*) skip=true ;;
esac
if [ -n "$base" ] && [ "$base" != "main" ]; then
  skip=false
fi

if [ "$skip" = true ]; then
  export pnpm_config_minimum_release_age=0
  echo "pnpm-release-age: skipping minimumReleaseAge for branch $branch" >&2
else
  unset pnpm_config_minimum_release_age PNPM_CONFIG_MINIMUM_RELEASE_AGE \
    pnpm_config_minimum_release_age_strict PNPM_CONFIG_MINIMUM_RELEASE_AGE_STRICT \
    npm_config_minimum_release_age NPM_CONFIG_MINIMUM_RELEASE_AGE
  echo "pnpm-release-age: enforcing minimumReleaseAge for branch ${branch:-unknown}${base:+ (PR into $base)}" >&2
fi

exec pnpm "$@"
