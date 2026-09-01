# Dashboard

The signed-in home shows tonight's work: either an empty start card or a resume hero, plus weekly pace and recent activity.

## Sub-features

- `dash-load` opens `/dashboard` with heading `Dashboard`.
- `dash-empty` shows **Start learning** / `Your next plan is waiting` when there is no active plan.
- `dash-resume` shows **Resume learning** when an active plan exists.
- `dash-begin` follows **Begin tonight** or **New Plan** into `/plans/new`.
- `dash-browse` follows **Browse plans** into `/plans`.

## How to get to it (user POV)

- Open `http://127.0.0.1:3101/` (redirects to `/dashboard` when signed in).
- Open `http://127.0.0.1:3101/dashboard`.
- Choose **Dashboard** in product navigation.
- Choose the header **Dashboard** control from a marketing page while signed in.

## Driving it with verify-atlaris

Preconditions:

- Auth instance is healthy at `http://127.0.0.1:3101`.
- `control.ts doctor` reports `mode=auth`.
- Fresh auth launch already has resume data: `seed.sql` creates three fixed ready plans plus 42 generated ready plans for the verification user. The dashboard opens in **Resume learning**, not empty.

- **Open dashboard.** Navigate to `http://127.0.0.1:3101/dashboard`. The URL is `/dashboard`. A heading `Dashboard` is visible. A region named `Resume learning` is visible.
- **Resume.** Prove the seeded resume hero. Do not claim `dash-empty` from this fresh state.
- **Empty start.** To reach `Start learning` / `Your next plan is waiting` / **Begin tonight** / **Browse plans** on the empty card, open `/plans` and delete the seeded plans through the product UI: choose `Select all plans on page`, then **Delete selected**, confirm **Delete selected plans**. Repeat across pages (20 plans per page) until the list is empty, then reopen `/dashboard`. Do not reset the database, stop Docker, or delete the verify container to empty plans.
- **Begin tonight.** From the empty card, choose **Begin tonight**. The URL is `/plans/new` and the heading matches `What do you want to learn?`. From the seeded resume state, header **New Plan** is the supported `dash-begin` path.
- **Browse plans.** From the empty card, choose **Browse plans**. The URL is `/plans` and the heading is `Your Plans`. That empty-card control is only on `dash-empty`.
- **Proof.** Snapshot and screenshot `/dashboard` showing the `Dashboard` heading and the branch you actually reached (`Resume learning` on a fresh launch, or `Start learning` only after the `/plans` delete recipe). Save under `artifacts/<run-id>/dashboard/`.

## Gotchas

- Empty vs resume depends on data this instance already has. A fresh auth launch is resume. Record which branch you proved; do not claim both from one screenshot.
- Establishing empty state is the `/plans` delete recipe above. `control.ts cleanup` and `db reset` are not a supported empty-dashboard setup.
- Header **New Plan** (`aria-label="New Plan"`) is a second entry to `/plans/new`. Prove it only if you say you did.
- Weekly pace may read `No pace set yet` until a plan exists. That is not a failure.
- Do not use anon `:3100` for this feature.
