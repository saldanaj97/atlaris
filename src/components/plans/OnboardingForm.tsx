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
import { ArrowLeft, ArrowRight, BookOpen, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface OnboardingFormProps {
  onBack: () => void;
  onComplete: (data: FormData) => void;
}

interface FormData {
  topic: string;
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  additionalInfo: string;
}

const OnboardingForm = ({ onBack, onComplete }: OnboardingFormProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    topic: '',
    skillLevel: '',
    weeklyHours: '',
    learningStyle: '',
    additionalInfo: '',
  });

  const totalSteps = 4;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      onBack();
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.topic ||
      !formData.skillLevel ||
      !formData.weeklyHours ||
      !formData.learningStyle
    ) {
      toast('Missing Information', {
        description: 'Please fill in all required fields.',
      });
      return;
    }

    setIsLoading(true);

    // simulate API call with promise-based delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsLoading(false);
    onComplete(formData);
  };

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isStepComplete = (step: number) => {
    switch (step) {
      case 1:
        return !!formData.topic;
      case 2:
        return !!formData.skillLevel;
      case 3:
        return !!formData.weeklyHours;
      case 4:
        return !!formData.learningStyle;
      default:
        return false;
    }
  };

  const canProceed = isStepComplete(currentStep);

  return (
    <div className="bg-gradient-subtle min-h-screen">
      {/* Header */}
      <header className="container mx-auto px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="text-primary h-8 w-8" />
            <span className="text-2xl font-bold">LearnPath</span>
          </div>
          <div className="text-muted-foreground text-sm">
            Step {currentStep} of {totalSteps}
          </div>
        </nav>
      </header>

      <div className="container mx-auto max-w-2xl px-6 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-muted-foreground text-sm">
              {Math.round((currentStep / totalSteps) * 100)}%
            </span>
          </div>
          <div className="bg-muted h-2 w-full rounded-full">
            <div
              className="bg-gradient-hero h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <Card className="bg-gradient-card border-0 p-8 shadow-lg">
          {/* Step 1: Topic */}
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
                  value={formData.topic}
                  onChange={(e) => updateFormData('topic', e.target.value)}
                  className="min-h-[120px]"
                />
                <p className="text-muted-foreground text-sm">
                  Examples: "Python for data science", "Japanese conversation",
                  "Guitar fingerpicking"
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Skill Level */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  What's your current skill level?
                </h1>
                <p className="text-muted-foreground">
                  This helps us tailor the complexity and starting point of your
                  learning path.
                </p>
              </div>

              <RadioGroup
                value={formData.skillLevel}
                onValueChange={(value) => updateFormData('skillLevel', value)}
                className="space-y-4"
              >
                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="beginner" id="beginner" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="beginner"
                      className="cursor-pointer text-base font-medium"
                    >
                      Beginner
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      I'm completely new to this topic
                    </p>
                  </div>
                </div>

                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="intermediate" id="intermediate" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="intermediate"
                      className="cursor-pointer text-base font-medium"
                    >
                      Intermediate
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      I have some basic knowledge and experience
                    </p>
                  </div>
                </div>

                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="advanced" id="advanced" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="advanced"
                      className="cursor-pointer text-base font-medium"
                    >
                      Advanced
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      I want to deepen existing knowledge or learn advanced
                      concepts
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Step 3: Time Commitment */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  How much time can you commit?
                </h1>
                <p className="text-muted-foreground">
                  We'll structure your learning plan to fit your schedule.
                </p>
              </div>

              <div className="space-y-4">
                <Label htmlFor="weeklyHours" className="text-base font-medium">
                  Weekly Hours Available *
                </Label>
                <Select
                  value={formData.weeklyHours}
                  onValueChange={(value) =>
                    updateFormData('weeklyHours', value)
                  }
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select your weekly availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-2">1-2 hours per week</SelectItem>
                    <SelectItem value="3-5">3-5 hours per week</SelectItem>
                    <SelectItem value="6-10">6-10 hours per week</SelectItem>
                    <SelectItem value="11-15">11-15 hours per week</SelectItem>
                    <SelectItem value="16-20">16-20 hours per week</SelectItem>
                    <SelectItem value="20+">20+ hours per week</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-sm">
                  Be realistic about your schedule for the best learning
                  experience.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Learning Style */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">
                  How do you prefer to learn?
                </h1>
                <p className="text-muted-foreground">
                  We'll prioritize resources that match your learning style.
                </p>
              </div>

              <RadioGroup
                value={formData.learningStyle}
                onValueChange={(value) =>
                  updateFormData('learningStyle', value)
                }
                className="space-y-4"
              >
                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="reading" id="reading" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="reading"
                      className="cursor-pointer text-base font-medium"
                    >
                      Reading & Documentation
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Books, articles, tutorials, and written guides
                    </p>
                  </div>
                </div>

                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="video" id="video" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="video"
                      className="cursor-pointer text-base font-medium"
                    >
                      Video Content
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      YouTube tutorials, online courses, and video lectures
                    </p>
                  </div>
                </div>

                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="hands-on" id="hands-on" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="hands-on"
                      className="cursor-pointer text-base font-medium"
                    >
                      Hands-on Practice
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Projects, exercises, and learning by doing
                    </p>
                  </div>
                </div>

                <div className="hover:bg-muted/50 flex items-center space-x-2 rounded-lg border p-4 transition-colors">
                  <RadioGroupItem value="mixed" id="mixed" />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="mixed"
                      className="cursor-pointer text-base font-medium"
                    >
                      Mixed Approach
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Combination of reading, videos, and practical exercises
                    </p>
                  </div>
                </div>
              </RadioGroup>

              <div className="space-y-4 border-t pt-4">
                <Label
                  htmlFor="additionalInfo"
                  className="text-base font-medium"
                >
                  Additional Information (Optional)
                </Label>
                <Textarea
                  id="additionalInfo"
                  placeholder="Any specific goals, preferences, or constraints we should know about?"
                  value={formData.additionalInfo}
                  onChange={(e) =>
                    updateFormData('additionalInfo', e.target.value)
                  }
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between border-t pt-8">
            <Button variant="outline" onClick={handlePrevious}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {currentStep === 1 ? 'Back to Home' : 'Previous'}
            </Button>

            <Button
              onClick={currentStep === totalSteps ? handleSubmit : handleNext}
              disabled={!canProceed || isLoading}
              className="bg-gradient-hero hover:shadow-glow"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : currentStep === totalSteps ? (
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
};

export default OnboardingForm;
