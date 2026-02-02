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
import type { ExtractedSection } from '@/lib/pdf/types';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useId, useState } from 'react';

export interface PdfPlanSettings {
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  deadlineWeeks: string;
}

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

export function PdfExtractionPreview({
  mainTopic: initialTopic,
  sections: initialSections,
  pageCount,
  confidence,
  onGenerate,
  onSwitchToManual,
  isGenerating = false,
}: PdfExtractionPreviewProps) {
  const [mainTopic, setMainTopic] = useState(initialTopic);
  const [sections, setSections] = useState(initialSections);
  const [skillLevel, setSkillLevel] = useState('beginner');
  const [weeklyHours, setWeeklyHours] = useState('3-5');
  const [learningStyle, setLearningStyle] = useState('mixed');
  const [deadlineWeeks, setDeadlineWeeks] = useState('4');

  const mainTopicId = useId();
  const sectionsLabelId = useId();
  const baseId = useId();

  const handleSectionEdit = (
    index: number,
    field: keyof ExtractedSection,
    value: string
  ) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  const handleGenerate = () => {
    onGenerate({
      mainTopic,
      sections,
      settings: { skillLevel, weeklyHours, learningStyle, deadlineWeeks },
    });
  };

  const confidenceColors = {
    high: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    medium:
      'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    low: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  };

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-6 shadow-2xl backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        <div className="relative">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="from-primary to-accent flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-foreground text-lg font-semibold">
                  PDF Extracted Successfully
                </h3>
                <p className="text-muted-foreground text-sm">
                  {pageCount} pages • {sections.length} sections found
                </p>
              </div>
            </div>

            <Badge className={`${confidenceColors[confidence]} border`}>
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
              <input
                id={mainTopicId}
                type="text"
                value={mainTopic}
                onChange={(e) => setMainTopic(e.target.value)}
                className="dark:bg-input/30 dark:border-input dark:text-foreground bg-background border-border text-foreground focus:border-primary focus:ring-primary/20 w-full rounded-xl border px-4 py-3 text-base focus:ring-2 focus:outline-none"
                disabled={isGenerating}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <span
                  id={sectionsLabelId}
                  className="text-foreground text-sm font-medium"
                >
                  Sections ({sections.length})
                </span>
                <p className="text-muted-foreground text-xs">
                  Edit titles and content as needed
                </p>
              </div>

              <fieldset
                className="max-h-64 space-y-3 overflow-y-auto"
                aria-labelledby={sectionsLabelId}
              >
                {sections.map((section, index) => (
                  <div
                    key={`section-${section.title.slice(0, 20)}-${index}`}
                    className="dark:bg-input/20 dark:border-input/50 bg-background/50 border-border hover:border-primary/30 rounded-xl border p-4 transition"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <label
                        className="sr-only"
                        htmlFor={`section-title-${index}`}
                      >
                        Section {index + 1} title
                      </label>
                      <input
                        id={`section-title-${index}`}
                        type="text"
                        value={section.title}
                        onChange={(e) =>
                          handleSectionEdit(index, 'title', e.target.value)
                        }
                        className="text-foreground flex-1 bg-transparent text-sm font-medium focus:outline-none"
                        disabled={isGenerating}
                      />
                      <Badge variant="outline" className="text-xs">
                        Level {section.level}
                      </Badge>
                    </div>
                    <label
                      className="sr-only"
                      htmlFor={`section-content-${index}`}
                    >
                      Section {index + 1} content
                    </label>
                    <textarea
                      id={`section-content-${index}`}
                      value={section.content}
                      onChange={(e) =>
                        handleSectionEdit(index, 'content', e.target.value)
                      }
                      rows={3}
                      className="text-muted-foreground w-full resize-none bg-transparent text-xs focus:outline-none"
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
                  value={skillLevel}
                  onChange={setSkillLevel}
                  variant="primary"
                />
                <span className="text-sm">with</span>
                <InlineDropdown
                  id={`${baseId}-weekly-hours`}
                  options={WEEKLY_HOURS_OPTIONS}
                  value={weeklyHours}
                  onChange={setWeeklyHours}
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
                  value={learningStyle}
                  onChange={setLearningStyle}
                  variant="accent"
                />
                <span className="text-sm">and want to finish in</span>
                <InlineDropdown
                  id={`${baseId}-deadline`}
                  options={DEADLINE_OPTIONS}
                  value={deadlineWeeks}
                  onChange={setDeadlineWeeks}
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
                onClick={() => onSwitchToManual(mainTopic)}
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
              disabled={isGenerating || !mainTopic.trim()}
              className="group from-primary via-accent to-primary shadow-primary/25 hover:shadow-primary/30 h-auto rounded-2xl bg-gradient-to-r px-6 py-3 text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl"
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
