-- Anonymous must not write `job_queue` (read-only or no visibility via RLS; workers use service role).
REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM anonymous;
