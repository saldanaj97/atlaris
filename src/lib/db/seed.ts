import { appEnv, devAuthEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { reset, seed } from 'drizzle-seed';
import * as schema from './schema';

dotenv.config();

// Learning topics for realistic data
const learningTopics = [
  'JavaScript Fundamentals',
  'Python for Beginners',
  'React Development',
  'Machine Learning with Python',
  'Data Science Essentials',
  'Web Development Full Stack',
  'Node.js Backend Development',
  'TypeScript Advanced',
  'Database Design & SQL',
  'DevOps and CI/CD',
  'Mobile App Development',
  'UI/UX Design Principles',
  'Cybersecurity Basics',
  'Cloud Computing with AWS',
  'Docker and Containerization',
  'API Development',
  'Git Version Control',
  'Agile Project Management',
  'Digital Marketing',
  'Blockchain Development',
  'GraphQL and Modern APIs',
  'Microservices Architecture',
  'Testing and QA',
  'Performance Optimization',
  'Artificial Intelligence Basics',
];

// Module titles by topic type
const moduleTemplates = {
  programming: [
    'Getting Started and Environment Setup',
    'Core Concepts and Syntax',
    'Data Structures and Algorithms',
    'Object-Oriented Programming',
    'Functional Programming Concepts',
    'Error Handling and Debugging',
    'Testing and Quality Assurance',
    'Best Practices and Code Review',
    'Advanced Patterns and Techniques',
    'Real-World Project Implementation',
  ],
  webdev: [
    'HTML and Semantic Markup',
    'CSS and Responsive Design',
    'JavaScript Fundamentals',
    'Frontend Framework Introduction',
    'State Management',
    'API Integration',
    'Authentication and Security',
    'Performance Optimization',
    'Deployment and Hosting',
    'Maintenance and Scaling',
  ],
  data: [
    'Data Collection and Preprocessing',
    'Exploratory Data Analysis',
    'Statistical Methods',
    'Data Visualization',
    'Machine Learning Algorithms',
    'Model Training and Validation',
    'Feature Engineering',
    'Model Deployment',
    'Performance Monitoring',
    'Ethics and Best Practices',
  ],
  general: [
    'Introduction and Overview',
    'Fundamental Concepts',
    'Practical Applications',
    'Tools and Technologies',
    'Advanced Techniques',
    'Real-World Case Studies',
    'Best Practices',
    'Common Pitfalls',
    'Industry Standards',
    'Future Trends',
  ],
};

// Task templates for different learning activities
const taskTemplates = [
  'Read introduction to {topic}',
  'Watch tutorial video on {concept}',
  'Complete hands-on exercise',
  'Build mini-project: {project}',
  'Review and summarize key concepts',
  'Practice coding challenges',
  'Explore documentation for {tool}',
  'Participate in community discussion',
  'Create personal notes and examples',
  'Take quiz or assessment',
  'Debug common errors and issues',
  'Research best practices',
  'Compare different approaches',
  'Implement advanced features',
  'Write unit tests',
  'Refactor and optimize code',
  'Document your learning journey',
  'Share project with community',
  'Prepare for next module',
  'Reflect on learning outcomes',
];

// Common domains for resource URLs
const domains = [
  'youtube.com',
  'medium.com',
  'dev.to',
  'github.com',
  'stackoverflow.com',
  'udemy.com',
  'coursera.org',
  'edx.org',
  'freecodecamp.org',
  'mdn.mozilla.org',
  'w3schools.com',
  'codecademy.com',
  'pluralsight.com',
  'egghead.io',
  'levelup.gitconnected.com',
];

// Popular author names for resources
const authorNames = [
  'John Smith',
  'Sarah Johnson',
  'Michael Chen',
  'Emily Rodriguez',
  'David Wilson',
  'Lisa Anderson',
  'Robert Taylor',
  'Jennifer Lee',
  'Christopher Brown',
  'Amanda Davis',
  'Programming with Mosh',
  'Traversy Media',
  'The Net Ninja',
  'Code with Mosh',
  'FreeCodeCamp',
  'Academind',
  'Tech with Tim',
  'Corey Schafer',
  'Brad Traversy',
  'Maximilian Schwarzmüller',
];

// AI models for plan generation records
const aiModels = [
  'gpt-4-turbo',
  'gpt-4',
  'claude-3-opus',
  'claude-3-sonnet',
  'gemini-pro',
  'llama-2-70b',
  'claude-3-haiku',
];

/**
 * Main seeding function
 */
export async function seedDatabase(
  db: ReturnType<typeof drizzle>,
  options?: {
    userCount?: number;
    planCount?: number;
    resourceCount?: number;
    reset?: boolean;
    seed?: number;
  }
) {
  const {
    userCount = 50,
    planCount = 150,
    resourceCount = 500,
    reset: shouldReset = false,
    seed: seedValue = 12345,
  } = options || {};

  logger.info({ emoji: '🌱' }, 'Starting database seeding...');

  // Reset database if requested
  if (shouldReset) {
    logger.info({ emoji: '🗑️' }, 'Resetting database...');
    await reset(db, schema);
    logger.info({ emoji: '✅' }, 'Database reset complete');
  }

  // generation_attempts captures real AI runs; keep empty during synthetic seeding
  await db.delete(schema.generationAttempts);

  // job_queue will be seeded manually after the main seed; clear any auto-generated data
  await db.delete(schema.jobQueue);

  logger.info(
    {
      userCount,
      planCount,
      resourceCount,
    },
    '📊 Seeding configuration'
  );

  let adjustedUserCount = userCount;
  let insertedDevUser = false;
  const isDevEnv = !appEnv.isProduction;

  // Seed the database with all tables and relationships
  // Optional: deterministic dev user injection (before randomized seeding)
  // for easier local testing and predictable auth
  const devAuthUserId = devAuthEnv.userId;
  const devEmail = devAuthEnv.email;
  const devName = devAuthEnv.name;

  if (isDevEnv && devAuthUserId) {
    try {
      // Attempt to insert deterministic dev user; ignore conflict if already present
      await db
        .insert(schema.users)
        .values({
          authUserId: devAuthUserId,
          email: devEmail,
          name: devName,
          subscriptionTier: 'free',
        })
        .onConflictDoNothing();
      insertedDevUser = true;
      logger.info(
        {
          authUserId: devAuthUserId,
        },
        '👤 Ensured deterministic dev user'
      );
    } catch (e) {
      logger.warn(
        {
          error: e,
        },
        '⚠️  Could not insert deterministic dev user'
      );
    }

    // If we successfully (or previously) have that user, reduce the random user count by 1
    if (insertedDevUser) {
      // We already inserted the deterministic dev user, so seed the remaining random users
      // (Bug fix: previously this erroneously added +1 resulting in an extra user)
      adjustedUserCount = Math.max(0, userCount - 1);
    }
  }

  await seed(db, schema, {
    count: adjustedUserCount, // Base count for users (plus deterministic dev user if added)
    seed: seedValue,
  }).refine((f) => ({
    // Users table - foundation of the system
    users: {
      count: adjustedUserCount,
      columns: {
        authUserId: f.string({ isUnique: true }), // Auth user IDs must be unique
        email: f.email(),
        name: f.fullName(),
        subscriptionTier: f.weightedRandom([
          { weight: 0.7, value: f.valuesFromArray({ values: ['free'] }) },
          { weight: 0.25, value: f.valuesFromArray({ values: ['pro'] }) },
          {
            weight: 0.05,
            value: f.valuesFromArray({ values: ['enterprise'] }),
          },
        ]),
      },
    },

    // Learning plans - 2-4 plans per user on average
    learningPlans: {
      count: planCount,
      columns: {
        topic: f.valuesFromArray({ values: learningTopics }),
        skillLevel: f.weightedRandom([
          { weight: 0.5, value: f.valuesFromArray({ values: ['beginner'] }) },
          {
            weight: 0.35,
            value: f.valuesFromArray({ values: ['intermediate'] }),
          },
          { weight: 0.15, value: f.valuesFromArray({ values: ['advanced'] }) },
        ]),
        weeklyHours: f.weightedRandom([
          { weight: 0.3, value: f.int({ minValue: 1, maxValue: 3 }) },
          { weight: 0.4, value: f.int({ minValue: 4, maxValue: 8 }) },
          { weight: 0.25, value: f.int({ minValue: 9, maxValue: 15 }) },
          { weight: 0.05, value: f.int({ minValue: 16, maxValue: 25 }) },
        ]),
        learningStyle: f.weightedRandom([
          { weight: 0.35, value: f.valuesFromArray({ values: ['reading'] }) },
          { weight: 0.25, value: f.valuesFromArray({ values: ['video'] }) },
          { weight: 0.15, value: f.valuesFromArray({ values: ['practice'] }) },
          { weight: 0.25, value: f.valuesFromArray({ values: ['mixed'] }) },
        ]),
        startDate: f.date({ minDate: '2024-01-01', maxDate: '2025-09-01' }),
        deadlineDate: f.date({ minDate: '2025-09-15', maxDate: '2026-12-31' }),
        visibility: f.valuesFromArray({ values: ['private'] }),
        origin: f.weightedRandom([
          { weight: 0.85, value: f.valuesFromArray({ values: ['ai'] }) },
          { weight: 0.1, value: f.valuesFromArray({ values: ['template'] }) },
          { weight: 0.05, value: f.valuesFromArray({ values: ['manual'] }) },
        ]),
      },
      with: {
        // Each plan gets 3-6 modules
        modules: [
          { weight: 0.3, count: [3, 4] },
          { weight: 0.5, count: [4, 5] },
          { weight: 0.2, count: [5, 6] },
        ],
      },
    },

    // Modules - generated via relationship
    modules: {
      columns: {
        order: f.intPrimaryKey(), // Sequential ordering within each plan starting from 1
        title: f.valuesFromArray({
          values: [
            ...moduleTemplates.programming,
            ...moduleTemplates.webdev,
            ...moduleTemplates.data,
            ...moduleTemplates.general,
          ],
        }),
        description: f.loremIpsum({ sentencesCount: 2 }),
        estimatedMinutes: f.weightedRandom([
          { weight: 0.2, value: f.int({ minValue: 60, maxValue: 120 }) }, // 1-2 hours
          { weight: 0.5, value: f.int({ minValue: 120, maxValue: 240 }) }, // 2-4 hours
          { weight: 0.25, value: f.int({ minValue: 240, maxValue: 360 }) }, // 4-6 hours
          { weight: 0.05, value: f.int({ minValue: 360, maxValue: 480 }) }, // 6-8 hours
        ]),
      },
      with: {
        // Each module gets 4-8 tasks
        tasks: [
          { weight: 0.25, count: [4, 5] },
          { weight: 0.4, count: [5, 6] },
          { weight: 0.25, count: [6, 7] },
          { weight: 0.1, count: [7, 8] },
        ],
      },
    },

    // Tasks - generated via relationship
    tasks: {
      columns: {
        order: f.intPrimaryKey(), // Sequential ordering within each module starting from 1
        title: f.valuesFromArray({ values: taskTemplates }),
        description: f.loremIpsum({ sentencesCount: 1 }),
        estimatedMinutes: f.weightedRandom([
          { weight: 0.4, value: f.int({ minValue: 15, maxValue: 30 }) }, // 15-30 min
          { weight: 0.35, value: f.int({ minValue: 30, maxValue: 60 }) }, // 30-60 min
          { weight: 0.2, value: f.int({ minValue: 60, maxValue: 90 }) }, // 1-1.5 hours
          { weight: 0.05, value: f.int({ minValue: 90, maxValue: 120 }) }, // 1.5-2 hours
        ]),
      },
    },

    // Resources - global catalog
    resources: {
      count: resourceCount,
      columns: {
        type: f.weightedRandom([
          { weight: 0.35, value: f.valuesFromArray({ values: ['article'] }) },
          { weight: 0.25, value: f.valuesFromArray({ values: ['youtube'] }) },
          { weight: 0.15, value: f.valuesFromArray({ values: ['doc'] }) },
          { weight: 0.15, value: f.valuesFromArray({ values: ['course'] }) },
          { weight: 0.1, value: f.valuesFromArray({ values: ['other'] }) },
        ]),
        title: f.valuesFromArray({
          values: [
            'Complete JavaScript Tutorial for Beginners',
            'Master Python in 30 Days',
            'React Crash Course - Full Tutorial',
            'Advanced TypeScript Techniques Explained',
            'Web Development Best Practices and Tips',
            'Real-World Node.js Project Walkthrough',
            'The Complete Guide to Machine Learning',
            'Understanding Database Design: A Deep Dive',
            'Getting Started with DevOps',
            'Advanced React Patterns and Techniques',
          ],
        }), // Dynamic titles based on type
        url: f.string({ isUnique: true }), // Unique URLs for resources
        domain: f.valuesFromArray({ values: domains }),
        author: f.weightedRandom([
          { weight: 0.3, value: f.valuesFromArray({ values: authorNames }) },
          { weight: 0.7, value: f.fullName() },
        ]),
        durationMinutes: f.weightedRandom([
          { weight: 0.3, value: f.default({ defaultValue: null }) }, // No duration for articles/docs
          { weight: 0.25, value: f.int({ minValue: 5, maxValue: 20 }) }, // Short videos
          { weight: 0.25, value: f.int({ minValue: 20, maxValue: 60 }) }, // Medium content
          { weight: 0.15, value: f.int({ minValue: 60, maxValue: 180 }) }, // Long videos
          { weight: 0.05, value: f.int({ minValue: 180, maxValue: 600 }) }, // Courses
        ]),
        costCents: f.weightedRandom([
          { weight: 0.6, value: f.default({ defaultValue: 0 }) }, // Free
          { weight: 0.2, value: f.int({ minValue: 999, maxValue: 4999 }) }, // $9.99-$49.99
          { weight: 0.15, value: f.int({ minValue: 4999, maxValue: 9999 }) }, // $49.99-$99.99
          { weight: 0.05, value: f.int({ minValue: 9999, maxValue: 29999 }) }, // $99.99-$299.99
        ]),
        currency: f.weightedRandom([
          { weight: 0.7, value: f.valuesFromArray({ values: ['USD'] }) },
          { weight: 0.15, value: f.valuesFromArray({ values: ['EUR'] }) },
          { weight: 0.1, value: f.valuesFromArray({ values: ['GBP'] }) },
          {
            weight: 0.05,
            value: f.valuesFromArray({ values: ['CAD', 'AUD'] }),
          },
        ]),
        tags: f.valuesFromArray({
          values: [
            'programming',
            'web-development',
            'data-science',
            'machine-learning',
            'tutorial',
            'advanced',
            'free',
            'certification',
            'mobile',
            'devops',
          ],
          arraySize: 3, // Generate arrays with 3 tags each
        }),
      },
    },

    // Task Resources - junction table between tasks and resources
    taskResources: {
      columns: {
        order: f.intPrimaryKey(), // Sequential ordering starting from 1
        notes: f.weightedRandom([
          { weight: 0.7, value: f.default({ defaultValue: null }) }, // Most have no notes
          { weight: 0.3, value: f.loremIpsum({ sentencesCount: 1 }) }, // Some have notes
        ]),
      },
    },

    // Note: Task Progress is generated in a post-seed step to guarantee unique (task_id, user_id)

    // Plan Generations - AI generation tracking
    planGenerations: {
      count: Math.floor(planCount * 0.3), // ~30% of plans have generation records
      columns: {
        model: f.valuesFromArray({ values: aiModels }),
        prompt: f.json(), // Will contain structured prompt data
        parameters: f.json(), // Temperature, max tokens, etc.
        outputSummary: f.json(), // High-level summary of what was generated
      },
    },

    // Job Queue - skip auto-generation; will be manually seeded after
    jobQueue: {
      count: 0,
    },
  }));

  // After randomized seeding, optionally create curated data for the deterministic dev user
  // so local development always has predictable, rich content to test UI flows.
  if (isDevEnv && insertedDevUser && devAuthUserId) {
    try {
      const devUser = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.authUserId, devAuthUserId))
        .limit(1);
      if (devUser.length) {
        const devUserId = devUser[0].id;
        // Check if the dev user already has curated plans (avoid duplicates on repeated runs)
        const existingPlans = await db
          .select({ id: schema.learningPlans.id })
          .from(schema.learningPlans)
          .where(eq(schema.learningPlans.userId, devUserId))
          .limit(1);
        if (existingPlans.length === 0) {
          logger.info(
            { emoji: '🛠️' },
            'Creating curated dev user learning plans...'
          );

          // Curated plan definitions (concise but representative)
          const curatedPlans: Array<{
            topic: string;
            skillLevel: 'beginner' | 'intermediate' | 'advanced';
            weeklyHours: number;
            learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
            visibility: 'private';
            origin: 'ai' | 'template' | 'manual';
            modules: Array<{
              title: string;
              description: string;
              estimatedMinutes: number;
              tasks: Array<{
                title: string;
                description: string;
                estimatedMinutes: number;
              }>;
            }>;
          }> = [
            {
              topic: 'Full-Stack Web Development (Sample)',
              skillLevel: 'beginner',
              weeklyHours: 6,
              learningStyle: 'mixed',
              visibility: 'private',
              origin: 'manual',
              modules: [
                {
                  title: 'Foundations & Tooling',
                  description:
                    'Environment setup, Git, and core web platform concepts.',
                  estimatedMinutes: 240,
                  tasks: [
                    {
                      title: 'Install and configure development environment',
                      description:
                        'Install Node.js, pnpm, VS Code extensions, and verify setup.',
                      estimatedMinutes: 45,
                    },
                    {
                      title: 'Practice HTML & CSS fundamentals',
                      description:
                        'Build a simple static page applying semantic structure and responsive layout.',
                      estimatedMinutes: 60,
                    },
                    {
                      title: 'Initialize Next.js project with Tailwind',
                      description:
                        'Create a new Next.js app, add Tailwind CSS, and deploy a starter page.',
                      estimatedMinutes: 75,
                    },
                    {
                      title: 'Version control workflow basics',
                      description:
                        'Branching, commits, pull requests, and code review checklist.',
                      estimatedMinutes: 60,
                    },
                  ],
                },
                {
                  title: 'Frontend Application Layer',
                  description:
                    'Core React patterns, state management, and UI composition.',
                  estimatedMinutes: 300,
                  tasks: [
                    {
                      title: 'Component composition & props',
                      description:
                        'Refactor UI into reusable, accessible components.',
                      estimatedMinutes: 60,
                    },
                    {
                      title: 'State management with hooks',
                      description:
                        'Use useState, useEffect, and custom hooks for derived behavior.',
                      estimatedMinutes: 75,
                    },
                    {
                      title: 'Implement form handling & validation',
                      description:
                        'Build a controlled form with client-side validation and error states.',
                      estimatedMinutes: 90,
                    },
                    {
                      title: 'Accessibility & performance pass',
                      description:
                        'Lighthouse / a11y audit and targeted improvements.',
                      estimatedMinutes: 75,
                    },
                  ],
                },
              ],
            },
            {
              topic: 'Python Data Science Crash Course (Sample)',
              skillLevel: 'intermediate',
              weeklyHours: 5,
              learningStyle: 'reading',
              visibility: 'private',
              origin: 'manual',
              modules: [
                {
                  title: 'Data Manipulation & Exploration',
                  description:
                    'Pandas, data frames, cleaning, and exploratory analysis.',
                  estimatedMinutes: 210,
                  tasks: [
                    {
                      title: 'Load and inspect dataset',
                      description:
                        'Use pandas to load CSV and explore schema & missing values.',
                      estimatedMinutes: 45,
                    },
                    {
                      title: 'Data cleaning pipeline',
                      description:
                        'Handle nulls, types, normalization, and basic feature extraction.',
                      estimatedMinutes: 75,
                    },
                    {
                      title: 'Exploratory visualization',
                      description:
                        'Generate histograms, correlations, and summary charts.',
                      estimatedMinutes: 90,
                    },
                  ],
                },
                {
                  title: 'Modeling & Evaluation',
                  description:
                    'Intro ML workflow: split, train, evaluate, iterate.',
                  estimatedMinutes: 240,
                  tasks: [
                    {
                      title: 'Train baseline model',
                      description:
                        'Train a simple model (e.g. logistic regression) and record metrics.',
                      estimatedMinutes: 60,
                    },
                    {
                      title: 'Hyperparameter tuning',
                      description:
                        'Grid / random search for improved performance.',
                      estimatedMinutes: 90,
                    },
                    {
                      title: 'Model evaluation & reporting',
                      description:
                        'Confusion matrix, ROC curve, and summary narrative.',
                      estimatedMinutes: 90,
                    },
                  ],
                },
              ],
            },
          ];

          const createdTaskIds: string[] = [];

          for (const planDef of curatedPlans) {
            const [plan] = await db
              .insert(schema.learningPlans)
              .values({
                userId: devUserId,
                topic: planDef.topic,
                skillLevel: planDef.skillLevel,
                weeklyHours: planDef.weeklyHours,
                learningStyle: planDef.learningStyle,
                visibility: planDef.visibility,
                origin: planDef.origin,
                // schema.startDate & deadlineDate are 'date' (no timezone) -> supply ISO date string
                startDate: '2025-01-15',
                deadlineDate: '2025-12-31',
              })
              .returning({ id: schema.learningPlans.id });

            for (let mIdx = 0; mIdx < planDef.modules.length; mIdx++) {
              const modDef = planDef.modules[mIdx];
              const [module] = await db
                .insert(schema.modules)
                .values({
                  planId: plan.id,
                  order: mIdx + 1,
                  title: modDef.title,
                  description: modDef.description,
                  estimatedMinutes: modDef.estimatedMinutes,
                })
                .returning({ id: schema.modules.id });

              for (let tIdx = 0; tIdx < modDef.tasks.length; tIdx++) {
                const taskDef = modDef.tasks[tIdx];
                const [task] = await db
                  .insert(schema.tasks)
                  .values({
                    moduleId: module.id,
                    order: tIdx + 1,
                    title: taskDef.title,
                    description: taskDef.description,
                    estimatedMinutes: taskDef.estimatedMinutes,
                  })
                  .returning({ id: schema.tasks.id });
                createdTaskIds.push(task.id);
              }
            }
          }

          // Attach a few existing global resources deterministically (first N) to first few tasks for demo
          if (createdTaskIds.length) {
            const resourcesSample = await db
              .select({ id: schema.resources.id })
              .from(schema.resources)
              .limit(6);
            for (
              let i = 0;
              i < Math.min(createdTaskIds.length, resourcesSample.length);
              i++
            ) {
              const taskId = createdTaskIds[i];
              const resourceId = resourcesSample[i].id;
              await db
                .insert(schema.taskResources)
                .values({
                  taskId,
                  resourceId,
                  order: 1,
                  notes: 'Sample attached resource for dev sandbox.',
                })
                .onConflictDoNothing();
            }
          }

          // Mark a subset of curated tasks as completed / in-progress for realism
          if (createdTaskIds.length) {
            const completed = createdTaskIds.slice(
              0,
              Math.ceil(createdTaskIds.length * 0.25)
            );
            const inProgress = createdTaskIds.slice(
              Math.ceil(createdTaskIds.length * 0.25),
              Math.ceil(createdTaskIds.length * 0.4)
            );
            const rows = [
              ...completed.map((id) => ({
                taskId: id,
                userId: devUserId,
                status: 'completed' as const,
                completedAt: new Date('2025-06-01'),
              })),
              ...inProgress.map((id) => ({
                taskId: id,
                userId: devUserId,
                status: 'in_progress' as const,
                completedAt: null,
              })),
            ];
            if (rows.length) {
              await db
                .insert(schema.taskProgress)
                .values(rows)
                .onConflictDoNothing({
                  target: [
                    schema.taskProgress.taskId,
                    schema.taskProgress.userId,
                  ],
                });
            }
          }

          logger.info({ emoji: '✅' }, 'Curated dev user dataset created.');
        } else {
          logger.info(
            { emoji: 'ℹ️' },
            'Dev user already has plans; skipping curated dataset.'
          );
        }

        // Ensure the dev user also has a few random-style plans for realism (lightweight approach)
        // Threshold can be tuned; we aim for at least 5 total plans (including curated ones)
        const targetMinPlans = 5;
        const currentCountResult = await db
          .select({ id: schema.learningPlans.id })
          .from(schema.learningPlans)
          .where(eq(schema.learningPlans.userId, devUserId));
        const currentCount = currentCountResult.length;
        if (currentCount < targetMinPlans) {
          const toCreate = targetMinPlans - currentCount;
          logger.info(
            {
              toCreate,
            },
            '🧪 Adding random-style plan(s) for dev user to reach baseline.'
          );

          for (let i = 0; i < toCreate; i++) {
            // Pseudo-random picks using topic list & weight approximations mirrored from refined seeding
            const topic =
              learningTopics[(i * 17 + currentCount) % learningTopics.length];
            const skillPool: Array<'beginner' | 'intermediate' | 'advanced'> = [
              'beginner',
              'beginner',
              'intermediate',
              'intermediate',
              'advanced',
            ];
            const skillLevel = skillPool[(i * 7 + 3) % skillPool.length];
            const stylePool: Array<'reading' | 'video' | 'practice' | 'mixed'> =
              ['reading', 'video', 'mixed', 'practice', 'mixed'];
            const learningStyle = stylePool[(i * 11 + 5) % stylePool.length];
            const weeklyHours = 2 + ((i + currentCount) % 10); // 2-11
            const visibility = 'private' as const;

            const [randPlan] = await db
              .insert(schema.learningPlans)
              .values({
                userId: devUserId,
                topic: `${topic} (Dev Rand ${i + 1})`,
                skillLevel,
                weeklyHours,
                learningStyle,
                visibility,
                origin: 'ai',
                startDate: '2025-02-01',
                deadlineDate: '2025-12-31',
              })
              .returning({ id: schema.learningPlans.id });

            // Generate 2-3 modules each with 3-5 tasks (simple deterministic loops)
            const moduleCount = 2 + ((i + 1) % 2); // 2 or 3
            for (let m = 0; m < moduleCount; m++) {
              const modTitleSource = [
                ...moduleTemplates.programming,
                ...moduleTemplates.webdev,
                ...moduleTemplates.data,
                ...moduleTemplates.general,
              ];
              const [randModule] = await db
                .insert(schema.modules)
                .values({
                  planId: randPlan.id,
                  order: m + 1,
                  title:
                    modTitleSource[(m * 13 + i * 5) % modTitleSource.length],
                  description: 'Auto-generated dev random module.',
                  estimatedMinutes: 120 + ((m + i) % 4) * 60,
                })
                .returning({ id: schema.modules.id });

              const taskCount = 3 + ((m + i) % 3); // 3-5
              for (let t = 0; t < taskCount; t++) {
                await db.insert(schema.tasks).values({
                  moduleId: randModule.id,
                  order: t + 1,
                  title:
                    taskTemplates[
                      (t * 19 + m * 7 + i * 3) % taskTemplates.length
                    ],
                  description: 'Auto-generated task for dev random plan.',
                  estimatedMinutes: 30 + (t % 4) * 15,
                });
              }
            }
          }
          logger.info({ emoji: '✅' }, 'Added random-style dev user plans.');
        }
      }
    } catch (err) {
      logger.warn(
        {
          error: err,
        },
        '⚠️  Failed creating curated dev dataset'
      );
    }
  }

  // After seeding (and curated dev data), create task-resource relationships (placeholder)
  logger.info({ emoji: '🔗' }, 'Creating task-resource relationships...');

  // Generate per-user task progress with unique (task_id, user_id) pairs
  logger.info({ emoji: '🧭' }, 'Generating task progress (unique pairs)...');
  const users = await db.select({ id: schema.users.id }).from(schema.users);
  const tasks = await db.select({ id: schema.tasks.id }).from(schema.tasks);

  // Helper to get a deterministic pseudo-random number based on inputs
  function seededRandom(seed: number) {
    // xorshift32
    let x = seed || 123456789;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  }

  function pickRandomIndices(n: number, k: number, seedBase: number) {
    const picked = new Set<number>();
    const out: number[] = [];
    let i = 0;
    while (out.length < Math.min(k, n)) {
      const r = seededRandom(seedBase + i);
      const idx = Math.floor(r * n);
      if (!picked.has(idx)) {
        picked.add(idx);
        out.push(idx);
      }
      i++;
    }
    return out;
  }

  // Determine desired number of progress rows per user
  const minPerUser = Math.max(
    2,
    Math.floor((planCount * 20) / Math.max(userCount, 1) / 20)
  );
  const maxPerUser = Math.max(minPerUser + 3, minPerUser + 8);

  const progressRows: {
    taskId: string;
    userId: string;
    status: 'not_started' | 'in_progress' | 'completed';
    completedAt: Date | null;
  }[] = [];

  users.forEach((u, uIdx) => {
    const perUser = Math.min(
      tasks.length,
      minPerUser +
        Math.floor(
          seededRandom(uIdx + (options?.seed ?? 12345)) *
            (maxPerUser - minPerUser + 1)
        )
    );
    const taskIdxs = pickRandomIndices(
      tasks.length,
      perUser,
      uIdx * 1337 + (options?.seed ?? 12345)
    );
    for (const tIdx of taskIdxs) {
      const r = seededRandom(
        uIdx * 104729 + tIdx * 31337 + (options?.seed ?? 12345)
      );
      const status =
        r < 0.4 ? 'not_started' : r < 0.75 ? 'completed' : 'in_progress';
      const completedAt =
        status === 'completed' ? new Date('2025-06-01') : null;
      progressRows.push({
        taskId: tasks[tIdx].id,
        userId: u.id,
        status,
        completedAt,
      });
    }
  });

  // Insert in chunks with ON CONFLICT DO NOTHING on (task_id, user_id)
  const chunkSize = 1000;
  for (let i = 0; i < progressRows.length; i += chunkSize) {
    const chunk = progressRows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await db
      .insert(schema.taskProgress)
      .values(
        chunk.map((row) => ({
          taskId: row.taskId,
          userId: row.userId,
          status: row.status,
          completedAt: row.completedAt,
        }))
      )
      .onConflictDoNothing({
        target: [schema.taskProgress.taskId, schema.taskProgress.userId],
      });
  }

  logger.info(
    {
      count: progressRows.length,
    },
    `✅ Inserted ~${progressRows.length} task_progress rows (deduplicated).`
  );

  // Generate job queue entries
  logger.info({ emoji: '📋' }, 'Generating job queue entries...');
  const plans = await db
    .select({
      id: schema.learningPlans.id,
      userId: schema.learningPlans.userId,
    })
    .from(schema.learningPlans);

  const jobRows: {
    planId: string | null;
    userId: string;
    jobType: 'plan_generation';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    priority: number;
    attempts: number;
    maxAttempts: number;
    payload: unknown;
    result: unknown;
    error: string | null;
    lockedAt: Date | null;
    lockedBy: string | null;
    scheduledFor: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }[] = [];

  // Create jobs for ~40% of plans with various statuses
  const jobCount = Math.floor(planCount * 0.4);
  const planIndices = pickRandomIndices(
    plans.length,
    Math.min(jobCount, plans.length),
    (options?.seed ?? 12345) + 999
  );

  planIndices.forEach((pIdx, idx) => {
    const plan = plans[pIdx];
    const r = seededRandom(idx + (options?.seed ?? 12345) + 7777);

    // Distribute status: 15% pending, 10% processing, 60% completed, 15% failed
    let status: 'pending' | 'processing' | 'completed' | 'failed';
    let attempts: number;
    let startedAt: Date | null = null;
    let completedAt: Date | null = null;
    let lockedAt: Date | null = null;
    let lockedBy: string | null = null;
    let result: unknown = null;
    let error: string | null = null;

    if (r < 0.15) {
      // Pending
      status = 'pending';
      attempts = 0;
    } else if (r < 0.25) {
      // Processing
      status = 'processing';
      attempts = Math.floor(seededRandom(idx * 31 + 1) * 2) + 1; // 1-2 attempts
      startedAt = new Date('2025-09-29T10:00:00Z');
      lockedAt = new Date('2025-09-29T10:00:00Z');
      lockedBy = `worker-${Math.floor(seededRandom(idx * 17) * 5) + 1}`;
    } else if (r < 0.85) {
      // Completed
      status = 'completed';
      attempts = Math.floor(seededRandom(idx * 23 + 2) * 2) + 1; // 1-2 attempts
      startedAt = new Date('2025-09-28T10:00:00Z');
      completedAt = new Date('2025-09-28T10:15:00Z');
      result = {
        planId: plan.id,
        modulesCount: 4 + Math.floor(seededRandom(idx * 13) * 3),
        tasksCount: 18 + Math.floor(seededRandom(idx * 19) * 12),
        durationMs: 12000 + Math.floor(seededRandom(idx * 29) * 8000),
      };
    } else {
      // Failed
      status = 'failed';
      attempts = 3; // maxed out
      startedAt = new Date('2025-09-29T08:00:00Z');
      completedAt = new Date('2025-09-29T08:05:00Z');
      const errorTypes = [
        'AI provider timeout',
        'Invalid response format',
        'Rate limit exceeded',
        'Validation error: topic too vague',
        'Network error: connection refused',
      ];
      error =
        errorTypes[Math.floor(seededRandom(idx * 37) * errorTypes.length)];
    }

    // Priority based on age (older jobs have higher priority in pending queue)
    const priority =
      status === 'pending'
        ? Math.floor(seededRandom(idx * 41 + 3) * 10) // 0-9
        : 0;

    // Schedule time varies by status
    let scheduledFor: Date;
    if (status === 'pending') {
      // Recent pending jobs
      const hoursAgo = Math.floor(seededRandom(idx * 43) * 48); // 0-48 hours ago
      scheduledFor = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    } else {
      // Older jobs
      const daysAgo = 1 + Math.floor(seededRandom(idx * 47) * 14); // 1-14 days ago
      scheduledFor = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    }

    jobRows.push({
      planId: plan.id,
      userId: plan.userId,
      jobType: 'plan_generation',
      status,
      priority,
      attempts,
      maxAttempts: 3,
      payload: {
        topic: 'Learn Advanced TypeScript',
        skillLevel: ['beginner', 'intermediate', 'advanced'][
          Math.floor(seededRandom(idx * 53) * 3)
        ],
        weeklyHours: 3 + Math.floor(seededRandom(idx * 59) * 10),
        learningStyle: ['reading', 'video', 'practice', 'mixed'][
          Math.floor(seededRandom(idx * 61) * 4)
        ],
        requestId: `req_${Date.now()}_${idx}`,
      },
      result,
      error,
      lockedAt,
      lockedBy,
      scheduledFor,
      startedAt,
      completedAt,
    });
  });

  // Also add some pending jobs without planId (jobs that haven't created plans yet)
  const orphanJobCount = Math.floor(jobCount * 0.2);
  for (let i = 0; i < orphanJobCount; i++) {
    const userIdx = Math.floor(
      seededRandom(i * 67 + (options?.seed ?? 12345)) * users.length
    );
    const hoursAgo = Math.floor(seededRandom(i * 71) * 24); // 0-24 hours ago
    const scheduledFor = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    jobRows.push({
      planId: null,
      userId: users[userIdx].id,
      jobType: 'plan_generation',
      status: 'pending',
      priority: Math.floor(seededRandom(i * 73 + 5) * 10),
      attempts: 0,
      maxAttempts: 3,
      payload: {
        topic:
          learningTopics[
            Math.floor(seededRandom(i * 79) * learningTopics.length)
          ],
        skillLevel: ['beginner', 'intermediate', 'advanced'][
          Math.floor(seededRandom(i * 83) * 3)
        ],
        weeklyHours: 3 + Math.floor(seededRandom(i * 89) * 10),
        learningStyle: ['reading', 'video', 'practice', 'mixed'][
          Math.floor(seededRandom(i * 97) * 4)
        ],
        requestId: `req_${Date.now()}_orphan_${i}`,
      },
      result: null,
      error: null,
      lockedAt: null,
      lockedBy: null,
      scheduledFor,
      startedAt: null,
      completedAt: null,
    });
  }

  // Insert job queue entries in chunks
  for (let i = 0; i < jobRows.length; i += chunkSize) {
    const chunk = jobRows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await db.insert(schema.jobQueue).values(chunk);
  }

  logger.info(
    {
      count: jobRows.length,
    },
    `✅ Inserted ${jobRows.length} job_queue entries.`
  );

  logger.info({ emoji: '✅' }, 'Database seeding completed successfully!');
  logger.info(
    {
      emoji: '📈',
      userCount,
      planCount,
      moduleCount: planCount * 4,
      taskCount: planCount * 20,
      resourceCount,
      progressCount: progressRows.length,
      generationCount: Math.floor(planCount * 0.3),
      jobCount: jobRows.length,
    },
    'Generated approximately:'
  );
}

/**
 * Reset database - clears all data
 */
export async function resetDatabase(db: ReturnType<typeof drizzle>) {
  logger.info({ emoji: '🗑️' }, 'Resetting database...');
  await reset(db, schema);
  logger.info({ emoji: '✅' }, 'Database reset complete');
}

/**
 * Development seeding function with smaller dataset
 */
export async function seedDevelopment(db: ReturnType<typeof drizzle>) {
  await seedDatabase(db, {
    userCount: 10,
    planCount: 25,
    resourceCount: 100,
    reset: true,
    seed: 12345,
  });
}

// Export the main function for CLI usage
export default seedDatabase;
