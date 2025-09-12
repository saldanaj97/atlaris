import { drizzle } from 'drizzle-orm/postgres-js';
import { reset, seed } from 'drizzle-seed';
import * as schema from './schema';

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

  // Seed the database with all tables and relationships
  await seed(db, schema, {
    count: userCount, // Base count for users
    seed: seedValue,
  }).refine((f) => ({
    // Users table - foundation of the system
    users: {
      count: userCount,
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

  // After seeding, create task-resource relationships (placeholder)
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
