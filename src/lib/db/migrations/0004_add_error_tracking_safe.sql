-- Create plan_status enum type if it doesn't exist
DO $$ BEGIN
 CREATE TYPE "public"."plan_status" AS ENUM('ready', 'pending', 'generating', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add columns to learning_plans table if they don't exist
DO $$
BEGIN
    -- Add status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'learning_plans' AND column_name = 'status'
    ) THEN
        ALTER TABLE "learning_plans" ADD COLUMN "status" "plan_status" DEFAULT 'pending' NOT NULL;
    END IF;

    -- Add error_code column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'learning_plans' AND column_name = 'error_code'
    ) THEN
        ALTER TABLE "learning_plans" ADD COLUMN "error_code" varchar(50);
    END IF;

    -- Add error_message column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'learning_plans' AND column_name = 'error_message'
    ) THEN
        ALTER TABLE "learning_plans" ADD COLUMN "error_message" text;
    END IF;

    -- Add error_details column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'learning_plans' AND column_name = 'error_details'
    ) THEN
        ALTER TABLE "learning_plans" ADD COLUMN "error_details" jsonb;
    END IF;
END $$;