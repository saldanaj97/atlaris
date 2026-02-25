-- Add intermediate state so polling clients can distinguish retry-waiting plans from actively generating ones
DO $$ BEGIN
  ALTER TYPE "generation_status" ADD VALUE 'pending_retry';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
