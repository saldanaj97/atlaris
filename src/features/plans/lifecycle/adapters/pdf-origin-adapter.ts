/**
 * PdfOriginAdapter — production implementation of PdfOriginPort.
 *
 * Thin wrapper around existing PDF origin functions that handle
 * proof verification, context extraction, and quota management.
 */

import {
  preparePlanInputWithPdfOrigin,
  rollbackPdfUsageIfReserved,
} from '@/features/plans/api/pdf-origin';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import type { DbClient } from '@/lib/db/types';

import type {
  PdfOriginPort,
  PreparePlanInputParams,
  PreparePlanInputSuccess,
} from '../ports';

export class PdfOriginAdapter implements PdfOriginPort {
  constructor(private readonly dbClient: DbClient) {}

  async preparePlanInput(
    params: PreparePlanInputParams
  ): Promise<PreparePlanInputSuccess> {
    const body = createLearningPlanSchema.parse({
      origin: 'pdf',
      topic: params.topic,
      skillLevel: params.skillLevel,
      weeklyHours: params.weeklyHours,
      learningStyle: params.learningStyle,
      notes: undefined,
      startDate: undefined,
      deadlineDate: undefined,
      visibility: 'private',
      extractedContent: params.extractedContent,
      pdfProofToken: params.pdfProofToken,
      pdfExtractionHash: params.pdfExtractionHash,
      pdfProofVersion: params.pdfProofVersion,
    });

    const result = await preparePlanInputWithPdfOrigin({
      body,
      authUserId: params.authUserId,
      internalUserId: params.internalUserId,
      dbClient: this.dbClient,
    });

    if (result.origin !== 'pdf') {
      throw new Error('PdfOriginAdapter expected a PDF-origin prepared plan');
    }

    return {
      extractedContext: result.extractedContext,
      topic: result.topic,
      skillLevel: result.skillLevel,
      weeklyHours: result.weeklyHours,
      learningStyle: result.learningStyle,
      pdfUsageReserved: result.pdfUsageReserved,
      pdfProvenance: result.pdfProvenance,
    };
  }

  async rollbackPdfUsage(params: {
    internalUserId: string;
    reserved: boolean;
  }): Promise<void> {
    await rollbackPdfUsageIfReserved({
      internalUserId: params.internalUserId,
      dbClient: this.dbClient,
      reserved: params.reserved,
    });
  }
}
