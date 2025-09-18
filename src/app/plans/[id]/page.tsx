'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  PlayCircle,
  Star,
  Target,
} from 'lucide-react';
import { useState } from 'react';

interface LearningPlanProps {
  formData: {
    topic: string;
    skillLevel: string;
    weeklyHours: string;
    learningStyle: string;
    additionalInfo: string;
  };
  onBack: () => void;
  onExport: (type: string) => void;
}

interface Module {
  id: number;
  title: string;
  description: string;
  estimatedHours: number;
  week: number;
  resources: Resource[];
  completed: boolean;
}

interface Resource {
  id: number;
  title: string;
  type: 'video' | 'article' | 'practice' | 'book';
  url: string;
  duration?: string;
}

// Mock learning plan data - in real app this would come from backend
const mockModules: Module[] = [
  {
    id: 1,
    title: 'Swift Fundamentals',
    description:
      'Learn basic syntax, variables, constants, and data types in Swift programming language.',
    estimatedHours: 8,
    week: 1,
    completed: false,
    resources: [
      {
        id: 1,
        title: 'Swift Programming Basics',
        type: 'video',
        url: '#',
        duration: '2h 30m',
      },
      { id: 2, title: 'Swift Syntax Guide', type: 'article', url: '#' },
      {
        id: 3,
        title: 'Variables & Constants Practice',
        type: 'practice',
        url: '#',
        duration: '1h',
      },
    ],
  },
  {
    id: 2,
    title: 'Object-Oriented Programming in Swift',
    description:
      'Understand classes, structures, protocols, and inheritance in Swift.',
    estimatedHours: 12,
    week: 2,
    completed: false,
    resources: [
      {
        id: 4,
        title: 'OOP Concepts in Swift',
        type: 'video',
        url: '#',
        duration: '3h 15m',
      },
      {
        id: 5,
        title: 'Building Your First Class',
        type: 'practice',
        url: '#',
        duration: '2h',
      },
      {
        id: 6,
        title: 'Protocol-Oriented Programming',
        type: 'article',
        url: '#',
      },
    ],
  },
  {
    id: 3,
    title: 'iOS Development Basics',
    description:
      'Introduction to Xcode, Interface Builder, and basic app structure.',
    estimatedHours: 15,
    week: 3,
    completed: false,
    resources: [
      {
        id: 7,
        title: 'Getting Started with Xcode',
        type: 'video',
        url: '#',
        duration: '2h',
      },
      {
        id: 8,
        title: 'Your First iOS App',
        type: 'practice',
        url: '#',
        duration: '3h',
      },
      { id: 9, title: 'iOS App Architecture Guide', type: 'book', url: '#' },
    ],
  },
  {
    id: 4,
    title: 'User Interface Development',
    description:
      'Learn UIKit, Auto Layout, and creating responsive user interfaces.',
    estimatedHours: 20,
    week: 4,
    completed: false,
    resources: [
      {
        id: 10,
        title: 'UIKit Fundamentals',
        type: 'video',
        url: '#',
        duration: '4h',
      },
      {
        id: 11,
        title: 'Auto Layout Mastery',
        type: 'practice',
        url: '#',
        duration: '3h',
      },
      {
        id: 12,
        title: 'Interface Design Patterns',
        type: 'article',
        url: '#',
      },
    ],
  },
  {
    id: 5,
    title: 'Data Management & APIs',
    description:
      'Handle data persistence, networking, and API integration in iOS apps.',
    estimatedHours: 18,
    week: 5,
    completed: false,
    resources: [
      {
        id: 13,
        title: 'Core Data Essentials',
        type: 'video',
        url: '#',
        duration: '3h 30m',
      },
      {
        id: 14,
        title: 'REST API Integration',
        type: 'practice',
        url: '#',
        duration: '4h',
      },
      {
        id: 15,
        title: 'Data Management Best Practices',
        type: 'article',
        url: '#',
      },
    ],
  },
  {
    id: 6,
    title: 'App Store Deployment',
    description: 'Prepare, test, and deploy your iOS app to the App Store.',
    estimatedHours: 10,
    week: 6,
    completed: false,
    resources: [
      { id: 16, title: 'App Store Guidelines', type: 'article', url: '#' },
      {
        id: 17,
        title: 'Testing & Debugging',
        type: 'practice',
        url: '#',
        duration: '2h',
      },
      {
        id: 18,
        title: 'Deployment Walkthrough',
        type: 'video',
        url: '#',
        duration: '1h 30m',
      },
    ],
  },
];

const LearningPlanPage = ({
  formData,
  onBack,
  onExport,
}: LearningPlanProps) => {
  const [completedModules, setCompletedModules] = useState<number[]>([]);

  const totalHours = mockModules.reduce(
    (sum, module) => sum + module.estimatedHours,
    0
  );
  const completedHours = mockModules
    .filter((module) => completedModules.includes(module.id))
    .reduce((sum, module) => sum + module.estimatedHours, 0);

  const progressPercentage = (completedHours / totalHours) * 100;

  const toggleModuleCompletion = (moduleId: number) => {
    setCompletedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const getResourceIcon = (type: Resource['type']) => {
    switch (type) {
      case 'video':
        return PlayCircle;
      case 'article':
        return FileText;
      case 'practice':
        return Target;
      case 'book':
        return BookOpen;
      default:
        return FileText;
    }
  };

  const getResourceTypeColor = (type: Resource['type']) => {
    switch (type) {
      case 'video':
        return 'bg-red-500/10 text-red-600';
      case 'article':
        return 'bg-blue-500/10 text-blue-600';
      case 'practice':
        return 'bg-green-500/10 text-green-600';
      case 'book':
        return 'bg-purple-500/10 text-purple-600';
      default:
        return 'bg-gray-500/10 text-gray-600';
    }
  };

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto max-w-7xl px-6 py-8">
        {/* Plan Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Form
          </Button>

          <Card className="bg-gradient-card border-0 p-8 shadow-lg">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-4 md:col-span-2">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold">Topic</h1>
                  <div className="text-muted-foreground flex items-center gap-4 text-sm">
                    <Badge variant="secondary">Skill Level</Badge>
                    <span className="flex items-center">
                      <Clock className="mr-1 h-4 w-4" />
                      Weekly Hours
                    </span>
                    <span>6 weeks total</span>
                  </div>
                </div>

                <p className="text-muted-foreground">
                  A comprehensive learning path designed for your{' '}
                  {' formData.skillLevel'} level, optimized for{' '}
                  {' formData.learningStyle'} learning style with{' '}
                  {' formData.weeklyHours'} weekly commitment.
                </p>

                <div className="flex items-center gap-2 text-sm">
                  <Star className="h-4 w-4 fill-current text-yellow-500" />
                  <span className="font-medium">Personalized curriculum</span>
                  <span className="text-muted-foreground">
                    • Updated based on your progress
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-primary/5 rounded-lg p-4 text-center">
                  <div className="text-primary text-2xl font-bold">
                    {Math.round(progressPercentage)}%
                  </div>
                  <div className="text-muted-foreground text-sm">Complete</div>
                  <Progress value={progressPercentage} className="mt-2" />
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold">
                      {completedHours}h
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Completed
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{totalHours}h</div>
                    <div className="text-muted-foreground text-xs">Total</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 flex gap-4">
          <Button onClick={() => onExport('notion')} className="flex-1">
            <Download className="mr-2 h-4 w-4" />
            Export to Notion
          </Button>
          <Button
            onClick={() => onExport('calendar')}
            variant="outline"
            className="flex-1"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>
          <Button
            onClick={() => onExport('csv')}
            variant="outline"
            className="flex-1"
          >
            <FileText className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </div>

        {/* Learning Modules */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Learning Modules</h2>

          {mockModules.map((module) => {
            const isCompleted = completedModules.includes(module.id);

            return (
              <Card
                key={module.id}
                className={`p-6 transition-all ${isCompleted ? 'bg-muted/50' : 'bg-gradient-card hover:shadow-md'} border-0 shadow-sm`}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex flex-1 items-start space-x-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleModuleCompletion(module.id)}
                      className={`mt-1 ${isCompleted ? 'text-green-600' : 'text-muted-foreground'}`}
                    >
                      <CheckCircle
                        className={`h-5 w-5 ${isCompleted ? 'fill-current' : ''}`}
                      />
                    </Button>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <h3
                          className={`text-xl font-semibold ${isCompleted ? 'text-muted-foreground line-through' : ''}`}
                        >
                          Week {module.week}: {module.title}
                        </h3>
                        <Badge variant="outline" className="text-xs">
                          {module.estimatedHours}h
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="ml-9 space-y-3">
                  <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                    Resources
                  </h4>
                  <div className="grid gap-3">
                    {module.resources.map((resource) => {
                      const ResourceIcon = getResourceIcon(resource.type);

                      return (
                        <div
                          key={resource.id}
                          className="bg-background/50 flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`rounded-md p-2 ${getResourceTypeColor(resource.type)}`}
                            >
                              <ResourceIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {resource.title}
                              </div>
                              {resource.duration && (
                                <div className="text-muted-foreground text-sm">
                                  {resource.duration}
                                </div>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="bg-gradient-hero mt-12 rounded-2xl p-6 text-center text-white">
          <h3 className="mb-2 text-xl font-bold">Ready to start learning?</h3>
          <p className="mb-4 opacity-90">
            Your personalized learning path is ready. Start with Week 1 and
            track your progress!
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="text-primary bg-white hover:bg-white/90"
          >
            Begin Learning Journey
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LearningPlanPage;
