'use client';

import { nanoid } from 'nanoid';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ExtractedSection } from '@/features/pdf/types';

export interface PdfPlanSettings {
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  deadlineWeeks: string;
}

export type SectionWithId = Omit<ExtractedSection, 'id'> & { id: string };

type EditableSectionField = 'title' | 'content';

interface PdfExtractionPreviewState {
  mainTopic: string;
  sections: SectionWithId[];
  settings: PdfPlanSettings;
}

type PdfExtractionPreviewAction =
  | { type: 'reset'; mainTopic: string; sections: SectionWithId[] }
  | { type: 'main-topic-changed'; value: string }
  | {
      type: 'section-field-changed';
      sectionId: string;
      field: EditableSectionField;
      value: string;
    }
  | {
      type: 'setting-changed';
      field: keyof PdfPlanSettings;
      value: string;
    };

const DEFAULT_PDF_PLAN_SETTINGS: PdfPlanSettings = {
  skillLevel: 'beginner',
  weeklyHours: '3-5',
  learningStyle: 'mixed',
  deadlineWeeks: '4',
};

function withSectionIds(
  sections: ExtractedSection[],
  sectionSeed: string
): SectionWithId[] {
  return sections.map(
    (section): SectionWithId => ({
      ...section,
      id: section.id ?? `${sectionSeed}-${nanoid()}`,
    })
  );
}

export function stripSectionIds(
  sections: readonly SectionWithId[]
): ExtractedSection[] {
  return sections.map(({ id: _id, ...section }) => section);
}

/**
 * Intentionally compares only id, title, content, level, and suggestedTopic.
 * Other ExtractedSection fields (e.g. order metadata) are not relevant for
 * detecting user-facing changes that should trigger a draft reset.
 */
function areExtractedSectionsEqual(
  left: readonly ExtractedSection[],
  right: readonly ExtractedSection[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((section, index) => {
    const otherSection = right[index];

    return (
      otherSection !== undefined &&
      section.id === otherSection.id &&
      section.title === otherSection.title &&
      section.content === otherSection.content &&
      section.level === otherSection.level &&
      section.suggestedTopic === otherSection.suggestedTopic
    );
  });
}

function createPdfExtractionPreviewState(params: {
  mainTopic: string;
  sections: SectionWithId[];
}): PdfExtractionPreviewState {
  return {
    mainTopic: params.mainTopic,
    sections: params.sections,
    settings: DEFAULT_PDF_PLAN_SETTINGS,
  };
}

function pdfExtractionPreviewReducer(
  state: PdfExtractionPreviewState,
  action: PdfExtractionPreviewAction
): PdfExtractionPreviewState {
  switch (action.type) {
    case 'reset':
      return createPdfExtractionPreviewState({
        mainTopic: action.mainTopic,
        sections: action.sections,
      });
    case 'main-topic-changed':
      return {
        ...state,
        mainTopic: action.value,
      };
    case 'section-field-changed':
      return {
        ...state,
        sections: state.sections.map((section) =>
          section.id === action.sectionId
            ? { ...section, [action.field]: action.value }
            : section
        ),
      };
    case 'setting-changed':
      return {
        ...state,
        settings: {
          ...state.settings,
          [action.field]: action.value,
        },
      };
    default: {
      const _exhaustiveCheck: never = action;
      throw new Error(
        `usePdfExtractionDraft received an unexpected action: ${JSON.stringify(_exhaustiveCheck)}`
      );
    }
  }
}

interface PreviousInitialData {
  mainTopic: string;
  sections: readonly ExtractedSection[];
  sectionSeed: string;
}

export interface UsePdfExtractionDraftParams {
  initialTopic: string;
  initialSections: ExtractedSection[];
  sectionSeed: string;
}

export interface UsePdfExtractionDraftResult {
  draft: PdfExtractionPreviewState;
  canGenerate: boolean;
  onMainTopicChange: (value: string) => void;
  onSectionFieldChange: (
    sectionId: string,
    field: 'title' | 'content',
    value: string
  ) => void;
  onSettingChange: (field: keyof PdfPlanSettings, value: string) => void;
}

export function usePdfExtractionDraft({
  initialTopic,
  initialSections,
  sectionSeed,
}: UsePdfExtractionDraftParams): UsePdfExtractionDraftResult {
  const didMountRef = useRef(false);
  const previousInitialDataRef = useRef<PreviousInitialData>({
    mainTopic: initialTopic,
    sections: initialSections,
    sectionSeed,
  });

  const [state, dispatch] = useReducer(
    pdfExtractionPreviewReducer,
    {
      mainTopic: initialTopic,
      sections: withSectionIds(initialSections, sectionSeed),
    },
    createPdfExtractionPreviewState
  );

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      previousInitialDataRef.current = {
        mainTopic: initialTopic,
        sections: initialSections,
        sectionSeed,
      };
      return;
    }

    const previousInitialData = previousInitialDataRef.current;
    const mainTopicChanged = previousInitialData.mainTopic !== initialTopic;
    const sectionsChanged = !areExtractedSectionsEqual(
      previousInitialData.sections,
      initialSections
    );
    const seedChanged = previousInitialData.sectionSeed !== sectionSeed;

    if (!mainTopicChanged && !sectionsChanged && !seedChanged) {
      return;
    }

    previousInitialDataRef.current = {
      mainTopic: initialTopic,
      sections: initialSections,
      sectionSeed,
    };

    dispatch({
      type: 'reset',
      mainTopic: initialTopic,
      sections: withSectionIds(initialSections, sectionSeed),
    });
  }, [initialSections, initialTopic, sectionSeed]);

  const onMainTopicChange = useCallback((value: string) => {
    dispatch({ type: 'main-topic-changed', value });
  }, []);

  const onSectionFieldChange = useCallback(
    (sectionId: string, field: 'title' | 'content', value: string) => {
      dispatch({
        type: 'section-field-changed',
        sectionId,
        field,
        value,
      });
    },
    []
  );

  const onSettingChange = useCallback(
    (field: keyof PdfPlanSettings, value: string) => {
      dispatch({ type: 'setting-changed', field, value });
    },
    []
  );

  // Topic-level gate only — the generation endpoint validates sections independently.
  const canGenerate = state.mainTopic.trim().length > 0;

  return {
    draft: state,
    canGenerate,
    onMainTopicChange,
    onSectionFieldChange,
    onSettingChange,
  };
}
