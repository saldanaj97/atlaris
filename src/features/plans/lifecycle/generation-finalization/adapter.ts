import {
  commitPlanGenerationFailure,
  commitPlanGenerationSuccess,
} from './store';

import type {
  AttemptsDbClient,
  GenerationAttemptRecord,
} from '@/lib/db/queries/types/attempts.types';
import type { GenerationFinalizationPort } from '../ports';
import type {
  FinalizeGenerationFailureParams,
  FinalizeGenerationSuccessInput,
  GenerationFinalizationStoreDeps,
} from './types';

export class GenerationFinalizationAdapter implements GenerationFinalizationPort {
  constructor(
    private readonly dbClient: AttemptsDbClient,
    private readonly deps: GenerationFinalizationStoreDeps = {},
  ) {}

  async finalizeSuccess(
    input: FinalizeGenerationSuccessInput,
  ): Promise<GenerationAttemptRecord> {
    return commitPlanGenerationSuccess(this.dbClient, input, this.deps);
  }

  async finalizeFailure(
    input: FinalizeGenerationFailureParams,
  ): Promise<GenerationAttemptRecord | void> {
    return commitPlanGenerationFailure(this.dbClient, input);
  }
}
