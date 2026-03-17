# Plan Lifecycle Deepening — Implementation Tickets

> Parent PRD: [#236](https://github.com/saldanaj97/atlaris/issues/236)
> Related RFC: [#235](https://github.com/saldanaj97/atlaris/issues/235)

## Vertical Slices (dependency order)

| #   | Issue                                                    | Title                                                               | Blocked by |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------- | ---------- |
| 1   | [#237](https://github.com/saldanaj97/atlaris/issues/237) | Define port interfaces & implement `createPlan` for AI-origin plans | None       |
| 2   | [#238](https://github.com/saldanaj97/atlaris/issues/238) | Extend `createPlan` for PDF-origin plans with rollback              | #237       |
| 3   | [#239](https://github.com/saldanaj97/atlaris/issues/239) | Implement `processGenerationAttempt` in lifecycle service           | #237       |
| 4   | [#240](https://github.com/saldanaj97/atlaris/issues/240) | Migrate stream route to use PlanLifecycleService                    | #238, #239 |
| 5   | [#241](https://github.com/saldanaj97/atlaris/issues/241) | Migrate regeneration worker to use PlanLifecycleService             | #239       |
| 6   | [#242](https://github.com/saldanaj97/atlaris/issues/242) | Retire superseded tests & add lifecycle observability               | #240, #241 |

## Dependency graph

```
#237 (ports + createPlan AI)
├── #238 (createPlan PDF) ──┐
│                           ├── #240 (migrate stream route) ──┐
└── #239 (processGeneration)┘                                 ├── #242 (cleanup)
    └── #241 (migrate worker) ────────────────────────────────┘
```

## Notes

- All slices are **AFK** (can be implemented without human interaction)
- Slices 2 and 3 can be worked in **parallel** (both only depend on #237)
- Slice 5 can start as soon as #239 is done (does not need to wait for #238)
