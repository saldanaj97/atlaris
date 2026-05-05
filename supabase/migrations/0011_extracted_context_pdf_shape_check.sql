ALTER TABLE "learning_plans" ADD CONSTRAINT "extracted_context_pdf_shape" CHECK (
  ("extracted_context" IS NULL)
  OR (
    jsonb_typeof("extracted_context") = 'object'
    AND ("extracted_context" ? 'mainTopic')
    AND ("extracted_context" ? 'sections')
    AND jsonb_typeof("extracted_context"->'sections') = 'array'
    AND jsonb_typeof("extracted_context"->'mainTopic') = 'string'
  )
);--> statement-breakpoint
