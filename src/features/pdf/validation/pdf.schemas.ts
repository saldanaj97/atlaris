import { z } from 'zod';

/** Permissive section schema for API response parsing (no length constraints). */
export const extractionApiSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  level: z.number(),
  suggestedTopic: z.string().optional(),
});

export const truncationDataSchema = z.object({
  truncated: z.boolean(),
  maxBytes: z.number(),
  returnedBytes: z.number(),
  reasons: z.array(z.string()),
  limits: z.object({
    maxTextChars: z.number(),
    maxSections: z.number(),
    maxSectionChars: z.number(),
  }),
});

export const extractionProofSchema = z.object({
  token: z.string(),
  extractionHash: z.string(),
  expiresAt: z.string(),
  version: z.literal(1),
});

export const extractionApiResponseSchema = z.object({
  success: z.boolean(),
  extraction: z
    .object({
      pageCount: z.number(),
      structure: z.object({
        sections: z.array(extractionApiSectionSchema),
        suggestedMainTopic: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
      truncation: truncationDataSchema.optional(),
    })
    .optional(),
  proof: extractionProofSchema.optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});
