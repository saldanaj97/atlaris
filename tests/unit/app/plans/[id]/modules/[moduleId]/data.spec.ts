import { describe, expect, it, vi } from 'vitest';

import { loadModuleForPage } from '@/app/plans/[id]/modules/[moduleId]/data';
import type { ModuleAccessResult } from '@/app/plans/[id]/modules/[moduleId]/types';
import {
  createFailedModuleAccessResult,
  createSuccessModuleAccessResult,
} from '../../../../../../fixtures/module-access';

describe('loadModuleForPage', () => {
  it.each([
    ['failed access', createFailedModuleAccessResult()],
    ['successful access', createSuccessModuleAccessResult()],
  ])('invokes getModuleForPage on every call for %s results', async (_label, result) => {
    const getModuleForPageMock =
      vi.fn<(moduleId: string) => Promise<ModuleAccessResult>>();

    getModuleForPageMock.mockResolvedValue(result);

    const first = await loadModuleForPage('mod-a', {
      getModuleForPage: getModuleForPageMock,
    });
    const second = await loadModuleForPage('mod-a', {
      getModuleForPage: getModuleForPageMock,
    });

    expect(first).toEqual(result);
    expect(second).toEqual(result);
    expect(getModuleForPageMock).toHaveBeenCalledTimes(2);
    expect(getModuleForPageMock).toHaveBeenNthCalledWith(1, 'mod-a');
    expect(getModuleForPageMock).toHaveBeenNthCalledWith(2, 'mod-a');
  });
});
