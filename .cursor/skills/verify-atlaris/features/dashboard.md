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
- Fresh auth launch has no plans unless a prior recipe created one.

- **Open dashboard.** Navigate to `http://127.0.0.1:3101/dashboard`. The URL is `/dashboard`. A heading `Dashboard` is visible.
- **Empty start.** If no active plan, a region named `Start learning` contains heading `Your next plan is waiting` and a **Begin tonight** link.
- **Resume.** If an active plan exists, a region named `Resume learning` is visible instead of `Start learning`.
- **Begin tonight.** From the empty card, choose **Begin tonight**. The URL is `/plans/new` and the heading matches `What do you want to learn?`.
- **Browse plans.** From the empty card, choose **Browse plans**. The URL is `/plans` and the heading is `Your Plans`.
- **Proof.** Snapshot and screenshot `/dashboard` showing the `Dashboard` heading and either `Start learning` or `Resume learning`. Save under `artifacts/<run-id>/dashboard/`.

## Gotchas

- Empty vs resume depends on data this instance already has. Record which branch you proved; do not claim both from one screenshot.
- Header **New Plan** (`aria-label="New Plan"`) is a second entry to `/plans/new`. Prove it only if you say you did.
- Weekly pace may read `No pace set yet` until a plan exists. That is not a failure.
- Do not use anon `:3100` for this feature.
