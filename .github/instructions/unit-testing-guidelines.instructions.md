---
description: Guidelines for auditing and writing unit tests to ensure clean, isolated logic.
applyTo: tests/unit/**/*
---
# Unit Testing Guidelines

To make unit testing actually valuable, you must separate **Core Logic** (Test this) from **Orchestration/Side Effects** (Mock this).

Here is the **Unit Testing Sanitation Checklist**. If your code fails this checklist, you are writing legacy code in real-time.

### 1. The "Pure Function" Extraction

- **Are you testing logic or plumbing?**
  - _The Trap:_ You are trying to unit test a function that calls the database, calls Clerk, _and_ calculates a discount.
  - _The Truth:_ You cannot unit test that efficiently.
  - _The Fix:_ Extract the calculation logic into a pure function.
    - _Bad:_ `calculateAndSaveOrder(orderId)` -> Needs DB mocks.
    - _Good:_ `calculateTotal(items, taxRate)` -> Needs **zero** mocks. Input -> Output.
  - _The Audit:_ If a file has more imports for libraries/services than it does logic, it’s an Orchestrator. Don't unit test it; Integration test it. Unit test the logic it calls.

### 2. The "Implementation Detail" leak

- **Do your tests break when you rename a private variable?**
  - _The Trap:_ Testing _how_ the code works rather than _what_ it does. E.g., Asserting that `user.validate()` was called 3 times.
  - _The Fix:_ Test the public API only. Input X should result in Output Y or Exception Z.
  - _The Rule:_ If you refactor the internal code but the output remains correct, the test should pass. If the test fails, you wrote a bad test.

### 3. The Dependency Inversion Check

- **Are you importing side-effects directly?**
  - _The Trap:_ `import { sendEmail } from './email-service'` at the top of your business logic file.
  - _The Fix:_ Pass dependencies via the constructor or function arguments.
  - _Why:_ In Vitest, if you have to use `vi.mock('./email-service')`, you are fighting your architecture. If you pass `emailService` as an argument, you can simply pass a plain JS object `{ send: vi.fn() }`. It’s cleaner, faster, and type-safe.

### 4. The "Date & Random" Determinism

- **Does your code use `new Date()` or `Math.random()` internally?**
  - _The Trap:_ You have sporadic test failures or you have to mock the system clock (`vi.useFakeTimers`).
  - _The Fix:_ Treat time as a dependency. Pass the date in, or use a date provider interface.
  - _The Audit:_ A unit test should return the exact same result if run today, next year, or during a leap second.

### 5. The Framework Decoupling

- **Are you testing Next.js/Express handlers?**
  - _The Trap:_ Trying to unit test a `POST` handler by creating fake `NextRequest` objects.
  - _The Fix:_ Stop. The handler is just an adapter.
    - _Handler:_ Extract body -> Call `UserService.createUser()` -> Return JSON.
  - _The Test:_ Unit test `UserService.createUser()`. Ignore the handler. Trust that Next.js knows how to route HTTP requests.

### 6. The "Coverage" Vanity Metric

- **Are you aiming for 100% coverage?**
  - _The Trap:_ Writing tests for getters, setters, and simple pass-through functions just to see green lines.
  - _The Reality:_ You are wasting time.
  - _The Fix:_ Focus on **Cyclomatic Complexity**. Test the branches. Test the `catch` blocks. Test the weird `if (user.isDeleted && user.hasBalance)` edge cases.
  - _The Audit:_ Delete any test that checks if a constant equals itself.

### 7. The "Mock Data" Factory

- **Are you manually typing out JSON objects in every test file?**
  - _The Trap:_ 50 lines of `const mockUser = { id: 1, name: 'Bob', ... }` in every file.
  - _The Consequence:_ When the User schema changes, you have to update 100 test files.
  - _The Fix:_ Create a central **Fixture Factory** (e.g., `createMockUser({ overrides })`).
  - _Why:_ It centralizes the schema definition. Tests become readable: `const admin = createMockUser({ role: 'admin' })`.

---

### The Litmus Test for Unit Tests

Look at your last wrote unit test.

1.  Does it run in less than 10ms?
2.  Does it have **zero** `vi.mock()` calls for external modules? (Preferably dependencies are injected).
3.  If you delete the database, does the test still pass?

If you answered "No" to any of these, you are writing **Integration Tests** in disguise, or you have a **Tight Coupling** problem.

**Clean architecture makes unit testing boring and easy. If your unit testing feels hard, your architecture is wrong.**
