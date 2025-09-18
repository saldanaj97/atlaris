import HeroImage from '@/assets/images/hero-learning.jpg';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, Clock, Target, Zap } from 'lucide-react';
import Image from 'next/image';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage = ({ onGetStarted }: LandingPageProps) => {
  return (
    <div className="bg-gradient-subtle min-h-screen">
      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl leading-tight font-bold">
                Master Any Skill with
                <span className="block">Personalized Learning Paths</span>
              </h1>
              <p className="text-muted-foreground text-xl leading-relaxed">
                Transform your learning goals into structured, actionable
                roadmaps. Get personalized plans that adapt to your schedule,
                skill level, and preferred learning style.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={onGetStarted}
                className="bg-gradient-hero hover:shadow-glow transition-all duration-300"
              >
                Create Your First Path
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg">
                View Example
              </Button>
            </div>

            {/* Stats */}
            <div className="flex gap-8 border-t pt-8">
              <div>
                <div className="text-primary text-2xl font-bold">10K+</div>
                <div className="text-muted-foreground text-sm">
                  Learning Paths Created
                </div>
              </div>
              <div>
                <div className="text-primary text-2xl font-bold">95%</div>
                <div className="text-muted-foreground text-sm">
                  Completion Rate
                </div>
              </div>
              <div>
                <div className="text-primary text-2xl font-bold">4.9★</div>
                <div className="text-muted-foreground text-sm">User Rating</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <Image
              src={HeroImage}
              alt="People learning with technology"
              className="rounded-2xl shadow-lg"
              placeholder="blur"
            />
            <div className="bg-card absolute -bottom-6 -left-6 rounded-xl border p-4 shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Swift iOS Development</div>
                  <div className="text-muted-foreground text-sm">
                    8 weeks • Beginner
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-16">
        <div className="mb-12 space-y-4 text-center">
          <h2 className="text-3xl font-bold">Why Choose LearnPath?</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl text-xl">
            We make learning efficient, structured, and tailored to your unique
            needs.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <Card className="bg-gradient-card space-y-4 border-0 p-8 text-center shadow-md transition-all hover:shadow-lg">
            <div className="bg-learning-primary/10 mx-auto flex h-12 w-12 items-center justify-center rounded-xl">
              <Target className="text-learning-primary h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold">Personalized Plans</h3>
            <p className="text-muted-foreground">
              Every learning path is tailored to your skill level, available
              time, and preferred learning style.
            </p>
          </Card>

          <Card className="bg-gradient-card space-y-4 border-0 p-8 text-center shadow-md transition-all hover:shadow-lg">
            <div className="bg-learning-secondary/10 mx-auto flex h-12 w-12 items-center justify-center rounded-xl">
              <Clock className="text-learning-secondary h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold">Time-Optimized</h3>
            <p className="text-muted-foreground">
              Plans adapt to your schedule, whether you have 2 hours or 20 hours
              per week to learn.
            </p>
          </Card>

          <Card className="bg-gradient-card space-y-4 border-0 p-8 text-center shadow-md transition-all hover:shadow-lg">
            <div className="bg-learning-success/10 mx-auto flex h-12 w-12 items-center justify-center rounded-xl">
              <ArrowRight className="text-learning-success h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold">Seamless Export</h3>
            <p className="text-muted-foreground">
              Export to Notion, Google Calendar, or download as CSV. Integrate
              with your existing workflow.
            </p>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to Start Learning?</h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl opacity-90">
            Join thousands of learners who've transformed their skills with
            personalized learning paths.
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={onGetStarted}
            className="text-primary bg-white hover:bg-white/90"
          >
            Create Your Learning Path
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
