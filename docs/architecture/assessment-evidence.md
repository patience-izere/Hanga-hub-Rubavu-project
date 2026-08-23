# Assessment evidence and results

OPedu keeps three distinct layers: normalized authoring records, immutable published scenario snapshots, and immutable learner evidence/results.

## Procedure authoring

`ProcedureStep` can reference course-scoped `Tool` and `Hazard` records and lesson competencies. Each step may have ordered `StepHint` records, measurement `StepTolerance` ranges, one or more `AcceptableAction` records, and outcome-specific `StepFeedback`.

Publishing a scenario snapshots these records into `SimulationScenario.definition`. Runtime attempts therefore use the exact tools, hazards, actions, tolerances, hints, feedback, and competency mappings that were published with their assigned scenario version. Editing authoring records does not change active or historical attempts.

## Runtime evidence

- An acceptable action without a tolerance completes its current step.
- An action with a tolerance requires a numeric measurement, either supplied by the interaction or deterministically defined by the scenario. Values outside the inclusive range append a `tolerance_failed` event and do not advance the procedure.
- A learner may request each published hint once. The server appends `hint_used` with its snapshotted points penalty.
- Incorrect actions, tolerance failures, hint use, and completions remain ordered immutable `AttemptEvent` records.

## Materialized results

Completion derives one immutable `StepResult` per scenario step. It records outcome, action count, hints used, duration, achieved and available points, tolerance result, safety violations, and the exact event sequence numbers used as evidence.

One immutable `CompetencyResult` is then aggregated from the scenario's step-to-competency mappings. It stores achieved and available points, mastery percentage, the snapshotted threshold, mastery state, and references to its supporting step results and event sequences.

Attempt lifecycle status remains `in_progress`, `completed`, or `requires_review`. The separate outcome is `pending`, `passed`, `failed`, `requires_review`, or `mastered`. The versioned grading policy supplies the pass threshold; all mapped competencies must reach mastery for the attempt outcome to be mastered.

Migration `0011_assessment_evidence` normalizes every legacy step's primary action and correct feedback, enriches existing scenario snapshots, maps legacy steps to their lesson competencies, and materializes evidence/results for historical completed attempts.
