# Integration Testing Guidelines

If you want a system that is actually testable—where integration tests are easy, fast, and reliable—you need to audit the architecture, not just your test files.

Here is the **Integration Testing Sanitation Checklist**. Go through the codebase. If you answer "No" to any of these, your code is tight-coupled garbage that will break under pressure. Fix it.

### 1. The "Hard Dependency" Purge

- **Do you wrap the Clerk SDK?**
  - _The Trap:_ You import `@clerk/clerk-sdk-node` directly into your API handlers or business logic.
  - _The Fix:_ Create an `AuthService` interface. The real implementation calls Clerk. The test implementation returns static objects. Your business logic should only know about the interface, not the vendor.
- **Is your database connection injectable?**
  - _The Trap:_ You export a global `prisma` or `db` instance from a `db.ts` file and import that singleton everywhere.
  - _The Fix:_ Your repositories or services should accept a database client instance as an argument (Dependency Injection). This allows you to pass a transaction client or a test-database client dynamically.

### 2. The "HTTP Leaking" Check

- **Does your business logic know it’s inside an HTTP request?**
  - _The Trap:_ Passing `req` (Request) or `res` (Response) objects into your core logic functions.
  - _The Fix:_ Your controllers should extract the data (User ID, body, params) and pass _only that data_ to your service layer.
  - _Why:_ You cannot easily test a function that expects a complex Express/Next.js Request object. You _can_ easily test a function that expects `(userId: string, data: InputDTO)`.

### 3. The "Neon-Is-Just-Postgres" Audit

- **Are your migrations automated and vendor-agnostic?**
  - _The Trap:_ You created tables manually in the Neon dashboard, or your code relies on Neon-specific extensions not available in standard Postgres Docker images.
  - _The Fix:_ You must have a `migration` script that runs against a standard local Postgres container and results in a schema identical to production.
- **Do you have a clean "Seed" strategy?**
  - _The Trap:_ Your tests rely on data that "should already be there."
  - _The Fix:_ Every test suite should be able to start with a blank DB, run migrations, seed specific test data, run the test, and wipe the DB. If your tests depend on each other, you are failing.

### 4. The "Context Object" Discipline

- **Is your User Context strictly defined?**
  - _The Trap:_ You rely on `req.auth` having random properties that Clerk might change, or you sprinkle `await currentUser()` calls all over your code.
  - _The Fix:_ Define a strict internal type (e.g., `AppUserContext`).
  - _The Flow:_ Middleware -> Extracts Clerk Data -> Maps to `AppUserContext` -> Passes to Business Logic.
  - _The Test:_ You simply construct a fake `AppUserContext` and hand it to the logic. No tokens required.

### 5. The "Suicide Prevention" Config

- **does your test config explicity forbid production connection strings?**
  - _The Trap:_ You forget to set `NODE_ENV=test` and accidentally wipe your staging or prod database because your `.env` file was loaded.
  - _The Fix:_ In your test setup file, add a check: `if (process.env.DATABASE_URL.includes('neon.tech')) throw new Error('DO NOT RUN TESTS AGAINST REMOTE DB');`

### 6. The "Anonymous" Logic Trap

- **Is "Anonymous" a state, or an error?**
  - _The Trap:_ You handle missing users by catching errors in 50 different places.
  - _The Fix:_ Centralize the logic. If a user is anonymous, your Context object should explicitly reflect that (e.g., `userId: null` or `role: 'guest'`). Your logic should handle the _state_, not the _absence_ of data.

---

### The Litmus Test

To prove your code is sound, perform this mental exercise (or actually do it):

**Can you run your entire test suite while your wifi is turned off?**

If the answer is "No," you are still coupled to Neon or Clerk.
If the answer is "Yes," you have successfully isolated your logic.

Go audit your code. Find the leaks. Plug them.
