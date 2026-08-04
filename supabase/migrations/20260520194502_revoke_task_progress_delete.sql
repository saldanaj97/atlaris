-- Re-apply after 20260520194501_harden_authenticated_server_owned_writes.sql,
-- which grants INSERT, UPDATE, DELETE on task_progress to authenticated.
-- DELETE must stay revoked so browser clients cannot remove progress rows and
-- leave orphaned learning_activity_events completion history.
REVOKE DELETE ON TABLE "task_progress" FROM authenticated;
