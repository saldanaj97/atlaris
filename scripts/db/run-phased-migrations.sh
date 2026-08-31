#!/usr/bin/env bash

set -euo pipefail

readonly ARCHIVE_VERSION='20260706221000'
readonly DROP_VERSION='20260706222017'
readonly CONTRACT_CONFIRMATION_VALUE='post-deploy-health-verified'
readonly -a EXPAND_MIGRATIONS=(
  supabase/migrations/0036_add_learning_activity_events.sql
  supabase/migrations/20260804160000_revoke_task_progress_delete.sql
  supabase/migrations/20260811100600_drop_task_progress_delete_policy.sql
  supabase/migrations/0037_add_user_analytics_timezone.sql
  supabase/migrations/20260703181947_create_user_preferences_foundation.sql
  supabase/migrations/20260706201202_create_clerk_billing_webhook_events.sql
  supabase/migrations/20260706221000_archive_legacy_stripe_entitlements.sql
  supabase/migrations/20260710151930_create_email_notification_delivery_runs.sql
  supabase/migrations/20260809190000_create_email_notification_deliveries.sql
  supabase/migrations/20260810120000_create_clerk_webhook_event_claims.sql
  supabase/migrations/20260811100100_add_clerk_user_identity_projection.sql
  supabase/migrations/20260811100200_enforce_resolved_email_delivery_payload_minimization.sql
  supabase/migrations/20260811100700_revoke_anon_unsafe_table_privileges.sql
  supabase/migrations/20260811100800_revoke_security_definer_execute.sql
  supabase/migrations/20260811100900_restrict_task_progress_update_columns.sql
  supabase/migrations/20260825151604_add_user_entitlement_fields.sql
  supabase/migrations/20260825153019_add_generation_attempt_purpose.sql
  supabase/migrations/20260826184123_expand_user_preferences_model_text_slots.sql
  supabase/migrations/20260828002855_add_clerk_billing_projection_watermark.sql
)

# Keep the users INSERT revoke contract-only until service-role provisioning is live.
readonly -a CONTRACT_MIGRATIONS=(
  supabase/migrations/0000_wonderful_guardian.sql
  supabase/migrations/0001_tearful_morlocks.sql
  supabase/migrations/0002_natural_rocket_racer.sql
  supabase/migrations/0003_graceful_zemo.sql
  supabase/migrations/0004_fix_security_policies.sql
  supabase/migrations/0005_clear_doctor_spectrum.sql
  supabase/migrations/0006_peaceful_the_santerians.sql
  supabase/migrations/0007_spooky_puppet_master.sql
  supabase/migrations/0008_furry_exiles.sql
  supabase/migrations/0009_empty_menace.sql
  supabase/migrations/0010_past_captain_universe.sql
  supabase/migrations/0011_extracted_context_pdf_shape_check.sql
  supabase/migrations/0012_composite_indexes.sql
  supabase/migrations/0013_generation_attempts_created_at_plan_id.sql
  supabase/migrations/0014_user_preferred_ai_model.sql
  supabase/migrations/0015_generation_status_pending_retry.sql
  supabase/migrations/0016_generation_attempts_rls_fix.sql
  supabase/migrations/0017_cancel_at_period_end_drop_plan_generations.sql
  supabase/migrations/0018_harden_users_update_columns.sql
  supabase/migrations/0019_snapshot_realignment.sql
  supabase/migrations/0020_burly_jackal.sql
  supabase/migrations/0021_majestic_puma.sql
  supabase/migrations/0022_melodic_satana.sql
  supabase/migrations/0023_phase3_ai_usage_provider_cost.sql
  supabase/migrations/0024_massive_scalphunter.sql
  supabase/migrations/0025_daily_bloodscream.sql
  supabase/migrations/0026_known_aaron_stack.sql
  supabase/migrations/0027_windy_agent_zero.sql
  supabase/migrations/0028_harden_job_queue_service_role_writes.sql
  supabase/migrations/0029_harden_job_queue_anonymous.sql
  supabase/migrations/0030_ambiguous_mauler.sql
  supabase/migrations/0031_grant_rls_role_privileges.sql
  supabase/migrations/0032_acoustic_lila_cheney.sql
  supabase/migrations/0033_flippant_nuke.sql
  supabase/migrations/0034_strong_marten_broadcloak.sql
  supabase/migrations/20260520194501_harden_authenticated_server_owned_writes.sql
  supabase/migrations/20260522223908_schedule_retention_cleanup.sql
  supabase/migrations/20260706222017_remove_legacy_stripe_entitlements.sql
  supabase/migrations/20260801120000_drop_user_preference_columns.sql
  supabase/migrations/20260810120100_restore_clerk_webhook_claim_retention.sql
  supabase/migrations/20260811100000_clear_module_lesson_generation_errors.sql
  supabase/migrations/20260811100300_scrub_resolved_email_delivery_payloads.sql
  supabase/migrations/20260811100400_revoke_users_authenticated_insert.sql
  supabase/migrations/20260811100500_revoke_users_authenticated_insert.sql
)

declare -A APPLIED_VERSIONS=()
declare -A EXPAND_SET=()
declare -A CONTRACT_SET=()
declare -a PENDING_EXPAND=()
declare -a PENDING_CONTRACT=()

extract_migration_version() {
  local migration_path="$1"
  local base="${migration_path##*/}"

  if [[ ! "$base" =~ ^([0-9]+)_[^/]+\.sql$ ]]; then
    printf 'Unable to extract migration version from %s\n' "$migration_path" >&2
    exit 1
  fi

  printf '%s\n' "${BASH_REMATCH[1]}"
}

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

attest_effective_privileges() {
  local phase="$1"

  bash scripts/db/attest-effective-privileges.sh "$phase"
}

validate_phase_manifest() {
  local migration

  EXPAND_SET=()
  CONTRACT_SET=()

  for migration in "${EXPAND_MIGRATIONS[@]}"; do
    if [[ ! -f "$migration" ]]; then
      printf 'EXPAND_MIGRATIONS references missing file: %s\n' "$migration" >&2
      exit 1
    fi
    if [[ -n "${EXPAND_SET[$migration]:-}" ]]; then
      printf 'Duplicate EXPAND_MIGRATIONS entry: %s\n' "$migration" >&2
      exit 1
    fi
    EXPAND_SET["$migration"]=1
  done

  for migration in "${CONTRACT_MIGRATIONS[@]}"; do
    if [[ ! -f "$migration" ]]; then
      printf 'CONTRACT_MIGRATIONS references missing file: %s\n' "$migration" >&2
      exit 1
    fi
    if [[ -n "${CONTRACT_SET[$migration]:-}" ]]; then
      printf 'Duplicate CONTRACT_MIGRATIONS entry: %s\n' "$migration" >&2
      exit 1
    fi
    if [[ -n "${EXPAND_SET[$migration]:-}" ]]; then
      printf 'Migration is classified as both expand and contract: %s\n' "$migration" >&2
      exit 1
    fi
    CONTRACT_SET["$migration"]=1
  done
}

collect_pending_migrations() {
  local migration
  local version
  local in_expand
  local in_contract

  PENDING_EXPAND=()
  PENDING_CONTRACT=()

  shopt -s nullglob
  for migration in supabase/migrations/*.sql; do
    version="$(extract_migration_version "$migration")"
    if [[ -n "${APPLIED_VERSIONS[$version]:-}" ]]; then
      continue
    fi

    in_expand=0
    in_contract=0
    if [[ -n "${EXPAND_SET[$migration]:-}" ]]; then
      in_expand=1
    fi
    if [[ -n "${CONTRACT_SET[$migration]:-}" ]]; then
      in_contract=1
    fi

    if (( in_expand + in_contract == 0 )); then
      printf 'Unclassified pending migration: %s\n' "$migration" >&2
      exit 1
    fi
    if (( in_expand + in_contract != 1 )); then
      printf 'Migration is classified as both expand and contract: %s\n' "$migration" >&2
      exit 1
    fi

    if (( in_expand )); then
      PENDING_EXPAND+=("$migration")
    else
      PENDING_CONTRACT+=("$migration")
    fi
  done
  shopt -u nullglob
}

apply_phase_workspace() {
  local migration
  local migration_workspace
  local migrations_dir
  local version
  local -a matches
  local -a pending=("$@")

  if [[ ! -f supabase/config.toml ]]; then
    printf 'Missing supabase/config.toml\n' >&2
    exit 1
  fi

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
  shopt -u nullglob

  for migration in "${pending[@]}"; do
    cp "$migration" "$migrations_dir/"
  done

  supabase link --project-ref "$SUPABASE_PROJECT_ID" --workdir "$migration_workspace"
  supabase migration up --linked --include-all --yes --workdir "$migration_workspace"
}

apply_expand_migrations() {
  load_applied_versions
  require_archive_recovery_if_drop_already_ran
  validate_phase_manifest
  collect_pending_migrations
  apply_phase_workspace "${PENDING_EXPAND[@]}"
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

  validate_phase_manifest
  collect_pending_migrations

  if (( ${#PENDING_EXPAND[@]} > 0 )); then
    printf 'Contract migrations cannot run while expand migrations are still pending:\n' >&2
    printf '%s\n' "${PENDING_EXPAND[@]}" >&2
    exit 1
  fi

  apply_phase_workspace "${PENDING_CONTRACT[@]}"
}

case "${MIGRATION_PHASE:-}" in
  expand)
    apply_expand_migrations
    attest_effective_privileges expand
    ;;
  contract)
    apply_contract_migrations
    attest_effective_privileges contract
    ;;
  *)
    printf 'MIGRATION_PHASE must be expand or contract.\n' >&2
    exit 1
    ;;
esac
