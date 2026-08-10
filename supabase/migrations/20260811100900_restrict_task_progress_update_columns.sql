REVOKE UPDATE ON TABLE "task_progress" FROM authenticated;
GRANT UPDATE ("status", "completed_at", "updated_at") ON TABLE "task_progress" TO authenticated;
