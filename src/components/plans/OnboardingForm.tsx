'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { createPlan } from '@/lib/api/plans';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
    description: 'I want to deepen existing knowledge or learn advanced concepts',
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

type FormState = {
  topic: string;
  skillLevel: (typeof skillLevelOptions)[number]['value'] | '';
  weeklyHours: (typeof weeklyHourOptions)[number]['value'] | '';
  learningStyle: (typeof learningStyleOptions)[number]['value'] | '';
  notes: string;
};

const initialState: FormState = {
  topic: '',
  skillLevel: '',
  weeklyHours: '',
  learningStyle: '',
  notes: '',
};

const TOTAL_STEPS = 4;

export default function OnboardingForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialState);
  const [stepError, setStepError] = useState<string | null>(null);

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
    };

    let payload;
    try {
      payload = mapOnboardingToCreateInput(rawValues);
    } catch (error) {
      console.error('Failed to map onboarding values', error);
      toast.error('Please double-check the form and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const plan = await createPlan(payload);
      toast.success('Learning path created!');
      router.push(`/plans/${plan.id}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'We could not create your learning plan. Please try again.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <header className="container mx-auto px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="text-muted-foreground text-sm" aria-live="polite">
            Step {currentStep} of {TOTAL_STEPS}
          </div>
        </nav>
      </header>

      <div className="container mx-auto max-w-2xl px-6 py-8">
        <div className="mb-8" aria-hidden>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-muted-foreground text-sm">
              {Math.round((currentStep / TOTAL_STEPS) * 100)}%
            </span>
          </div>
          <div className="bg-muted h-2 w-full rounded-full">
            <div
              className="bg-gradient-hero h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <Card className="bg-gradient-card border-0 p-8 shadow-lg" role="form" aria-labelledby="onboarding-form-heading">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 id="onboarding-form-heading" className="text-3xl font-bold">
                  What would you like to learn?
                </h1>
                <p className="text-muted-foreground">
                  Tell us the skill or topic you want to master. Be as specific as possible.
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
                  className="min-h-[120px]"
                  aria-invalid={currentStep === 1 && !!stepError}
                  aria-describedby={currentStep === 1 && stepError ? 'step-error' : undefined}
                />
                <p className="text-muted-foreground text-sm">
                  Examples: "Python for data science", "Japanese conversation", "Guitar fingerpicking"
                </p>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">What\'s your current skill level?</h1>
                <p className="text-muted-foreground">
                  This helps us tailor the complexity and starting point of your learning path.
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
                    className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors"
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={option.value} className="cursor-pointer text-base font-medium">
                        {option.title}
                      </Label>
                      <p className="text-muted-foreground text-sm">{option.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">How much time can you commit?</h1>
                <p className="text-muted-foreground">
                  We\'ll structure your learning plan to fit your schedule.
                </p>
              </div>

              <div className="space-y-4">
                <Label htmlFor="weeklyHours" className="text-base font-medium">
                  Weekly Hours Available *
                </Label>
                <Select
                  value={formState.weeklyHours}
                  onValueChange={(value) =>
                    updateField('weeklyHours', value as FormState['weeklyHours'])
                  }
                >
                  <SelectTrigger id="weeklyHours" className="h-12" aria-invalid={currentStep === 3 && !!stepError}>
                    <SelectValue placeholder="Select your weekly availability" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeklyHourOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-sm">
                  Be realistic about your schedule for the best learning experience.
                </p>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">How do you prefer to learn?</h1>
                <p className="text-muted-foreground">
                  We\'ll prioritize resources that match your learning style.
                </p>
              </div>

              <RadioGroup
                value={formState.learningStyle}
                onValueChange={(value) =>
                  updateField('learningStyle', value as FormState['learningStyle'])
                }
                className="space-y-4"
              >
                {learningStyleOptions.map((option) => (
                  <div
                    key={option.value}
                    className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors"
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={option.value} className="cursor-pointer text-base font-medium">
                        {option.title}
                      </Label>
                      <p className="text-muted-foreground text-sm">{option.description}</p>
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
                  className="min-h-[80px]"
                />
                <p className="text-muted-foreground text-xs">
                  We\'ll add manual notes support once the backend is ready. For now this helps tune your generated path.
                </p>
              </div>
            </div>
          )}

          {stepError && (
            <p id="step-error" className="text-destructive mt-6 text-sm" role="alert">
              {stepError}
            </p>
          )}

          <div className="flex justify-between border-t pt-8">
            <Button variant="outline" onClick={goToPreviousStep} disabled={isSubmitting}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {currentStep === 1 ? 'Back' : 'Previous'}
            </Button>

            <Button
              onClick={currentStep === TOTAL_STEPS ? handleSubmit : goToNextStep}
              disabled={isSubmitting || !isCurrentStepComplete}
              className="bg-gradient-hero hover:shadow-glow"
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
    </div>
  );
}
