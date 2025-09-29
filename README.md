# Learning Path App

A Next.js application for creating AI-backed personalized learning plans with structured modules and tasks.

## Features

### 🎯 AI-Backed Learning Plan Generation

- **Asynchronous Plan Creation**: Create learning plans that are immediately available while AI generates detailed content in the background
- **Structured Module Organization**: Automatically generated modules with ordered tasks (1..N sequential numbering)
- **Adaptive Content Generation**: Smart timeout handling (10-20s) with partial content detection
- **Robust Error Handling**: Classified failure tracking (validation, provider_error, rate_limit, timeout, capped)
- **Generation Attempt History**: Complete audit trail of all generation attempts per plan
- **Input Processing**: Automatic truncation (topic ≤200 chars, notes ≤2000 chars) and effort normalization (module 15-480 min, task 5-120 min)

### 🔒 Security & Data Integrity

- **Row Level Security (RLS)**: Supabase-based access controls ensuring users only see their own data
- **Atomic Transactions**: Generation attempts and content persist together or fail together
- **Concurrent Safety**: Multiple users can create plans simultaneously without conflicts
- **Attempt Capping**: Maximum 3 generation attempts per plan to prevent abuse

### 📊 Performance & Observability

- **Minimal Latency Impact**: <+200ms p95 overhead on plan creation API
- **Efficient Processing**: Input truncation and validation <5ms p95
- **Correlation Tracking**: Request correlation IDs for debugging and support
- **Generation Metrics**: Duration tracking and success/failure classification

### 🎨 Modern Tech Stack

- **Next.js 15** with App Router and React 19
- **TypeScript** for type safety
- **Tailwind CSS v4** for styling
- **Supabase** for PostgreSQL database with RLS
- **Drizzle ORM** for type-safe database operations
- **Clerk** for authentication
- **Vitest** for testing

## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Project Structure

```
src/
├── app/                     # Next.js App Router (API + pages)
│   ├── api/v1/plans         # Plan endpoints with AI generation
│   ├── dashboard            # Authenticated UI pages
│   └── plans                # Plan listing/detail pages
├── components/              # UI components
├── lib/
│   ├── ai/                  # AI provider abstraction and generation logic
│   ├── db/                  # Drizzle schema, migrations, queries
│   ├── mappers/             # Database to client type mappers
│   ├── types/               # Shared TypeScript types
│   └── validation/          # Zod schemas
└── utils/                   # Utilities and helpers
```

## Database Schema

### Core Entities

- **users**: User accounts linked to Clerk authentication
- **learning_plans**: User-created learning plans with AI-generated content
- **modules**: Ordered course modules within each plan (1..N sequential)
- **tasks**: Ordered learning tasks within each module (1..N sequential)
- **generation_attempts**: Complete audit log of all AI generation attempts
- **resources**: Learning materials linked to tasks
- **task_progress**: User progress tracking per task

### Key Features

- **UUID Primary Keys**: All tables use UUIDs for scalability
- **Referential Integrity**: Proper foreign key constraints with cascading deletes
- **Unique Ordering**: Enforced sequential numbering within scopes
- **Atomic Operations**: Transactional consistency for generation attempts

## API Endpoints

### Plan Management

- `POST /api/v1/plans` - Create new plan (triggers async AI generation)
- `GET /api/v1/plans/{id}` - Retrieve plan details with derived status
- `GET /api/v1/plans/{id}/attempts` - List generation attempt history

### Plan Status States

- **pending**: Plan created, AI generation in progress or queued
- **ready**: At least one module generated successfully
- **failed**: All generation attempts failed (max 3 attempts)

## Development

### Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm lint` - Run ESLint
- `pnpm format` - Format with Prettier
- `pnpm test` - Run test suite

### Database

- `pnpm db:generate` - Generate Drizzle migrations
- `pnpm db:migrate` - Apply migrations
- `pnpm db:seed` - Seed development data

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs) - Learn about Next.js features and API
- [Supabase Documentation](https://supabase.com/docs) - Database and authentication
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
