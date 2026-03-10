'use client';

import {
  DEADLINE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from '@/app/plans/new/components/plan-form/constants';
import { InlineDropdown } from '@/app/plans/new/components/plan-form/InlineDropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ExtractedSection } from '@/lib/pdf/types';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Sparkles,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import React, { useEffect, useId, useReducer, useRef } from 'react';

export interface PdfPlanSettings {
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  deadlineWeeks: string;
}

type SectionWithId = ExtractedSection & { id: string };
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

interface PdfExtractionPreviewProps {
  mainTopic: string;
  sections: ExtractedSection[];
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
  onGenerate: (editedData: {
    mainTopic: string;
    sections: ExtractedSection[];
    settings: PdfPlanSettings;
  }) => void;
  onSwitchToManual?: (mainTopic: string) => void;
  isGenerating?: boolean;
}

const CONFIDENCE_COLORS = {
  high: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  medium:
    'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
  low: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
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
        `PdfExtractionPreview received an unexpected action: ${JSON.stringify(_exhaustiveCheck)}`
      );
    }
  }
}

export function PdfExtractionPreview({
  mainTopic: initialTopic,
  sections: initialSections,
  pageCount,
  confidence,
  onGenerate,
  onSwitchToManual,
  isGenerating = false,
}: PdfExtractionPreviewProps): React.JSX.Element {
  const sectionSeed = useId();
  const didMountRef = useRef(false);
  const [state, dispatch] = useReducer(
    pdfExtractionPreviewReducer,
    {
      mainTopic: initialTopic,
      sections: withSectionIds(initialSections, sectionSeed),
    },
    createPdfExtractionPreviewState
  );

  const mainTopicId = useId();
  const sectionsLabelId = useId();
  const baseId = useId();

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    dispatch({
      type: 'reset',
      mainTopic: initialTopic,
      sections: withSectionIds(initialSections, sectionSeed),
    });
  }, [initialSections, initialTopic, sectionSeed]);

  const handleGenerate = () => {
    onGenerate({
      mainTopic: state.mainTopic,
      sections: state.sections,
      settings: state.settings,
    });
  };

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-6 shadow-2xl backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        <div className="relative">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="from-primary to-accent flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-foreground text-lg font-semibold">
                  PDF Extracted Successfully
                </h3>
                <p className="text-muted-foreground text-sm">
                  {pageCount} pages • {state.sections.length} sections found
                </p>
              </div>
            </div>

            <Badge className={`${CONFIDENCE_COLORS[confidence]} border`}>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {confidence} confidence
            </Badge>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor={mainTopicId}
                className="text-foreground mb-2 block text-sm font-medium"
              >
                Main Topic
              </label>
              <Input
                id={mainTopicId}
                type="text"
                value={state.mainTopic}
                onChange={(event) =>
                  dispatch({
                    type: 'main-topic-changed',
                    value: event.target.value,
                  })
                }
                className="border-border bg-background text-foreground focus-visible:border-primary focus-visible:ring-primary/20 dark:border-input dark:bg-input/30 dark:text-foreground h-auto w-full rounded-xl px-4 py-3 text-base shadow-none focus-visible:ring-2 md:text-base"
                disabled={isGenerating}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <span
                  id={sectionsLabelId}
                  className="text-foreground text-sm font-medium"
                >
                  Sections ({state.sections.length})
                </span>
                <p className="text-muted-foreground text-xs">
                  Edit titles and content as needed
                </p>
              </div>

              <fieldset
                className="max-h-64 space-y-3 overflow-y-auto"
                aria-labelledby={sectionsLabelId}
              >
                {state.sections.map((section, index) => (
                  <div
                    key={section.id}
                    className="dark:bg-input/20 dark:border-input/50 bg-background/50 border-border hover:border-primary/30 rounded-xl border p-4 transition"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <label
                        className="sr-only"
                        htmlFor={`section-title-${section.id}`}
                      >
                        Section {index + 1} title
                      </label>
                      <Input
                        id={`section-title-${section.id}`}
                        type="text"
                        value={section.title}
                        onChange={(event) =>
                          dispatch({
                            type: 'section-field-changed',
                            sectionId: section.id,
                            field: 'title',
                            value: event.target.value,
                          })
                        }
                        className="text-foreground h-auto flex-1 rounded-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-1 md:text-sm"
                        disabled={isGenerating}
                      />
                      <Badge variant="outline" className="text-xs">
                        Level {section.level}
                      </Badge>
                    </div>
                    <label
                      className="sr-only"
                      htmlFor={`section-content-${section.id}`}
                    >
                      Section {index + 1} content
                    </label>
                    <Textarea
                      id={`section-content-${section.id}`}
                      value={section.content}
                      onChange={(event) =>
                        dispatch({
                          type: 'section-field-changed',
                          sectionId: section.id,
                          field: 'content',
                          value: event.target.value,
                        })
                      }
                      rows={3}
                      className="text-muted-foreground min-h-0 w-full resize-none rounded-none border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-1 md:text-xs"
                      disabled={isGenerating}
                    />
                  </div>
                ))}
              </fieldset>
            </div>

            <div className="border-border dark:border-border mt-4 border-t pt-4">
              <p className="text-foreground mb-3 text-sm font-medium">
                Plan Settings
              </p>
              <div className="dark:text-foreground text-foreground mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm">I&apos;m a</span>
                <InlineDropdown
                  id={`${baseId}-skill-level`}
                  options={SKILL_LEVEL_OPTIONS}
                  value={state.settings.skillLevel}
                  onChange={(value) =>
                    dispatch({
                      type: 'setting-changed',
                      field: 'skillLevel',
                      value,
                    })
                  }
                  variant="primary"
                />
                <span className="text-sm">with</span>
                <InlineDropdown
                  id={`${baseId}-weekly-hours`}
                  options={WEEKLY_HOURS_OPTIONS}
                  value={state.settings.weeklyHours}
                  onChange={(value) =>
                    dispatch({
                      type: 'setting-changed',
                      field: 'weeklyHours',
                      value,
                    })
                  }
                  icon={<Clock className="h-3.5 w-3.5" />}
                  variant="accent"
                />
                <span className="text-sm">per week.</span>
              </div>

              <div className="dark:text-foreground text-foreground flex flex-wrap items-center gap-2">
                <span className="text-sm">I prefer</span>
                <InlineDropdown
                  id={`${baseId}-learning-style`}
                  options={LEARNING_STYLE_OPTIONS}
                  value={state.settings.learningStyle}
                  onChange={(value) =>
                    dispatch({
                      type: 'setting-changed',
                      field: 'learningStyle',
                      value,
                    })
                  }
                  variant="accent"
                />
                <span className="text-sm">and want to finish in</span>
                <InlineDropdown
                  id={`${baseId}-deadline`}
                  options={DEADLINE_OPTIONS}
                  value={state.settings.deadlineWeeks}
                  onChange={(value) =>
                    dispatch({
                      type: 'setting-changed',
                      field: 'deadlineWeeks',
                      value,
                    })
                  }
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  variant="primary"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            {onSwitchToManual && (
              <Button
                type="button"
                variant="link"
                onClick={() => onSwitchToManual(state.mainTopic)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm underline-offset-4 transition hover:underline"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Not what you expected? Try generating manually
              </Button>
            )}
            {!onSwitchToManual && <div />}
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !state.mainTopic.trim()}
              className="group bg-primary hover:bg-primary/90 shadow-primary/25 hover:shadow-primary/30 h-auto rounded-2xl px-6 py-3 text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl"
            >
              <span className="font-medium">
                {isGenerating ? 'Generating...' : 'Generate Learning Plan'}
              </span>
              {!isGenerating && (
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
