import { randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { oauthStateTokens } from '@/lib/db/schema';
import { hashSha256 } from '@/lib/utils/hash';
import {
  pdfPreviewEditSchema,
  type PdfPreviewEditInput,
} from '@/lib/validation/pdf';

const PDF_PROOF_PROVIDER = 'pdf_extraction_proof_v1';
const PDF_PROOF_VERSION = 1 as const;
const PDF_PROOF_TTL_MS = 10 * 60 * 1000;

type DbClient = ReturnType<typeof getDb>;

type CanonicalPdfExtractedContent = {
  mainTopic: string;
  sections: Array<{
    title: string;
    content: string;
    level: number;
    suggestedTopic?: string;
  }>;
};

export type PdfExtractionProof = {
  token: string;
  extractionHash: string;
  expiresAt: string;
  version: typeof PDF_PROOF_VERSION;
};

function buildStoredTokenHash(token: string, extractionHash: string): string {
  return hashSha256(`${PDF_PROOF_PROVIDER}:${token}:${extractionHash}`);
}

function generateProofToken(): string {
  return randomBytes(32).toString('base64url');
}

export function canonicalizePdfExtractedContent(
  input: Pick<PdfPreviewEditInput, 'mainTopic' | 'sections'>
): CanonicalPdfExtractedContent {
  const parsed = pdfPreviewEditSchema.parse({
    mainTopic: input.mainTopic,
    sections: input.sections,
  });

  return {
    mainTopic: parsed.mainTopic,
    sections: parsed.sections.map((section) => ({
      title: section.title,
      content: section.content,
      level: section.level,
      ...(section.suggestedTopic
        ? { suggestedTopic: section.suggestedTopic }
        : {}),
    })),
  };
}

/**
 * Serializes a value to JSON with deterministic key order at every nesting level.
 * Ensures the same logical content always produces the same string, regardless of
 * property insertion order in canonicalizePdfExtractedContent.
 */
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableSerialize(v)).join(',') + ']';
  }
  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((k) => {
    const v = (value as Record<string, unknown>)[k];
    return JSON.stringify(k) + ':' + stableSerialize(v);
  });
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a stable SHA-256 hash of the canonical PDF-extracted content.
 * Uses canonicalizePdfExtractedContent for normalization, then stableSerialize
 * for deterministic ordering—so refactors to canonicalizePdfExtractedContent
 * that preserve the same logical structure won't change the hash unexpectedly.
 */
export function computePdfExtractionHash(
  input: Pick<PdfPreviewEditInput, 'mainTopic' | 'sections'>
): string {
  const canonical = canonicalizePdfExtractedContent(input);
  return hashSha256(stableSerialize(canonical));
}

export async function issuePdfExtractionProof(params: {
  authUserId: string;
  extractionHash: string;
  dbClient?: DbClient;
  now?: () => Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const dbClient = params.dbClient ?? getDb();
  const now = params.now ?? (() => new Date());

  const token = generateProofToken();
  const expiresAt = new Date(now().getTime() + PDF_PROOF_TTL_MS);
  const stateTokenHash = buildStoredTokenHash(token, params.extractionHash);

  await dbClient.insert(oauthStateTokens).values({
    stateTokenHash,
    authUserId: params.authUserId,
    provider: PDF_PROOF_PROVIDER,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumePdfExtractionProof(params: {
  authUserId: string;
  token: string;
  extractionHash: string;
  dbClient?: DbClient;
  now?: () => Date;
}): Promise<boolean> {
  const dbClient = params.dbClient ?? getDb();
  const now = params.now ?? (() => new Date());
  const stateTokenHash = buildStoredTokenHash(
    params.token,
    params.extractionHash
  );

  const [deleted] = await dbClient
    .delete(oauthStateTokens)
    .where(
      and(
        eq(oauthStateTokens.stateTokenHash, stateTokenHash),
        eq(oauthStateTokens.authUserId, params.authUserId),
        eq(oauthStateTokens.provider, PDF_PROOF_PROVIDER),
        gt(oauthStateTokens.expiresAt, now())
      )
    )
    .returning({ id: oauthStateTokens.id });

  return Boolean(deleted);
}

export async function verifyAndConsumePdfExtractionProof(params: {
  authUserId: string;
  extractedContent: Pick<PdfPreviewEditInput, 'mainTopic' | 'sections'>;
  extractionHash: string;
  token: string;
  dbClient?: DbClient;
  now?: () => Date;
}): Promise<boolean> {
  const computedHash = computePdfExtractionHash(params.extractedContent);
  if (computedHash !== params.extractionHash) {
    return false;
  }

  return consumePdfExtractionProof({
    authUserId: params.authUserId,
    token: params.token,
    extractionHash: params.extractionHash,
    dbClient: params.dbClient,
    now: params.now,
  });
}

export function toPdfExtractionProofPayload(params: {
  token: string;
  extractionHash: string;
  expiresAt: Date;
}): PdfExtractionProof {
  return {
    token: params.token,
    extractionHash: params.extractionHash,
    expiresAt: params.expiresAt.toISOString(),
    version: PDF_PROOF_VERSION,
  };
}
