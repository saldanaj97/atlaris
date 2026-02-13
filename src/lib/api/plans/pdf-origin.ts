import { jsonError } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import {
  sanitizePdfContextForPersistence,
  type PdfContext,
} from '@/lib/pdf/context';
import { verifyAndConsumePdfExtractionProof } from '@/lib/security/pdf-extraction-proof';
import {
  atomicCheckAndIncrementPdfUsage,
  decrementPdfPlanUsage,
} from '@/lib/stripe/usage';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

import { getDb } from '@/lib/db/runtime';

type DbClient = ReturnType<typeof getDb>;

export interface PdfProvenance {
  extractionHash: string;
  proofVersion: 1;
}

export interface PreparedPlanInput {
  origin: CreateLearningPlanInput['origin'];
  extractedContext: PdfContext | null;
  topic: string;
  pdfUsageReserved: boolean;
  pdfProvenance: PdfProvenance | null;
}

type PreparePdfOriginParams = {
  body: CreateLearningPlanInput;
  authUserId: string;
  internalUserId: string;
  dbClient: DbClient;
};

type PreparePdfOriginResult =
  | { ok: true; data: PreparedPlanInput }
  | { ok: false; response: Response };

const INVALID_PDF_PROOF_MESSAGE = 'Invalid or expired PDF extraction proof.';

function getProofVersion(input: CreateLearningPlanInput): 1 {
  return input.pdfProofVersion ?? 1;
}

export async function preparePlanInputWithPdfOrigin(
  params: PreparePdfOriginParams
): Promise<PreparePdfOriginResult> {
  const { body, authUserId, internalUserId, dbClient } = params;
  const origin = body.origin ?? 'ai';

  if (origin !== 'pdf') {
    return {
      ok: true,
      data: {
        origin,
        extractedContext: null,
        topic: body.topic,
        pdfUsageReserved: false,
        pdfProvenance: null,
      },
    };
  }

  if (
    !body.extractedContent ||
    !body.pdfProofToken ||
    !body.pdfExtractionHash
  ) {
    return {
      ok: false,
      response: jsonError(INVALID_PDF_PROOF_MESSAGE, { status: 403 }),
    };
  }

  const pdfUsage = await atomicCheckAndIncrementPdfUsage(
    internalUserId,
    dbClient
  );
  if (!pdfUsage.allowed) {
    return {
      ok: false,
      response: jsonError('PDF plan quota exceeded for this month.', {
        status: 403,
        code: 'QUOTA_EXCEEDED',
      }),
    };
  }

  let proofVerified = false;
  try {
    proofVerified = await verifyAndConsumePdfExtractionProof({
      authUserId,
      extractedContent: body.extractedContent,
      extractionHash: body.pdfExtractionHash,
      token: body.pdfProofToken,
      dbClient,
    });
  } catch (error) {
    await rollbackPdfUsageIfReserved({
      internalUserId,
      dbClient,
      reserved: true,
    });
    throw error;
  }

  if (!proofVerified) {
    await rollbackPdfUsageIfReserved({
      internalUserId,
      dbClient,
      reserved: true,
    });
    return {
      ok: false,
      response: jsonError(INVALID_PDF_PROOF_MESSAGE, { status: 403 }),
    };
  }

  const extractedContext = sanitizePdfContextForPersistence(
    body.extractedContent
  );
  const topic =
    extractedContext.mainTopic && extractedContext.mainTopic.trim().length > 0
      ? extractedContext.mainTopic.trim()
      : body.topic;

  return {
    ok: true,
    data: {
      origin,
      extractedContext,
      topic,
      pdfUsageReserved: true,
      pdfProvenance: {
        extractionHash: body.pdfExtractionHash,
        proofVersion: getProofVersion(body),
      },
    },
  };
}

export async function rollbackPdfUsageIfReserved(params: {
  internalUserId: string;
  dbClient: DbClient;
  reserved: boolean;
}): Promise<void> {
  if (!params.reserved) {
    return;
  }
  try {
    await decrementPdfPlanUsage(params.internalUserId, params.dbClient);
  } catch (error) {
    logger.error(
      {
        internalUserId: params.internalUserId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to rollback PDF quota usage after reservation'
    );
  }
}
