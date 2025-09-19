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

  console.log('🌱 Starting database seeding...');

  // Reset database if requested
  if (shouldReset) {
    console.log('🗑️  Resetting database...');
    await reset(db, schema);
    console.log('✅ Database reset complete');
  }

  console.log(
    `📊 Seeding with ${userCount} users, ${planCount} plans, ${resourceCount} resources`
  );

  let adjustedUserCount = userCount;
  let insertedDevUser = false;
  const isDevEnv = process.env.NODE_ENV !== 'production';

  // Seed the database with all tables and relationships
  // Optional: deterministic dev user injection (before randomized seeding)
  // for easier local testing and predictable auth
  const devClerkUserId = process.env.DEV_CLERK_USER_ID;
  const devEmail = process.env.DEV_CLERK_USER_EMAIL || 'dev@example.com';
  const devName = process.env.DEV_CLERK_USER_NAME || 'Dev User';

  if (isDevEnv && devClerkUserId) {
    try {
      // Attempt to insert deterministic dev user; ignore conflict if already present
      await db
        .insert(schema.users)
        .values({
          clerkUserId: devClerkUserId,
          email: devEmail,
          name: devName,
          subscriptionTier: 'free',
        })
        .onConflictDoNothing();
      insertedDevUser = true;
      console.log(`👤 Ensured deterministic dev user '${devClerkUserId}'`);
    } catch (e) {
      console.warn('⚠️  Could not insert deterministic dev user:', e);
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
        clerkUserId: f.string({ isUnique: true }), // Clerk user IDs must be unique
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
        visibility: f.weightedRandom([
          { weight: 0.8, value: f.valuesFromArray({ values: ['private'] }) },
          { weight: 0.2, value: f.valuesFromArray({ values: ['public'] }) },
        ]),
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
  }));

  // After randomized seeding, optionally create curated data for the deterministic dev user
  // so local development always has predictable, rich content to test UI flows.
  if (isDevEnv && insertedDevUser && devClerkUserId) {
    try {
      const devUser = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.clerkUserId, devClerkUserId))
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
          console.log('🛠️  Creating curated dev user learning plans...');

          // Curated plan definitions (concise but representative)
          const curatedPlans: Array<{
            topic: string;
            skillLevel: 'beginner' | 'intermediate' | 'advanced';
            weeklyHours: number;
            learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
            visibility: 'private' | 'public';
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
              visibility: 'public',
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

          console.log('✅ Curated dev user dataset created.');
        } else {
          console.log(
            'ℹ️  Dev user already has plans; skipping curated dataset.'
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
          console.log(
            `🧪 Adding ${toCreate} random-style plan(s) for dev user to reach baseline.`
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
            const visibility: 'private' | 'public' =
              (i + currentCount) % 4 === 0 ? 'public' : 'private';

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
          console.log('✅ Added random-style dev user plans.');
        }
      }
    } catch (err) {
      console.warn('⚠️  Failed creating curated dev dataset:', err);
    }
  }

  // After seeding (and curated dev data), create task-resource relationships (placeholder)
  console.log('🔗 Creating task-resource relationships...');

  // Generate per-user task progress with unique (task_id, user_id) pairs
  console.log('🧭 Generating task progress (unique pairs)...');
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

  console.log(
    `✅ Inserted ~${progressRows.length} task_progress rows (deduplicated).`
  );

  console.log('✅ Database seeding completed successfully!');
  console.log(`📈 Generated approximately:`);
  console.log(`   - ${userCount} users`);
  console.log(`   - ${planCount} learning plans`);
  console.log(`   - ${planCount * 4} modules (avg 4 per plan)`);
  console.log(`   - ${planCount * 20} tasks (avg 5 per module)`);
  console.log(`   - ${resourceCount} resources`);
  console.log(`   - ~${progressRows.length} task progress records`);
  console.log(`   - ${Math.floor(planCount * 0.3)} plan generation records`);
}

/**
 * Reset database - clears all data
 */
export async function resetDatabase(db: ReturnType<typeof drizzle>) {
  console.log('🗑️  Resetting database...');
  await reset(db, schema);
  console.log('✅ Database reset complete');
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
