# OPedu WebAR Platform Implementation TODO

Status: **APPROVED FOR IMPLEMENTATION — 22 AUGUST 2026**

Implementation checkpoint (22 August 2026): **136 items checked; 73 remain open**. Checked
items include implemented software, recorded product decisions, and the eight items deliberately
kept out of scope under “Explicitly deferred.” Open items are intentionally not treated as failed
code work: most require a named school/instructor, a controlled physical rig, production-licensed
assets, exact devices, independent reviews, or measured pilot evidence. OPedu remains a WebAR
pilot candidate and has not passed the WebAR qualification gate. Every open item is assigned to an
evidence category in `docs/operations/external-release-gates.md`.

This backlog converts the gaps identified in `OPedu_AR_Platform_Evaluation.docx` into dependency-ordered implementation work. It complements `TODO.md` and `EXECUTION_TODO.md`; completed React, Django, PostgreSQL, curriculum, versioning, assessment, and desktop 3D work must be preserved.

No application-code task in this document should begin until the approval checklist below is explicitly approved.

## Target outcome

Deliver one evidence-complete, low-bandwidth technical-school WebAR lesson that:

1. Uses a phone camera to place guidance on a real training object or workspace.
2. Preserves the existing scenario actions, safety rules, grading, and evidence model.
3. Has an equivalent desktop/2D path that does not penalize learners without AR support.
4. Can be downloaded, completed during an outage, and synchronized exactly once.
5. Produces xAPI-compatible evidence and transparent rules-based recommendations.
6. Is validated by qualified instructors and a consented technical-school pilot.

## Approval checklist — required before coding

- [x] Approve the existing automotive battery procedure as the first AR module.
- [ ] Name the curriculum or competency standard and the qualified instructor responsible for validation.
- [ ] Approve use of a de-energized battery training rig or controlled mock-up; no unsupervised live-equipment training.
- [x] Approve a marker-first WebAR release, with markerless surface placement added after the evidence model is stable.
- [ ] Approve the lowest supported Android phone/tablet and browser baseline.
- [x] Approve desktop/accessible 2D as a required equivalent fallback, not an optional extra.
- [ ] Approve the initial languages and translation owners.
- [ ] Decide whether the pilot institution requires an LMS, an external LRS, both, or neither.
- [ ] Identify the pilot school(s), instructor owner, device custodian, support owner, and expected learner group.
- [ ] Approve privacy, consent, retention, safeguarding, and pseudonymized research-export responsibilities.
- [x] Approve the success thresholds proposed under Batch 11.
- [x] Approve the dependency order and release gates in this backlog.

## Fixed implementation principles

- [x] Keep React and TypeScript as the learner/instructor client.
- [x] Keep Django REST Framework as the backend and PostgreSQL as the system of record.
- [x] Keep the modular monolith; add adapters and background jobs only where justified.
- [x] Keep one scenario definition, action vocabulary, grading policy, and evidence model across desktop, 2D, marker AR, and markerless AR.
- [x] Treat tracking quality as system evidence, never as learner competence.
- [x] Do not award or remove marks solely because recognition, tracking, camera permission, or connectivity failed.
- [x] Do not introduce machine-learning recommendations before a sufficient consented pilot dataset exists.
- [x] Do not claim OPedu is a WebAR platform until the qualification gate passes.

---

## Batch 0 — Product, curriculum, safety, and measurement definition (P0)

### Procedure definition

- [x] Document the complete battery procedure, prerequisites, tools, hazards, tolerances, common mistakes, hints, remediation, and stop conditions.
- [ ] Select the exact training rig and identify every component the learner must recognize.
- [ ] Define which steps genuinely benefit from spatial AR instead of ordinary text, video, or desktop 3D.
- [ ] Define the physical workshop-transfer task conducted independently of the application score.
- [x] Map each procedure step and evidence item to the approved competencies.
- [ ] Obtain signed instructor approval for the procedure, hazards, tolerances, and scoring policy.

### Device and operating baseline

- [ ] Inventory representative school devices, browser versions, memory, storage, camera quality, and connectivity.
- [ ] Select the lowest supported device/browser profile and at least one unsupported profile for fallback testing.
- [x] Define first-load, cached-load, asset-size, memory, frame-rate, recognition-latency, battery, and thermal budgets.
- [x] Document charging, cleaning, storage, shared-device, download, update, and recovery procedures.

### Data and evaluation definition

- [x] Define the minimum learner, attempt, device-tier, recognition, and synchronization data required.
- [x] Separate identifiable operational records from pseudonymized research exports.
- [x] Define consent, withdrawal, retention, deletion, incident, and access-control workflows.
- [x] Define TAM, SUS, pre/post knowledge, practical-transfer, instructor-workload, and technical-reliability instruments.
- [x] Predefine analysis rules, exclusions, and success/failure thresholds before the pilot.

### Batch 0 gate

- [ ] Product brief, curriculum mapping, safety envelope, training rig, device baseline, data map, and evaluation plan are approved.

---

## Batch 1 — Complete the shared learning and instructor foundation (P0)

These items close current platform gaps that every renderer will depend on.

### Learner workflow

- [x] Complete lesson prerequisites, required tools, safety briefing, and expected-duration display.
- [x] Add a saved pre-lesson knowledge check.
- [x] Add attempt history, retry, and remediation flows without overwriting prior evidence.
- [x] Expand results to show competency evidence, missed steps, safety errors, hints, and recommended next actions.
- [x] Complete keyboard, focus, screen-reader, contrast, reduced-motion, and responsive behavior.
- [x] Add English/Kinyarwanda internationalization infrastructure if approved.

### Instructor workflow

- [x] Complete cohort and learner roster views.
- [x] Complete assignment creation, scheduling, attempt limits, and cohort/learner selection.
- [x] Add instructor observations and publishable feedback with immutable author/timestamp history.
- [x] Add competency aggregation and blocked, unsafe, overdue, failed, and requires-review filters.
- [x] Add CSV/research export for assignments, attempts, competencies, safety events, and durations.
- [x] Add audit events for assignment, publication, grading, and feedback mutations.

### Batch 1 gate

- [x] A learner and instructor can complete the full non-AR workflow through React with tenant-isolation and accessibility tests passing.

---

## Batch 2 — Shared scenario, renderer, and evidence contracts (P0)

### Capability model

- [x] Define a capability profile for camera permission, WebGL/WebXR support, input mode, memory tier, connection tier, storage, and reduced-motion preference.
- [x] Add a pre-launch compatibility diagnostic and record only the minimum operational data.
- [x] Define deterministic renderer selection: markerless AR, marker AR, desktop 3D, or accessible 2D.
- [x] Provide a learner-visible mode explanation and manual fallback choice.

### Shared renderer contract

- [x] Define renderer-neutral scenario, step, object, tool, hazard, prompt, anchor, and action schemas.
- [x] Define one stable action code for every equivalent interaction across all modes.
- [x] Define renderer-specific context as evidence that cannot change grading semantics.
- [x] Add parity tests proving equivalent valid actions produce equivalent step and competency results.
- [x] Add preview mode that never records assessment evidence.

### Stable evidence contract

- [x] Add stable URI identifiers for competencies, lessons, scenario versions, steps, actions, results, and actors.
- [x] Add globally unique client event IDs and backend uniqueness enforcement.
- [x] Add recognition and session events: permission, enter/exit, recognition success/failure, latency, placement, tracking loss, recovery, fallback, and re-scan.
- [x] Add idempotent event ingestion and preserve rejected/conflicting events for review.
- [x] Version event schemas and document backward-compatibility rules.

### Batch 2 gate

- [x] Desktop 3D and accessible 2D pass action/evidence/grading parity tests using the new shared contracts.

---

## Batch 3 — Production technical-content and asset pipeline (P0)

### Asset governance

- [ ] Audit ownership and licensing of every retained 3D asset.
- [x] Remove or quarantine assets with unverifiable rights.
- [ ] Obtain or create an instructor-validated battery/training-rig glTF package with accurate dimensions.
- [ ] Define part names, pivots, interaction targets, colliders, safety zones, and AR anchor metadata.
- [x] Version asset manifests and store checksums, MIME type, byte size, dimensions, and curriculum ownership.

### Optimization pipeline

- [x] Add automated glTF validation and manifest generation.
- [ ] Add Meshopt or Draco compression after supported-device testing.
- [ ] Add KTX2 textures and enforce dimension/byte limits.
- [ ] Generate thumbnails and low/medium/high quality variants.
- [x] Add CI checks for triangles, draw calls, materials, texture memory, bundle size, and missing metadata.

### Runtime loading

- [x] Add a typed asset loader with progress, cancellation, retry, caching, checksum verification, and useful errors.
- [x] Load scenario and asset versions from the APIs instead of hard-coded primitives.
- [ ] Replace the procedural battery placeholders with the validated glTF package.
- [x] Add progressive loading and graceful 2D fallback.
- [x] Record load, memory, frame-rate, and failure telemetry by anonymous device tier.

### Batch 3 gate

- [ ] The production asset loads and remains usable within approved budgets on the lowest supported device.

---

## Batch 4 — Accessible 2D and desktop parity release (P0)

- [x] Build a complete 2D procedure renderer using images/video/text and the shared action contract.
- [x] Ensure every required step, hazard, tool, prompt, tolerance, and evidence item can be completed without 3D or AR.
- [x] Add captions, transcripts, alt text, keyboard controls, focus order, and screen-reader announcements.
- [x] Complete desktop 3D reset, undo, safe restart, labels, outlines, keyboard camera controls, and visible control help.
- [x] Add guided and independent assessment modes.
- [x] Add deterministic snapping/tolerance behavior and equivalent randomized fault cases where approved.
- [ ] Run automated and instructor-reviewed outcome-parity tests across 2D and desktop 3D.

### Batch 4 gate

- [x] A learner can complete the lesson with identical required evidence and grading through 2D or desktop 3D.

---

## Batch 5 — Marker-based WebAR minimum vertical slice (P0)

### AR session and camera

- [x] Add secure-context and browser capability checks.
- [x] Add explicit camera permission, Enter AR, Exit AR, and session-recovery flows.
- [x] Show clear handling for denied permission, unsupported browser, low light, camera interruption, and unsafe workspace.
- [x] Keep the learner able to switch to an equivalent fallback without losing the attempt.

### Marker recognition and placement

- [x] Select and document the browser-compatible marker-recognition approach.
- [x] Create a printed fiducial/known target for the approved training rig.
- [ ] Detect the marker and register the asset coordinate system to the real rig.
- [ ] Add stable overlays for component identity, connection order, measurement points, hazards, and prompts.
- [x] Add re-scan, tracking-loss, misplacement, and false-recognition recovery.
- [x] Record recognition accuracy, latency, false placement, re-scan count, and tracking loss separately from learner actions.

### Evidence-complete lesson

- [x] Convert at least one battery procedure step to real WebAR using the shared action API.
- [x] Expand the slice to one complete guided battery procedure after the first step passes.
- [x] Add independent assessment mode without answer-revealing overlays.
- [x] Verify server-side grading remains unchanged by renderer mode.
- [x] Add mobile browser, orientation change, interruption, and permission regression tests.

### Batch 5 gate — minimum AR claim

- [ ] A target mobile browser displays the real camera environment.
- [ ] The training rig is recognized and guidance remains registered during the defined task envelope.
- [ ] At least one real procedure gains spatial instructional value beyond desktop 3D.
- [ ] Tracking failure does not penalize the learner and fallback preserves progress.
- [ ] Instructor, safety, device, performance, and evidence checks pass.

---

## Batch 6 — Markerless WebXR AR and spatial resilience (P1)

- [x] Add `immersive-ar` capability detection without hiding marker or fallback modes.
- [x] Add surface hit testing and placement confirmation.
- [x] Add anchors or an equivalent stable spatial-registration strategy.
- [x] Add reposition, reset, recenter, and tracking-recovery controls.
- [ ] Add occlusion, lighting estimation, depth, or plane features only where supported and instructionally useful.
- [x] Add safe-workspace prompts and prevent overlays from obscuring real hazards.
- [ ] Test portrait/landscape, interruption, tracking loss, relocalization, and device thermal behavior.
- [ ] Compare markerless and marker recognition quality without changing learner scores.
- [x] Maintain marker AR and 2D/desktop fallbacks for unsupported devices.

### Batch 6 gate

- [ ] Markerless placement is stable enough for the approved procedure on every explicitly supported device, with tested recovery and fallback.

---

## Batch 7 — Low-bandwidth, PWA, and offline evidence (P0 before pilot)

### Installable and downloadable experience

- [x] Add the PWA manifest, icons, service worker, update strategy, and install guidance.
- [x] Cache the application shell without caching authenticated responses unsafely.
- [x] Allow instructors or device custodians to pre-download approved lesson versions and asset quality tiers.
- [x] Store manifests, checksums, installed versions, and available storage.
- [x] Add interrupted-download recovery, integrity verification, and storage cleanup.

### Offline attempts and synchronization

- [x] Store active attempts, resume state, and unsynchronized events in IndexedDB.
- [x] Queue events with client-generated IDs and preserve original ordering.
- [x] Add backend batch ingestion with deduplication, conflict handling, and audit logs.
- [x] Show online, offline, saving, pending, synchronized, failed, and stale-version states.
- [x] Support completion during an outage and safe deferred final submission.
- [x] Test duplicate, missing, delayed, out-of-order, conflicting, and interrupted synchronization.

### Batch 7 gate

- [x] A downloaded lesson completes during a full network outage and synchronizes exactly once with complete evidence after reconnecting.

---

## Batch 8 — xAPI-compatible analytics and optional LRS integration (P1)

- [ ] Approve the minimum xAPI vocabulary and activity-identifier scheme.
- [x] Build an internal adapter from immutable OPedu events to actor–verb–object–result–context statements.
- [x] Add stable statement IDs, timestamp rules, version context, and deduplication.
- [x] Validate statements with fixtures and conformance checks.
- [x] Add consent-aware, pseudonymized xAPI/research export.
- [x] Add an asynchronous delivery outbox with retries and dead-letter review.
- [ ] Integrate an external LRS only if the approved institutional requirement needs it.
- [x] Add dashboards separating learning outcomes, AR recognition, device reliability, synchronization, and fallback use.

### Batch 8 gate

- [x] The same immutable attempt can be exported repeatedly without creating duplicate statements or changing authoritative PostgreSQL evidence.

---

## Batch 9 — Transparent adaptive sequencing (P1)

- [x] Define allowable adaptation inputs: mastery gaps, prerequisites, attempts, hints, safety events, engagement, and device reliability.
- [x] Exclude protected or unjustified personal attributes.
- [x] Implement deterministic versioned rules for remediation, repetition, next lesson, or additional challenge.
- [x] Store the input snapshot, rule version, recommendation, confidence, and human-readable rationale.
- [x] Allow instructors to inspect and override recommendations with an audit reason.
- [x] Test edge cases, fairness by device/fallback mode, and repeatability.
- [ ] Measure recommendation usefulness during the pilot.
- [x] Defer learned/ML policies until governance approval and sufficient representative data exist.

### Batch 9 gate

- [x] Every recommendation is reproducible, explainable, reviewable, and cannot bypass prerequisites or safety requirements.

---

## Batch 10 — Low/no-code AR authoring and publishing (P1)

- [x] Add authoring permissions and school/content-owner boundaries.
- [x] Build scenario metadata, steps, actions, prompts, tools, hazards, tolerances, competency mappings, and fallback-media editors.
- [x] Add asset upload validation for type, size, checksum, license, naming, and performance budgets.
- [x] Add anchor/marker configuration and visual placement preview.
- [x] Add renderer previews that never write assessment evidence.
- [x] Validate that every AR interaction has an equivalent fallback action.
- [x] Reject publishing when identifiers, assets, fallback, safety data, localization, or competency mappings are incomplete.
- [x] Preserve draft, review, approval, publication, retirement, immutable version, and audit workflows.
- [x] Add rollback to a previously published version without rewriting past attempts.

### Batch 10 gate

- [x] An authorized instructor/content author can publish a validated AR-enriched lesson without editing source code.

---

## Batch 11 — Technical-school pilot and evidence (P0 before scaling claims)

### Software implementation status (does not claim live pilot completion)

- [x] Add a role-scoped React pilot console and Django REST workflow for draft, freeze, collect,
      close, report, and immutable independent review.
- [x] Freeze versioned scenario, grading, asset checksum/manifest, instruments, device profiles,
      analysis plan, consent version, and thresholds in an immutable protocol snapshot.
- [x] Record named approval evidence, consent/withdrawal, incidents, and append-only rehearsal runs;
      block collection until the required preparation evidence passes.
- [x] Validate pseudonymized pre/post, transfer, SUS, TAM, workload, and coded interview records;
      reject duplicate or mutable pilot observations.
- [x] Calculate uncertainty, effect size, reliability, missing/excluded records, device-tier AR
      telemetry, AR/fallback parity, operations, workload, incidents, and explicit decision gates.
- [x] Reconcile offline event UUIDs against accepted PostgreSQL evidence and require a passing
      immutable reconciliation receipt for the offline gate.
- [x] Prevent an expansion approval when any frozen gate fails or lacks evidence, while allowing an
      independent limit/reject decision.

Implementation details and the remaining live-school work are in
[`docs/pilot/batch11-pilot-workflow.md`](docs/pilot/batch11-pilot-workflow.md). The original outcome
items below remain unchecked until actual approved pilot evidence exists.

### Pilot preparation

- [ ] Complete ethics/privacy/safeguarding approval, consent materials, withdrawal, and incident processes.
- [ ] Train instructors and device custodians; rehearse fallback, outage, stop, and recovery procedures.
- [ ] Freeze the pilot scenario, grading, assets, instruments, supported devices, and analysis plan.
- [ ] Run a small usability and safety rehearsal before recruiting the full group.

### Measures

- [ ] Measure pre/post knowledge gain and effect size.
- [ ] Measure independent physical-skill transfer with an instructor rubric.
- [ ] Measure SUS and TAM usefulness, ease, enjoyment, and intention.
- [ ] Measure recognition accuracy, false placement, latency, tracking loss, re-scans, and fallback rate by device tier.
- [ ] Measure completion parity and outcomes across AR and fallback modes.
- [ ] Measure downloads, synchronization, crashes, support incidents, storage, and instructor workload.
- [ ] Calculate instrument reliability where appropriate and report missing/excluded data transparently.
- [ ] Conduct learner and instructor interviews and analyze recurring operational barriers.

### Proposed success thresholds for approval

- [ ] No unresolved safety-critical defect or AR-caused grading penalty.
- [ ] Equivalent required evidence and completion opportunity in AR and fallback modes.
- [ ] Median SUS of at least 70, subject to final research approval.
- [ ] Recognition and placement meet the procedure-specific accuracy/latency limits approved in Batch 0.
- [ ] Offline attempts synchronize exactly once with no lost accepted evidence.
- [ ] Learning and physical-transfer results are reported with uncertainty; no effectiveness claim is made from engagement alone.
- [ ] Instructor workload and support burden are acceptable to the participating school.

### Batch 11 gate

- [ ] A documented independent go/no-go review approves, limits, or rejects expansion based on actual pilot evidence.

---

## Batch 12 — Production hardening and controlled scale (P0 before real deployment)

- [ ] Add browser/device matrix tests for every supported AR and fallback mode.
- [x] Add backend unit/API/permission/migration/idempotency/grading tests to CI.
- [x] Add frontend unit/accessibility/Playwright/offline/visual-regression tests to CI.
- [x] Add OpenAPI drift, generated-client, event-schema, xAPI, glTF, asset-license, and performance-budget checks.
- [x] Add CSP, HSTS, secure-cookie, trusted-origin, upload, object-storage, and media-delivery controls.
- [x] Add structured logging, request IDs, error monitoring, performance monitoring, uptime checks, and privacy-safe AR telemetry.
- [ ] Add deployment approval gates, database/object-storage backup, restore, rollback, and incident runbooks.
- [ ] Complete an accessibility review, privacy review, threat model, and independent security review.
- [ ] Complete device, browser, low-bandwidth, thermal, battery, camera, classroom, and workshop acceptance tests.
- [x] Publish supported-device, known-limitations, fallback, safety, privacy, and support documentation.
- [ ] Run a multi-school replication before making broad effectiveness or global-scale claims.

### Batch 12 gate

- [ ] Production, school-operations, security, accessibility, recovery, and evidence owners sign off on release.

---

## WebAR qualification gate

OPedu may be described as a **WebAR platform** only when all items below are demonstrated:

- [ ] A supported mobile browser enters an AR session and displays the live environment.
- [ ] A training object or surface is recognized and guidance remains spatially aligned through the approved task envelope.
- [ ] A real technical-school procedure uses AR-specific overlays that add instructional value.
- [ ] The same procedure has an equivalent 2D/desktop path with the same required evidence and grading rules.
- [ ] Permission denial, unsupported hardware, low light, tracking loss, and unsafe-workspace recovery paths pass.
- [ ] Asset delivery and synchronization meet budgets on the lowest supported device and constrained network.
- [ ] Recognition quality is recorded separately from learner competency.
- [ ] A qualified technical instructor approves the procedure, content, hazards, tolerances, and transfer task.
- [ ] Accessibility, privacy, safeguarding, security, and operational checks pass.
- [ ] Pilot results and limitations are documented without overstating the dissertation’s unexecuted research plan.

## Explicitly deferred until evidence supports expansion

- [x] Native Unity/Godot application.
- [x] VR headset scope beyond a separately approved requirement.
- [x] Machine-learning personalization or high-stakes AI grading.
- [x] Eye tracking, emotion inference, voice recording, or biometric analytics.
- [x] Multiplayer immersive classrooms.
- [x] Microservices or Kubernetes.
- [x] A large multi-trade content library before the battery module proves practical skill transfer.
- [x] Mandatory external LRS/LMS integrations without an institutionally approved use case.

## Approval record

- [x] **Backlog approved for implementation.**
- Approver: Project owner (approval recorded in the Codex task)
- Approval date: 22 August 2026
- Approved batches: Batches 0–12 as written
- Required changes or exclusions: None stated. External instructor, institution, hardware,
  privacy, safeguarding, security, and real-pilot approvals remain release gates and cannot
  be replaced by software implementation.
