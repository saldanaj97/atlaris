'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import { TIER_LIMITS } from '@/lib/stripe/tier-limits';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';

import { PlanDraftView } from '@/components/plans/PlanDraftView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

type FormState = {
  topic: string;
  skillLevel: (typeof skillLevelOptions)[number]['value'] | '';
  weeklyHours: (typeof weeklyHourOptions)[number]['value'] | '';
  learningStyle: (typeof learningStyleOptions)[number]['value'] | '';
  notes: string;
  startDate?: string;
  deadlineDate: string;
};

interface StreamingError extends Error {
  status?: number;
  planId?: string;
  data?: { planId?: string };
}

const weeklyHourOptions = [
  { value: '1-2', label: '1-2 hours per week' },
  { value: '3-5', label: '3-5 hours per week' },
  { value: '6-10', label: '6-10 hours per week' },
  { value: '11-15', label: '11-15 hours per week' },
  { value: '16-20', label: '16-20 hours per week' },
  { value: '20+', label: '20+ hours per week' },
] as const;

const skillLevelOptions = [
  {
    value: 'beginner',
    title: 'Beginner',
    description: "I\'m completely new to this topic",
  },
  {
    value: 'intermediate',
    title: 'Intermediate',
    description: 'I have some basic knowledge and experience',
  },
  {
    value: 'advanced',
    title: 'Advanced',
    description:
      'I want to deepen existing knowledge or learn advanced concepts',
  },
] as const;

const learningStyleOptions = [
  {
    value: 'reading',
    title: 'Reading & Documentation',
    description: 'Books, articles, tutorials, and written guides',
  },
  {
    value: 'video',
    title: 'Video Content',
    description: 'YouTube tutorials, online courses, and video lectures',
  },
  {
    value: 'practice',
    title: 'Hands-on Practice',
    description: 'Projects, exercises, and learning by doing',
  },
  {
    value: 'mixed',
    title: 'Mixed Approach',
    description: 'Combination of reading, videos, and practical exercises',
  },
] as const;

const initialState: FormState = {
  topic: '',
  skillLevel: '',
  weeklyHours: '',
  learningStyle: '',
  notes: '',
  startDate: undefined,
  deadlineDate: '',
};

const TOTAL_STEPS = 5;

// Define once to avoid re-creating on every render

export default function OnboardingForm() {
  const today = new Date();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialState);
  const [stepError, setStepError] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<'free' | 'starter' | 'pro' | null>(
    null
  );
  const {
    state: streamingState,
    startGeneration,
    cancel: cancelStreaming,
  } = useStreamingPlanGeneration();

  // Ref to track the latest planId to avoid stale closure issues in error handlers
  const planIdRef = useRef<string | undefined>(undefined);

  // Sync planIdRef with streamingState.planId
  useEffect(() => {
    planIdRef.current = streamingState.planId;
  }, [streamingState.planId]);

  // Fetch user tier on mount
  useEffect(() => {
    const fetchUserTier = async () => {
      try {
        const res = await fetch('/api/v1/user/subscription');
        if (res.ok) {
          const data = (await res.json()) as {
            tier?: 'free' | 'starter' | 'pro';
          };
          setUserTier(data.tier || 'free');
        } else {
          setUserTier('free');
        }
      } catch (error) {
        clientLogger.error('Failed to fetch user tier:', error);
        setUserTier('free');
      }
    };
    void fetchUserTier();
  }, []);

  const updateField = <Key extends keyof FormState>(
    field: Key,
    value: FormState[Key]
  ) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    if (stepError) {
      setStepError(null);
    }
  };

  const stepHasRequiredValues = (step: number) => {
    switch (step) {
      case 1:
        return Boolean(formState.topic.trim());
      case 2:
        return Boolean(formState.skillLevel);
      case 3:
        return Boolean(formState.weeklyHours);
      case 4:
        return Boolean(formState.learningStyle);
      case 5:
        return Boolean(formState.deadlineDate);
      default:
        return true;
    }
  };

  const validateStep = (step: number) => {
    if (stepHasRequiredValues(step)) {
      return true;
    }

    switch (step) {
      case 1:
        setStepError('Please describe what you want to learn.');
        break;
      case 2:
        setStepError('Select the skill level that best matches you.');
        break;
      case 3:
        setStepError('Choose how much time you can commit each week.');
        break;
      case 4:
        setStepError('Pick the learning style that fits you best.');
        break;
      case 5:
        setStepError('Please select a deadline date.');
        break;
      default:
        setStepError(null);
    }

    return false;
  };

  const goToNextStep = () => {
    if (!validateStep(currentStep)) {
      return;
    }
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep === 1) {
      router.back();
      return;
    }
    setCurrentStep((prev) => Math.max(1, prev - 1));
    setStepError(null);
  };

  const isCurrentStepComplete = stepHasRequiredValues(currentStep);

  // Calculate duration in weeks for cap check
  const calculateDurationWeeks = (): number | null => {
    if (!formState.deadlineDate) return null;
    const start = formState.startDate
      ? new Date(formState.startDate)
      : new Date();
    const deadline = new Date(formState.deadlineDate);
    const diffTime = deadline.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.ceil(diffDays / 7);
  };

  const durationWeeks = calculateDurationWeeks();
  const exceedsFreeCap =
    userTier === 'free' &&
    durationWeeks !== null &&
    durationWeeks > TIER_LIMITS.free.maxWeeks;

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    const rawValues: OnboardingFormValues = {
      topic: formState.topic,
      skillLevel: formState.skillLevel,
      weeklyHours: formState.weeklyHours,
      learningStyle: formState.learningStyle,
      notes: formState.notes.trim() || undefined,
      startDate: formState.startDate || undefined,
      deadlineDate: formState.deadlineDate,
    };

    let payload;
    try {
      payload = mapOnboardingToCreateInput(rawValues);
    } catch (error) {
      clientLogger.error('Failed to map onboarding values', error);
      toast.error('Please double-check the form and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const planId = await startGeneration(payload);
      toast.success('Your learning plan is ready!');
      router.push(`/plans/${planId}`);
    } catch (streamError) {
      const isAbort =
        (streamError as DOMException | undefined)?.name === 'AbortError';
      if (isAbort) {
        return;
      }

      clientLogger.error('Streaming plan generation failed', streamError);

      const errorWithStatus = streamError as StreamingError;
      const message =
        streamError instanceof Error
          ? streamError.message
          : 'We could not create your learning plan. Please try again.';

      // Attempt to extract planId: (1) from error payload, (2) from ref tracking latest state
      const extractedPlanId =
        errorWithStatus.planId ??
        errorWithStatus.data?.planId ??
        planIdRef.current;

      // Note: We may enter this catch even when HTTP status was 200 because
      // streaming or parsing errors can occur after a successful response. In
      // that case we still want to redirect to the created plan so users can
      // retry from the plan page.
      // If plan was created but generation failed, redirect to plan page
      // The plan page will show the failed state with a retry button
      if (
        (errorWithStatus.status === 200 || extractedPlanId) &&
        typeof extractedPlanId === 'string' &&
        extractedPlanId.length > 0
      ) {
        toast.error('Generation failed. You can retry from the plan page.');
        router.push(`/plans/${extractedPlanId}`);
        return;
      }

      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="text-foreground text-sm" aria-live="polite">
            Step {currentStep} of {TOTAL_STEPS}
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-6 py-8">
        <div className="mb-8" aria-hidden>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm">
              {Math.round((currentStep / TOTAL_STEPS) * 100)}%
            </span>
          </div>
          <div className="bg-muted h-2 w-full rounded-full">
            <Progress value={Math.round((currentStep / TOTAL_STEPS) * 100)} />
          </div>
        </div>

        <Card
          className="p-8"
          role="form"
          aria-labelledby="onboarding-form-heading"
        >
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  What would you like to learn?
                </h1>
                <p className="text-muted-foreground">
                  Tell us the skill or topic you want to master. Be as specific
                  as possible.
                </p>
              </div>

              <div className="space-y-4">
                <Label htmlFor="topic" className="text-base font-medium">
                  Learning Topic *
                </Label>
                <Textarea
                  id="topic"
                  placeholder="e.g., Swift for iOS development, Advanced Excel formulas, Digital marketing fundamentals..."
                  value={formState.topic}
                  onChange={(event) => updateField('topic', event.target.value)}
                  className="neobrutalism-shadow border-foreground min-h-[120px] border-2"
                  aria-invalid={currentStep === 1 && !!stepError}
                  aria-describedby={
                    currentStep === 1 && stepError ? 'step-error' : undefined
                  }
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  What&apos;s your current skill level?
                </h1>
                <p className="text-muted-foreground">
                  This helps us tailor the complexity and starting point of your
                  learning path.
                </p>
              </div>

              <RadioGroup
                value={formState.skillLevel}
                onValueChange={(value) =>
                  updateField('skillLevel', value as FormState['skillLevel'])
                }
                className="space-y-4"
              >
                {skillLevelOptions.map((option) => (
                  <div
                    key={option.value}
                    className="hover:bg-muted-foreground/30 flex items-center space-x-2 rounded-lg border-2 p-4 transition-colors"
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor={option.value}
                        className="cursor-pointer text-base font-medium"
                      >
                        {option.title}
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  How much time can you commit?
                </h1>
                <p className="text-muted-foreground">
                  We&apos;ll structure your learning plan to fit your schedule.
                </p>
              </div>

              <div className="space-y-4">
                <Label htmlFor="weeklyHours" className="text-base font-medium">
                  Weekly Hours Available *
                </Label>
                <Select
                  value={formState.weeklyHours}
                  onValueChange={(value) =>
                    updateField(
                      'weeklyHours',
                      value as FormState['weeklyHours']
                    )
                  }
                >
                  <SelectTrigger
                    id="weeklyHours"
                    className="bg-card-background h-12 border-2"
                    aria-invalid={currentStep === 3 && !!stepError}
                  >
                    <SelectValue placeholder="Select your weekly availability" />
                  </SelectTrigger>
                  <SelectContent className="bg-card-background border-2">
                    {weeklyHourOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-sm">
                  Be realistic about your schedule for the best learning
                  experience.
                </p>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  How do you prefer to learn?
                </h1>
                <p className="text-muted-foreground">
                  We&apos;ll prioritize resources that match your learning
                  style.
                </p>
              </div>

              <RadioGroup
                value={formState.learningStyle}
                onValueChange={(value) =>
                  updateField(
                    'learningStyle',
                    value as FormState['learningStyle']
                  )
                }
                className="space-y-4"
              >
                {learningStyleOptions.map((option) => (
                  <div
                    key={option.value}
                    className="hover:bg-muted-foreground/30 flex items-center space-x-2 rounded-lg border-2 p-4 transition-colors"
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor={option.value}
                        className="cursor-pointer text-base font-medium"
                      >
                        {option.title}
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>

              <div className="space-y-4 border-t pt-4">
                <Label htmlFor="notes" className="text-base font-medium">
                  Additional Information (Optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Any specific goals, preferences, or constraints we should know about?"
                  value={formState.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  className="bg-card-background min-h-[80px] border-2"
                />
                <p className="text-muted-foreground text-xs">
                  We&apos;ll add manual notes support once the backend is ready.
                  For now this helps tune your generated path.
                </p>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  When do you want to complete this?
                </h1>
                <p className="text-muted-foreground">
                  Set your timeline so we can pace your learning plan
                  accordingly.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <Label htmlFor="startDate" className="text-base font-medium">
                    Start Date (Optional)
                  </Label>
                  <DatePicker
                    id="startDate"
                    value={formState.startDate || undefined}
                    onChange={(val: Date | undefined) => {
                      if (!val) {
                        updateField('startDate', undefined);
                        return;
                      }
                      const year = val.getFullYear();
                      const month = String(val.getMonth() + 1).padStart(2, '0');
                      const day = String(val.getDate()).padStart(2, '0');
                      const isoString = `${year}-${month}-${day}`;
                      updateField('startDate', isoString);
                    }}
                    placeholder="Pick a start date"
                    minDate={today}
                  />
                  <p className="text-muted-foreground text-xs">
                    Leave empty to start today
                  </p>
                </div>

                <div className="space-y-4">
                  <Label
                    htmlFor="deadlineDate"
                    className="text-base font-medium"
                  >
                    Deadline Date *
                  </Label>
                  <DatePicker
                    id="deadlineDate"
                    value={formState.deadlineDate || undefined}
                    onChange={(val: Date | undefined) => {
                      if (!val) {
                        updateField('deadlineDate', '');
                        return;
                      }
                      const year = val.getFullYear();
                      const month = String(val.getMonth() + 1).padStart(2, '0');
                      const day = String(val.getDate()).padStart(2, '0');
                      const isoString = `${year}-${month}-${day}`;
                      updateField('deadlineDate', isoString);
                    }}
                    placeholder="Pick a deadline"
                    required
                    minDate={today}
                    className={
                      currentStep === 5 && !!stepError
                        ? 'border-destructive'
                        : undefined
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    Your learning plan will be structured to help you meet this
                    goal.
                  </p>
                  {exceedsFreeCap && (
                    <div className="mt-4 rounded-lg border border-yellow-500/50 bg-yellow-50 p-4 dark:bg-yellow-950/20">
                      <p className="text-sm text-yellow-900 dark:text-yellow-100">
                        Free tier limited to {TIER_LIMITS.free.maxWeeks}-week
                        plans. Upgrade to{' '}
                        <Link
                          href="/pricing"
                          className="font-semibold underline hover:no-underline"
                        >
                          Starter or Pro
                        </Link>{' '}
                        for longer plans.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {stepError && (
            <p
              id="step-error"
              className="text-destructive mt-6 text-sm"
              role="alert"
            >
              {stepError}
            </p>
          )}

          <div className="flex justify-between border-t pt-8">
            <Button onClick={goToPreviousStep} disabled={isSubmitting}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {currentStep === 1 ? 'Back' : 'Previous'}
            </Button>

            <Button
              onClick={
                currentStep === TOTAL_STEPS ? handleSubmit : goToNextStep
              }
              disabled={isSubmitting || !isCurrentStepComplete}
              className="bg-gradient-hero"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : currentStep === TOTAL_STEPS ? (
                'Generate Learning Path'
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>

      {streamingState.status !== 'idle' && (
        <div className="container mx-auto max-w-2xl px-6 pb-12">
          <PlanDraftView
            state={streamingState}
            onCancel={() => {
              cancelStreaming();
              setIsSubmitting(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
