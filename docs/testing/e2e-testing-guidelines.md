# E2E Testing Guidelines

**Stop.** I need to correct a likely category error before we proceed.

**Vitest is not a browser automation tool.**
If you mean "E2E" as in "Spinning up my API and hitting endpoints with HTTP requests (like Supertest)," then Vitest is fine.
If you mean "E2E" as in "Clicking buttons in a browser," and you are trying to use Vitest for that, you are using a screwdriver to hammer a nail. Use **Playwright** or **Cypress** for browser tests.

Assuming you mean **System/API E2E testing** (spinning up the full backend locally and hitting it over HTTP) using Vitest:

This is the most expensive, slow, and brittle type of testing. If you get this wrong, your CI pipeline will take 20 minutes and fail 50% of the time due to "flakes."

Here is the **E2E Sanitation Checklist** to ensure you aren't building a fragile nightmare.

### 1. The "Black Box" Discipline

- **Are you cheating by importing internal code?**
  - _The Trap:_ In your E2E test file, you `import db from 'src/db'` to check if a record was created.
  - _The Truth:_ That is **not** an E2E test. In E2E, you are an outsider. You are a client.
  - _The Fix:_ You can only assert based on **publicly observable side-effects**.
    - _Action:_ POST `/api/users`
    - _Assertion:_ GET `/api/users` returns the new user.
    - _Forbidden:_ Checking the database directly.
  - _Why:_ If you change your DB from Postgres to Mongo tomorrow, your E2E tests should still pass. If you rely on internal DB checks, they won't.

### 2. The "Data Isolation" Protocol

- **Do your tests clash with each other?**
  - _The Trap:_ Test A creates a user with email `test@test.com`. Test B tries to create the same user and fails because of a unique constraint.
  - _The Fix:_ **Randomization.**
    - Every E2E test generates its own unique fixtures: `const email = `test-${uuid()}@example.com`.
  - _The Audit:_ Can you run your E2E suite in parallel (multi-threaded)? If no, your data hygiene is trash.

### 3. The "Bypass" Strategy (Clerk/Stripe)

- **Are you hitting real third-party APIs?**
  - _The Trap:_ Your E2E test actually calls Clerk to create a user, or Stripe to make a payment.
  - _The Consequence:_ Rate limits, network timeouts, and impossible-to-debug failures when _their_ service goes down.
  - _The Fix:_
    - **Option A (Mock Server):** Use **MSW (Mock Service Worker)** at the network layer. Intercept outgoing HTTP requests from your backend and return canned responses.
    - **Option B (The Backdoor):** Implement a "Test Mode" in your backend config. When `NODE_ENV=test`, allow a specific "Master Key" header that bypasses Clerk verification and impersonates a user.
    - _Note:_ This is different from Integration testing mocks. Here, the server is running for real. You need a network-level or config-level bypass.

### 4. The "Critical Path" Rule

- **Are you testing edge cases here?**
  - _The Trap:_ Testing "Password must be 8 characters" in an E2E test.
  - _The Truth:_ That is a Unit test. E2E tests are for **Critical Business Flows** only.
  - _The Fix:_ Test the "Money Flows."
    - Can a user sign up?
    - Can a user pay?
    - Can a user see their dashboard?
  - _The Audit:_ If you have more than 10-20 E2E tests for a medium-sized app, you are over-testing at the wrong level.

### 5. The "Cold Start" Reality

- **Are you testing against `dev` mode or `build`?**
  - _The Trap:_ Running tests against `npm run dev` (hot reloading enabled).
  - _The Fix:_ E2E tests must run against the **built artifact** (`npm run build && npm start`).
  - _Why:_ I have seen countless bugs that only appear in production builds (minification issues, environment variable injection, tree-shaking). Testing against `dev` gives you false confidence.

### 6. The "Deterministic Wait" (If using Browser/Playwright)

- **Do you have `sleep(1000)` in your code?**
  - _The Trap:_ Waiting for a fixed amount of time for an animation or API response.
  - _The Fix:_ **Never** use sleep. Use `waitFor`.
    - _Bad:_ `await new Promise(r => setTimeout(r, 1000))`
    - _Good:_ `await page.waitForSelector('#success-message')`
  - _The Audit:_ Grep your codebase for `setTimeout` or `sleep`. Delete them.

### 7. The Setup/Teardown Cost

- **Do you spin up the server for _every_ test file?**
  - _The Trap:_ Using `beforeEach` to restart the entire Express/Next.js server.
  - _The Fix:_ Use `beforeAll` (Global Setup) to start the server _once_. Use `afterAll` to kill it. Truncate DB tables between tests if necessary, but do not restart the process.
  - _Why:_ Restarting the server takes seconds. Accumulate that over 50 tests, and your suite takes 10 minutes. It should take 30 seconds.

---

### The Litmus Test for E2E

**If I delete a column in your database and update the API code to match:**

1.  Your Unit tests might break (depending on mocking).
2.  Your Integration tests might break (if they rely on DB schema).
3.  **Your E2E tests should PASS.**

Why? Because the API contract didn't change. The client (the test) sends the same JSON and gets the same JSON. It shouldn't care how the data is stored.

If your E2E tests fail when you refactor internal database schemas, you have violated the boundary. You are testing implementation, not behavior. Fix it.
