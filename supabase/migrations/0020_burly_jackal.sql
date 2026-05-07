ALTER TABLE "modules" ADD CONSTRAINT "module_title_length" CHECK (char_length("modules"."title") <= 500);--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resource_title_length" CHECK (char_length("resources"."title") <= 500);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_title_length" CHECK (char_length("tasks"."title") <= 500);