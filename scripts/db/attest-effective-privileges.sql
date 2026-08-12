-- Read-only deployment gate for the privileges actually effective for browser roles.
DO $$
DECLARE
  violation text;
  migration_phase text := current_setting('app.atlaris_migration_phase', true);
  users_update_columns text[] := ARRAY['name', 'updated_at'];
  task_progress_update_columns text[] := ARRAY['status', 'completed_at', 'updated_at'];
BEGIN
  IF migration_phase IS NULL OR migration_phase NOT IN ('expand', 'contract') THEN
    RAISE EXCEPTION 'attestation phase must be expand or contract';
  END IF;

  IF migration_phase = 'expand'
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns AS legacy_column
      WHERE legacy_column.table_schema = 'public'
        AND legacy_column.table_name = 'users'
        AND legacy_column.column_name = 'preferred_ai_model'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns AS legacy_column
      WHERE legacy_column.table_schema = 'public'
        AND legacy_column.table_name = 'users'
        AND legacy_column.column_name = 'analytics_timezone'
    ) THEN
    users_update_columns := ARRAY[
      'name',
      'preferred_ai_model',
      'analytics_timezone',
      'updated_at'
    ];
  END IF;

  SELECT format('role %I is missing, superuser, or bypasses RLS', expected.role_name)
    INTO violation
  FROM (VALUES ('anon'), ('authenticated')) AS expected(role_name)
  LEFT JOIN pg_roles AS role ON role.rolname = expected.role_name
  WHERE role.oid IS NULL OR role.rolsuper OR role.rolbypassrls
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  SELECT format(
      'permissive policy %I on public.%I includes %I',
      policy.policyname,
      policy.tablename,
      policy_role.role_name
    )
    INTO violation
  FROM pg_policies AS policy
  CROSS JOIN LATERAL unnest(policy.roles) AS policy_role(role_name)
  WHERE policy.schemaname = 'public'
    AND policy.permissive = 'PERMISSIVE'
    AND lower(policy_role.role_name::text) IN ('public', 'anon')
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH application_tables AS (
    SELECT class.oid, class.relname, class.relrowsecurity
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = class.oid
          AND dependency.deptype = 'e'
      )
  )
  SELECT format('public table %I does not have RLS enabled', relname)
    INTO violation
  FROM application_tables
  WHERE NOT relrowsecurity
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH application_tables AS (
    SELECT class.oid, class.relname
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = class.oid
          AND dependency.deptype = 'e'
      )
  ), forbidden_privileges AS (
    SELECT unnest(
      ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    ) AS privilege_type
  )
  SELECT format('anon has %s on public.%I', privilege_type, relname)
    INTO violation
  FROM application_tables
  CROSS JOIN forbidden_privileges
  WHERE has_table_privilege('anon', oid, privilege_type)
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH application_tables AS (
    SELECT class.oid, class.relname
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = class.oid
          AND dependency.deptype = 'e'
      )
  ), column_privileges AS (
    SELECT unnest(ARRAY['INSERT', 'UPDATE', 'REFERENCES']) AS privilege_type
  )
  SELECT format(
      'anon has %s column privilege on public.%I.%I',
      privilege_type,
      application_tables.relname,
      column_info.column_name
    )
    INTO violation
  FROM application_tables
  JOIN information_schema.columns AS column_info
    ON column_info.table_schema = 'public'
   AND column_info.table_name = application_tables.relname
  CROSS JOIN column_privileges
  WHERE NOT has_table_privilege('anon', application_tables.oid, privilege_type)
    AND has_column_privilege(
      'anon',
      format('public.%I', application_tables.relname),
      column_info.column_name,
      privilege_type
    )
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH required_tables AS (
    SELECT unnest(
      ARRAY['ai_usage_events', 'generation_attempts', 'learning_activity_events', 'learning_plans', 'modules', 'plan_schedules', 'resources', 'task_resources', 'tasks', 'usage_metrics']
    ) AS table_name
  ), forbidden_privileges AS (
    SELECT unnest(
      ARRAY['INSERT', 'UPDATE', 'DELETE']
    ) AS privilege_type
  )
  SELECT format(
      'authenticated has %s on server-owned public.%I',
      privilege_type,
      required_tables.table_name
    )
    INTO violation
  FROM required_tables
  LEFT JOIN pg_class AS class
    ON class.relname = required_tables.table_name
   AND class.relnamespace = 'public'::regnamespace
  CROSS JOIN forbidden_privileges
  WHERE class.oid IS NULL
     OR has_table_privilege('authenticated', class.oid, privilege_type)
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH required_tables AS (
    SELECT unnest(
      ARRAY['ai_usage_events', 'generation_attempts', 'learning_activity_events', 'learning_plans', 'modules', 'plan_schedules', 'resources', 'task_resources', 'tasks', 'usage_metrics']
    ) AS table_name
  ), column_privileges AS (
    SELECT unnest(ARRAY['INSERT', 'UPDATE']) AS privilege_type
  )
  SELECT format(
      'authenticated has %s column privilege on server-owned public.%I.%I',
      privilege_type,
      required_tables.table_name,
      column_info.column_name
    )
    INTO violation
  FROM required_tables
  JOIN pg_class AS class
    ON class.relname = required_tables.table_name
   AND class.relnamespace = 'public'::regnamespace
   AND class.relkind IN ('r', 'p')
  JOIN information_schema.columns AS column_info
    ON column_info.table_schema = 'public'
   AND column_info.table_name = required_tables.table_name
  CROSS JOIN column_privileges
  WHERE NOT has_table_privilege('authenticated', class.oid, privilege_type)
    AND has_column_privilege(
      'authenticated',
      format('public.%I', required_tables.table_name),
      column_info.column_name,
      privilege_type
    )
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  -- Webhook and email ledgers are mandatory service-only tables. The legacy
  -- Stripe archive is expand-phase-only, so it remains optional when absent.
  WITH required_tables AS (
    SELECT unnest(
      ARRAY['clerk_webhook_events', 'clerk_webhook_event_claims', 'email_notification_delivery_runs', 'email_notification_deliveries']
    ) AS table_name
  )
  SELECT format('required service-only public.%I table is missing', required_tables.table_name)
    INTO violation
  FROM required_tables
  LEFT JOIN pg_class AS class
    ON class.relname = required_tables.table_name
   AND class.relnamespace = 'public'::regnamespace
   AND class.relkind IN ('r', 'p')
  WHERE class.oid IS NULL
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH service_only_tables AS (
    SELECT unnest(
      ARRAY['legacy_stripe_entitlement_archive', 'clerk_webhook_events', 'clerk_webhook_event_claims', 'email_notification_delivery_runs', 'email_notification_deliveries']
    ) AS table_name
  ), client_roles AS (
    SELECT unnest(ARRAY['anon', 'authenticated']) AS role_name
  ), all_privileges AS (
    SELECT unnest(
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    ) AS privilege_type
  )
  SELECT format(
      '%I has %s on service-only public.%I',
      role_name,
      privilege_type,
      service_only_tables.table_name
    )
    INTO violation
  FROM service_only_tables
  JOIN pg_class AS class
    ON class.relname = service_only_tables.table_name
   AND class.relnamespace = 'public'::regnamespace
   AND class.relkind IN ('r', 'p')
  CROSS JOIN client_roles
  CROSS JOIN all_privileges
  WHERE has_table_privilege(role_name, class.oid, privilege_type)
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH service_only_tables AS (
    SELECT unnest(
      ARRAY['legacy_stripe_entitlement_archive', 'clerk_webhook_events', 'clerk_webhook_event_claims', 'email_notification_delivery_runs', 'email_notification_deliveries']
    ) AS table_name
  ), client_roles AS (
    SELECT unnest(ARRAY['anon', 'authenticated']) AS role_name
  ), column_privileges AS (
    SELECT unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS privilege_type
  )
  SELECT format(
      '%I has %s column privilege on service-only public.%I.%I',
      role_name,
      privilege_type,
      service_only_tables.table_name,
      column_info.column_name
    )
    INTO violation
  FROM service_only_tables
  JOIN pg_class AS class
    ON class.relname = service_only_tables.table_name
   AND class.relnamespace = 'public'::regnamespace
   AND class.relkind IN ('r', 'p')
  JOIN information_schema.columns AS column_info
    ON column_info.table_schema = 'public'
   AND column_info.table_name = service_only_tables.table_name
  CROSS JOIN client_roles
  CROSS JOIN column_privileges
  WHERE has_column_privilege(
      role_name,
      format('public.%I', service_only_tables.table_name),
      column_info.column_name,
      privilege_type
    )
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH required_tables AS (
    SELECT unnest(
      ARRAY['users', 'task_progress', 'user_preferences', 'user_email_notification_settings', 'user_email_notification_preferences']
    ) AS table_name
  )
  SELECT format('authenticated has DELETE on public.%I', required_tables.table_name)
    INTO violation
  FROM required_tables
  LEFT JOIN pg_class AS class
    ON class.relname = required_tables.table_name
   AND class.relnamespace = 'public'::regnamespace
  WHERE class.oid IS NULL
     OR has_table_privilege('authenticated', class.oid, 'DELETE')
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  SELECT format('authenticated has INSERT on public.%I', class.relname)
    INTO violation
  FROM pg_class AS class
  WHERE class.relname = 'users'
    AND class.relnamespace = 'public'::regnamespace
    AND migration_phase = 'contract'
    AND has_table_privilege('authenticated', class.oid, 'INSERT')
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  SELECT format(
      'authenticated has INSERT column privilege on public.users.%I',
      attribute.attname
    )
    INTO violation
  FROM pg_class AS class
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = class.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  WHERE class.relname = 'users'
    AND class.relnamespace = 'public'::regnamespace
    AND NOT has_table_privilege('authenticated', class.oid, 'INSERT')
    AND has_column_privilege(
      'authenticated',
      class.oid,
      attribute.attnum,
      'INSERT'
    )
  ORDER BY attribute.attnum
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH required_privileges AS (
    SELECT unnest(ARRAY['SELECT', 'INSERT']) AS privilege_type
  )
  SELECT format('authenticated lacks %s on public.task_progress', privilege_type)
    INTO violation
  FROM required_privileges
  LEFT JOIN pg_class AS class
    ON class.relname = 'task_progress'
   AND class.relnamespace = 'public'::regnamespace
  WHERE class.oid IS NULL
     OR NOT has_table_privilege('authenticated', class.oid, privilege_type)
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH client_roles AS (
    SELECT unnest(ARRAY['anon', 'authenticated']) AS role_name
  ), forbidden_privileges AS (
    SELECT unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS privilege_type
  )
  SELECT format('%I has %s on public.job_queue', role_name, privilege_type)
    INTO violation
  FROM client_roles
  CROSS JOIN forbidden_privileges
  LEFT JOIN pg_class AS class
    ON class.relname = 'job_queue'
   AND class.relnamespace = 'public'::regnamespace
  WHERE class.oid IS NULL
     OR has_table_privilege(role_name, class.oid, privilege_type)
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH expected_grants AS (
    SELECT *
    FROM (VALUES
      ('users', 'UPDATE', users_update_columns),
      ('task_progress', 'UPDATE', task_progress_update_columns),
      ('user_preferences', 'INSERT', ARRAY['user_id', 'preferred_ai_model', 'analytics_timezone', 'updated_at']),
      ('user_preferences', 'UPDATE', ARRAY['preferred_ai_model', 'analytics_timezone', 'updated_at']),
      ('user_email_notification_settings', 'INSERT', ARRAY['user_id', 'unsubscribe_all_optional_emails', 'updated_at']),
      ('user_email_notification_settings', 'UPDATE', ARRAY['unsubscribe_all_optional_emails', 'updated_at']),
      ('user_email_notification_preferences', 'INSERT', ARRAY['user_id', 'category', 'enabled', 'unsubscribed_at', 'updated_at']),
      ('user_email_notification_preferences', 'UPDATE', ARRAY['enabled', 'unsubscribed_at', 'updated_at'])
    ) AS expected(table_name, privilege_type, allowed_columns)
  )
  SELECT format(
      'authenticated %s columns are wrong for public.%I (missing %I)',
      privilege_type,
      expected_grants.table_name,
      allowed_column
    )
    INTO violation
  FROM expected_grants
  CROSS JOIN LATERAL unnest(allowed_columns) AS allowed_column
  LEFT JOIN information_schema.columns AS column_info
    ON column_info.table_schema = 'public'
   AND column_info.table_name = expected_grants.table_name
   AND column_info.column_name = allowed_column
  WHERE column_info.column_name IS NULL
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH expected_grants AS (
    SELECT *
    FROM (VALUES
      ('users', 'UPDATE', users_update_columns),
      ('task_progress', 'UPDATE', task_progress_update_columns),
      ('user_preferences', 'INSERT', ARRAY['user_id', 'preferred_ai_model', 'analytics_timezone', 'updated_at']),
      ('user_preferences', 'UPDATE', ARRAY['preferred_ai_model', 'analytics_timezone', 'updated_at']),
      ('user_email_notification_settings', 'INSERT', ARRAY['user_id', 'unsubscribe_all_optional_emails', 'updated_at']),
      ('user_email_notification_settings', 'UPDATE', ARRAY['unsubscribe_all_optional_emails', 'updated_at']),
      ('user_email_notification_preferences', 'INSERT', ARRAY['user_id', 'category', 'enabled', 'unsubscribed_at', 'updated_at']),
      ('user_email_notification_preferences', 'UPDATE', ARRAY['enabled', 'unsubscribed_at', 'updated_at'])
    ) AS expected(table_name, privilege_type, allowed_columns)
  )
  SELECT format(
      'authenticated has incorrect %s column privilege on public.%I.%I',
      privilege_type,
      expected_grants.table_name,
      column_info.column_name
    )
    INTO violation
  FROM expected_grants
  JOIN information_schema.columns AS column_info
    ON column_info.table_schema = 'public'
   AND column_info.table_name = expected_grants.table_name
  WHERE has_column_privilege(
      'authenticated',
      format('public.%I', expected_grants.table_name),
      column_info.column_name,
      privilege_type
    ) IS DISTINCT FROM (column_info.column_name = ANY(allowed_columns))
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH security_definers AS (
    SELECT procedure.oid, namespace.nspname, procedure.proname
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE procedure.prosecdef
      AND namespace.nspname IN ('public', 'private')
  ), client_roles AS (
    SELECT unnest(ARRAY['anon', 'authenticated']) AS role_name
  )
  SELECT format(
      '%I can execute security-definer function %I.%I',
      role_name,
      nspname,
      proname
    )
    INTO violation
  FROM security_definers
  CROSS JOIN client_roles
  WHERE has_function_privilege(role_name, oid, 'EXECUTE')
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  SELECT format('%I has USAGE on private schema', role_name)
    INTO violation
  FROM (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
  JOIN pg_namespace AS namespace ON namespace.nspname = 'private'
  WHERE has_schema_privilege(role_name, namespace.oid, 'USAGE')
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;

  WITH client_roles AS (
    SELECT unnest(ARRAY['anon', 'authenticated']) AS role_name
  ), table_default_acls AS (
    SELECT default_acl.defaclrole,
      namespace.nspname,
      privilege.grantee,
      privilege.privilege_type
    FROM pg_default_acl AS default_acl
    LEFT JOIN pg_namespace AS namespace
      ON namespace.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) AS privilege
    WHERE default_acl.defaclobjtype = 'r'
      AND default_acl.defaclrole = current_user::regrole
      AND (default_acl.defaclnamespace = 0 OR namespace.nspname = 'public')
  )
  SELECT format(
      '%I inherits default %s table privilege in schema %I',
      role_name,
      privilege_type,
      COALESCE(nspname, 'global')
    )
    INTO violation
  FROM table_default_acls
  CROSS JOIN client_roles
  WHERE privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    AND (grantee = 0 OR pg_has_role(role_name, grantee, 'member'))
  LIMIT 1;
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION '%', violation;
  END IF;
END;
$$;
