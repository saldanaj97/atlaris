# Create a plan

A signed-in user names a goal, sets preferences, charts a course, then opens a generated module from the plan page.

## Sub-features

- `plan-open-form` opens `/plans/new` from dashboard, plans, or **New Plan**.
- `plan-fill` enters topic plus Skill level, Weekly hours, Learning style, and Deadline.
- `plan-generate` submits **Chart this course** and lands on a plan detail URL.
- `plan-modules` shows at least one **View full module** link.
- `plan-module-open` opens a module page with heading `Lessons`.

## How to get to it (user POV)

- Choose **New Plan** in the product header (label `New Plan`).
- Choose **Begin tonight** from the dashboard empty card.
- Choose **New Plan** on `/plans`.
- Open `/plans/new` directly.

## Driving it with verify-atlaris

Preconditions:

- Auth instance is healthy at `http://127.0.0.1:3101`.
- `control.ts doctor` reports `mode=auth`.
- Mock AI is the auth-mode default (`success`). Generation should finish without a live OpenRouter call.
- Use a unique topic so list proof is unambiguous, e.g. `Verify Rust <run-id>`.

- **Open form.** Navigate to `http://127.0.0.1:3101/plans/new`. Heading matches `What do you want to learn?`. The textbox is labelled `What do you want to learn?`.
- **Fill topic.** Type the unique topic into that textbox.
- **Set preferences.** Open each listbox by accessible name and choose: `Skill level` → `Advanced`; `Weekly hours` → `11-15 hours`; `Learning style` → `Reading`; `Deadline` → `2 weeks`.
- **Generate.** Choose **Chart this course**. The button label becomes `Generating…`, then the URL matches `/plans/<uuid>` within 90s.
- **Modules.** Wait until a link named `View full module` is visible. Reload if the page shows `No modules available yet.` An alert matching `generation failed` or `connection issue` is a failure.
- **Open module.** Choose the first **View full module**. The URL matches `/plans/<uuid>/modules/<uuid>`. Heading `Lessons` is visible.
- **Persistence.** Choose the plan-topic link back to the plan. **View full module** is still visible.
- **Proof.** Screenshot plan detail with the topic heading and a module link, plus the module `Lessons` heading. Save under `artifacts/<run-id>/create-plan/`.

## Gotchas

- The submit control is **Chart this course**, not `Generate my plan`.
- Auth fixture checkout is disabled; this path only works if the seeded tier can create a plan. If the header shows **Upgrade**, stop and record the entitlement, do not force the form.
- Generation can take up to 90s even with mock AI. Wait for the plan URL and module links; do not sleep a fixed time and pass.
- A single-module plan has no **Next module** control. Missing next-module is not a failure.
- Do not count API `POST /api/v1/plans/stream` alone as proof. The user-visible plan page is the proof.
