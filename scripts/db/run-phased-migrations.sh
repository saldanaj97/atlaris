#!/usr/bin/env bash

set -euo pipefail

readonly ARCHIVE_VERSION='20260706221000'
readonly DROP_VERSION='20260706222017'
readonly CONTRACT_CONFIRMATION_VALUE='post-deploy-health-verified'
readonly -a EXPAND_MIGRATIONS=(
  supabase/migrations/0036_add_learning_activity_events.sql
  supabase/migrations/20260804160000_revoke_task_progress_delete.sql
  supabase/migrations/0037_add_user_analytics_timezone.sql
  supabase/migrations/20260703181947_create_user_preferences_foundation.sql
  supabase/migrations/20260706201202_create_clerk_billing_webhook_events.sql
  supabase/migrations/20260706221000_archive_legacy_stripe_entitlements.sql
  supabase/migrations/20260710151930_create_email_notification_delivery_runs.sql
  supabase/migrations/20260809190000_create_email_notification_deliveries.sql
  supabase/migrations/20260810120000_create_clerk_webhook_event_claims.sql
)

declare -A APPLIED_VERSIONS=()

load_applied_versions() {
  local query_output
  local version

  query_output="$(supabase db query --linked --output csv \
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')"

  while IFS= read -r version; do
    version="${version//$'\r'/}"
    if [[ -z "$version" || "$version" == 'version' ]]; then
      continue
    fi
    if [[ ! "$version" =~ ^[0-9]+$ ]]; then
      printf 'Unexpected migration version from remote history: %s\n' "$version" >&2
      exit 1
    fi
    APPLIED_VERSIONS["$version"]=1
  done <<< "$query_output"
}

require_archive_recovery_if_drop_already_ran() {
  if [[ -n "${APPLIED_VERSIONS[$DROP_VERSION]:-}" && -z "${APPLIED_VERSIONS[$ARCHIVE_VERSION]:-}" ]]; then
    printf '%s\n' \
      'The legacy Stripe columns were dropped before their archive migration was recorded.' \
      'Restore a pre-drop backup in an isolated database, export and verify the legacy identities,' \
      'then import the archive and repair version 20260706221000 before retrying.' >&2
    exit 1
  fi
}

apply_expand_migrations() {
  local migration
  local migration_workspace
  local migrations_dir
  local version
  local -a matches

  load_applied_versions
  require_archive_recovery_if_drop_already_ran

  migration_workspace="$(mktemp -d)"
  trap "rm -rf -- '$migration_workspace'" EXIT
  migrations_dir="$migration_workspace/supabase/migrations"
  mkdir -p "$migrations_dir"
  cp supabase/config.toml "$migration_workspace/supabase/config.toml"

  shopt -s nullglob
  for version in "${!APPLIED_VERSIONS[@]}"; do
    matches=(supabase/migrations/"${version}"_*.sql)
    if (( ${#matches[@]} != 1 )); then
      printf 'Expected one local migration file for applied version %s, found %s.\n' \
        "$version" "${#matches[@]}" >&2
      exit 1
    fi
    cp "${matches[0]}" "$migrations_dir/"
  done

  # ponytail: keep the predeploy set explicit until migrations carry phase metadata.
  for migration in "${EXPAND_MIGRATIONS[@]}"; do
    cp "$migration" "$migrations_dir/"
  done

  supabase link --project-ref "$SUPABASE_PROJECT_ID" --workdir "$migration_workspace"
  supabase migration up --linked --include-all --yes --workdir "$migration_workspace"
}

apply_contract_migrations() {
  if [[ "${CONTRACT_CONFIRMATION:-}" != "$CONTRACT_CONFIRMATION_VALUE" ]]; then
    printf 'Contract migrations require post-deploy health verification.\n' >&2
    exit 1
  fi

  load_applied_versions
  require_archive_recovery_if_drop_already_ran
  if [[ -z "${APPLIED_VERSIONS[$ARCHIVE_VERSION]:-}" ]]; then
    printf 'Apply and verify the legacy Stripe archive before contract migrations.\n' >&2
    exit 1
  fi

  # db push applies the contract-only cleanup repair after any out-of-order legacy
  # migration that recreates cleanup_retained_db_rows without claim retention.
  supabase db push --include-all
}

case "${MIGRATION_PHASE:-}" in
  expand)
    apply_expand_migrations
    ;;
  contract)
    apply_contract_migrations
    ;;
  *)
    printf 'MIGRATION_PHASE must be expand or contract.\n' >&2
    exit 1
    ;;
esac
