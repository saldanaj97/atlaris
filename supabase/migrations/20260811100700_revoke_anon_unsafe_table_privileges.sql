-- RLS cannot protect tables from privileges that bypass row-level operations.
-- Preserve anonymous reads while removing unsafe direct and PUBLIC-derived ACLs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM PUBLIC, anon;

-- Clear both global and schema-specific defaults for tables created later by
-- the migration role. Schema defaults cannot override a global grant.
ALTER DEFAULT PRIVILEGES
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM PUBLIC, anon;
