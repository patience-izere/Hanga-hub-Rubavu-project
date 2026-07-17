# OPedu Remaining Feature Execution Backlog

This is the ordered implementation checklist for continuing OPedu in one uninterrupted Codex session. `TODO.md` remains the complete research, policy, pilot, and long-term roadmap; this file converts the remaining software work into executable batches.

## Current baseline

- [x] React, TypeScript, Vite, routing, TanStack Query, linting, tests, and production build.
- [x] Django 5.2, REST API, secure session authentication, PostgreSQL configuration, Redis configuration, Docker Compose, and health checks.
- [x] School membership roles and school-scoped learner/instructor permissions.
- [x] Course, competency, lesson, assignment, procedure, attempt, immutable event, resume, completion, and scoring records.
- [x] Learner dashboard, lesson overview, guided battery simulation, accessible controls, results, instructor overview, safety flags, and attempt timeline.

## Execution rules

- [ ] Work through batches in order; do not start a dependent batch before its gate passes.
- [ ] Preserve existing user changes and do not commit, push, rotate credentials, or rewrite Git history without explicit authorization.
- [ ] Add migrations for every model change and keep the seed command idempotent.
- [ ] Add tenant-isolation, unauthorized, validation, and success tests for every new API.
- [ ] Provide keyboard and HTML alternatives for every 3D or immersive action.
- [ ] Run backend tests, frontend lint/tests/build, migration checks, deployment checks, and `docker compose config` at every batch gate.
- [ ] Keep WebXR gated behind completion of the desktop, offline, accessibility, and performance work.

---

## Batch 1 — Repository and API quality foundation (P0)

### Repository cleanup

- [x] Add `.editorconfig`.
- [x] Add a root `package.json` or PowerShell task scripts for `dev`, `test`, `lint`, `build`, `seed`, and `check` across both applications.
- [x] Remove duplicate Django URL imports, dead views, obsolete comments, and unused legacy JavaScript after confirming references with `rg`.
- [x] Consolidate duplicate README/setup documents without deleting unique setup information.
- [x] Create `docs/architecture/`, `docs/product/`, `docs/pilot/`, and `docs/operations/`.
- [x] Add architecture decision records for React/Django, PostgreSQL, session authentication, event-sourced attempts, offline synchronization, and desktop-before-WebXR.

### Formatting and dependency reproducibility

- [x] Add Ruff configuration and backend lint/format commands.
- [x] Add Prettier and import aliases to the frontend.
- [x] Add pytest and pytest-django while retaining or migrating existing Django tests safely.
- [x] Add a reproducible Python constraints/lock workflow.
- [x] Confirm one frontend lockfile and remove no-longer-used frontend dependencies.

### API contract

- [x] Install and configure DRF OpenAPI schema generation.
- [x] Publish `/api/v1/schema/` and interactive API documentation in development.
- [x] Generate TypeScript API types/client code from the schema.
- [x] Replace handwritten duplicate API types progressively. (Instructor contracts now use generated schema types; learner contracts can migrate as endpoints evolve.)
- [x] Standardize JSON validation, authentication, permission, conflict, and server error bodies.
- [x] Standardize pagination, ordering, filtering, and search parameters.
- [x] Add consistent media URL resolution.

### Batch 1 gate

- [x] Root quality commands work on Windows and CI.
- [x] Ruff, ESLint, Prettier, TypeScript, backend tests, frontend tests, and builds pass.
- [x] OpenAPI generation produces no schema warnings.

---

## Batch 2 — Authentication, onboarding, and platform security (P0)

### Authentication features

- [x] Add password-change API and React page for authenticated users.
- [x] Add password-reset request and confirmation flows with development email backend support.
- [x] Add administrator-controlled school invitation/onboarding flow.
- [x] Add account activation/deactivation management.
- [x] Add login throttling and temporary account lockout.
- [x] Add global and endpoint-specific API throttling.
- [x] Add current-session expiry handling and a clear React reauthentication state.

### Roles and auditing

- [x] Formalize platform administrator, school administrator, instructor, learner, and content-author permissions.
- [x] Add reusable DRF permission classes instead of embedding role checks in views.
- [x] Enforce school isolation on every current query; require the same tests for every new query.
- [ ] Add immutable administrative audit events for membership changes, assignment creation, content publication, grading, and instructor feedback. (Password and assessment lifecycle audit events are complete; mutation APIs not yet built still need hooks.)
- [x] Add audit review in Django Admin.

### Legacy surface reduction

- [x] Disable the unauthenticated global chat routes and WebSocket consumer.
- [x] Reproduce signup/onboarding and support pages in React. (Public self-signup is intentionally replaced by controlled invitation onboarding.)
- [x] Add Playwright coverage for login, logout, learner flow, instructor flow, and forbidden cross-school access. (Backend integration tests independently enforce authentication and tenant isolation.)
- [x] Remove public Django template routes only after their React replacements pass Playwright. (Legacy names now redirect to React; Django Admin remains server-rendered.)
- [x] Keep Django Admin server-rendered.

### Batch 2 gate

- [x] Authentication success, failure, CSRF, throttle, reset, inactive-user, and cross-school tests pass.
- [x] No public unauthenticated chat endpoint remains.
- [x] Secret scanning finds no live credentials in the working tree.

---

## Batch 3 — PostgreSQL and learning-domain completion (P0)

### Database readiness

- [x] Review legacy migrations and resolve obsolete model/table inconsistencies. (The linear chain applies cleanly; intentionally retained legacy tables are documented.)
- [x] Fix remaining legacy model defects and string encodings.
- [x] Decide and document whether existing SQLite data is disposable.
- [x] Apply all migrations to a clean PostgreSQL database in CI.
- [x] Add PostgreSQL backup, restore, and retention scripts/documentation.
- [x] Execute and verify one actual restore drill.

### Organization and curriculum

- [x] Add `Program`/`Trade`, `Module`, `Cohort`, and `Enrollment` models.
- [x] Add validated learner and instructor profile fields; remove birth date and phone unless the product brief justifies them.
- [ ] Add competency curriculum reference, level, evidence rules, and mastery criteria.
- [ ] Add lesson prerequisites, language, content version, and approval workflow.
- [ ] Add draft, review, approved, published, and retired states with author/reviewer audit data.

### Versioned simulations

- [ ] Add immutable/versioned `SimulationScenario` records.
- [ ] Add versioned `AssetPackage` and `AssetFile` records with checksums, MIME type, byte size, and manifest.
- [ ] Add normalized `Tool`, `Hazard`, `Hint`, tolerance, acceptable-action, and feedback records.
- [ ] Store the scenario and grading-policy version on every attempt.
- [ ] Prevent published scenario versions from being edited in place.

### Assessment evidence

- [ ] Add `StepResult` with outcome, attempts, hints, duration, tolerance result, and safety violation data.
- [ ] Add `CompetencyResult` with achieved points, threshold, mastery state, and evidence references.
- [ ] Add pass, fail, requires-review, and mastered attempt outcomes.
- [ ] Move penalty constants into a versioned grading policy.
- [ ] Add instructor observation and feedback records with author and timestamp.
- [ ] Add stable xAPI-compatible identifiers to important event types without adding a separate LRS.

### Batch 3 gate

- [x] A clean PostgreSQL database can represent and seed the entire learner/instructor workflow.
- [ ] Attempt results remain reproducible after content changes.
- [x] Model, migration, permission, and deterministic-grading tests pass.

---

## Batch 4 — Complete learner experience (P0)

- [ ] Add prerequisites and required tools to the lesson overview.
- [ ] Add a short pre-lesson knowledge check with saved responses.
- [ ] Add browser/device compatibility diagnostics before simulation launch.
- [ ] Add WebGL availability, memory/performance tier, input-method, connection, and reduced-motion checks.
- [ ] Add attempt history with filters and links to results.
- [ ] Expand results with competency-level evidence, missed steps, safety errors, hints, and recommended remediation.
- [ ] Add a retry flow that creates a new attempt without overwriting prior evidence.
- [ ] Add notifications/toasts for save, sync, completion, and recoverable errors.
- [ ] Add English/Kinyarwanda internationalization infrastructure and remove embedded user-facing strings from feature code.
- [ ] Complete keyboard, focus, screen-reader, contrast, and responsive accessibility review.
- [ ] Add tablet and headset-browser responsive layouts.

### Batch 4 gate

- [ ] A learner can complete, leave, resume, submit, review, and retry a lesson without using Django templates.
- [ ] Automated accessibility checks and keyboard-only Playwright flow pass.

---

## Batch 5 — Complete instructor experience (P0)

- [ ] Add cohort and learner roster views.
- [ ] Add assignment creation, learner/cohort selection, due date, attempt limit, and scheduling.
- [ ] Add lesson and scenario preview using the learner renderer without recording assessment events.
- [ ] Add competency aggregation by learner, cohort, lesson, and date range.
- [ ] Add blocked, repeatedly unsafe, overdue, failed, and requires-review filters.
- [ ] Add instructor observations and feedback editing on attempt review.
- [ ] Notify learners when instructor feedback is published.
- [ ] Add CSV export for assignments, attempts, competency outcomes, safety errors, and durations.
- [ ] Add content-author workflow in Django Admin for lesson review and publishing.

### Batch 5 gate

- [ ] An instructor can assign, monitor, review, comment, filter, and export evidence for only their school.
- [ ] Cross-school API and UI authorization tests pass.

---

## Batch 6 — Production 3D content and interaction pipeline (P0)

### Asset delivery

- [ ] Audit and record licensing/ownership for every retained 3D asset.
- [ ] Remove unlicensed or unverifiable legacy vehicle assets.
- [ ] Define glTF naming conventions for parts, tools, pivots, anchors, colliders, and interaction metadata.
- [ ] Add a Blender export checklist.
- [ ] Add automated glTF validation and manifest generation.
- [ ] Add Meshopt/Draco compression where device testing supports it.
- [ ] Add KTX2 textures and enforce texture dimension/byte budgets.
- [ ] Generate asset thumbnails and checksums.
- [ ] Define budgets for download size, triangles, materials, textures, draw calls, memory, load time, and frame rate.

### Runtime loader

- [ ] Build a centralized typed asset loader with progress, cancellation, retry, caching, checksum verification, and actionable errors.
- [ ] Load scenario and asset manifests from versioned APIs.
- [ ] Replace primitive battery placeholders with an optimized licensed glTF package.
- [ ] Add low-memory/low-bandwidth quality tiers.
- [ ] Add graceful fallback when 3D cannot load.

### Interaction system

- [ ] Add keyboard camera controls and visible control help.
- [ ] Add reusable selection outlines, labels, focus targets, and contextual prompts.
- [ ] Add reset, undo, and safe restart with corresponding attempt events.
- [ ] Add deterministic snapping, tolerances, and validation.
- [ ] Integrate Rapier only for interactions that require physics; keep grading deterministic outside the physics engine.
- [ ] Add an orientation/tutorial scene.
- [ ] Add independent assessment mode without highlighted answers.
- [ ] Add randomized but equivalent battery fault cases with deterministic seeds.
- [ ] Add performance instrumentation without collecting unnecessary learner/device identifiers.

### Batch 6 gate

- [ ] The production lesson loads within budget on the lowest supported school device.
- [ ] Guided and independent modes produce reproducible evidence and scores.
- [ ] Asset validation and performance budgets run in CI.

---

## Batch 7 — Offline-first school operation (P0 before pilot)

### PWA and local data

- [ ] Add a web-app manifest, icons, service worker, update flow, and install prompt.
- [ ] Cache the application shell without caching authenticated HTML incorrectly.
- [ ] Store downloaded scenario manifests/assets with version and checksum metadata.
- [ ] Store active attempts and unsynchronized events in IndexedDB.
- [ ] Add client-generated event IDs and a backend uniqueness constraint for idempotent synchronization.
- [ ] Add a backend batch-event ingestion endpoint with ordered conflict handling.

### Synchronization experience

- [ ] Queue actions when offline and update the local resume state immediately.
- [ ] Synchronize queued events in order after reconnect.
- [ ] Preserve rejected/conflicting events for review instead of deleting them.
- [ ] Show online, offline, saving, pending-sync, synchronized, and failed-sync states.
- [ ] Prevent final submission until required evidence is synchronized or explicitly mark it pending.
- [ ] Add retry/backoff and background synchronization where supported.
- [ ] Test reload, browser crash, interrupted download, duplicate delivery, stale scenario, and low-bandwidth recovery.

### School operations

- [ ] Let instructors select lessons for pre-download on shared devices.
- [ ] Add a minimal device inventory: anonymous device ID, last seen, app version, installed lessons, storage, and sync status.
- [ ] Add lesson removal and storage cleanup controls.
- [ ] Document charging, storage, cleaning, Wi-Fi, updates, shared-account avoidance, and recovery procedures.

### Batch 7 gate

- [ ] A downloaded lesson can be completed during an outage and synchronizes exactly once after reconnection.
- [ ] Offline Playwright tests and conflict/idempotency backend tests pass.

---

## Batch 8 — Support and controlled communication (P1)

- [ ] Build searchable help content for controls, accessibility, safety, offline use, and troubleshooting.
- [ ] Add structured learner help requests scoped to an assignment and instructor.
- [ ] Add instructor announcements before considering real-time chat.
- [ ] Add support requests with minimal diagnostics and no unnecessary personal data.
- [ ] If real-time rooms are later enabled, require authentication, cohort membership, `wss://`, persistence, identity, timestamps, length limits, rate limits, reporting, moderation, blocking, and audits.
- [ ] Do not enable open learner-to-learner chat in the MVP.

---

## Batch 9 — WebXR extension after desktop acceptance (P1)

- [ ] Add WebXR capability detection while preserving desktop mode.
- [ ] Add explicit Enter VR and Exit VR actions.
- [ ] Use the WebXR animation loop and headset-provided camera.
- [ ] Add left/right controller rays and direct interaction.
- [ ] Add grab, two-handed, and hand-tracking interactions only where the procedure requires them.
- [ ] Add floor reference, recentering, seated mode, safe boundaries, teleportation, snap turning, and reduced-motion settings.
- [ ] Add spatial warnings with equivalent visual/text feedback.
- [ ] Add an instructor-visible mirrored view.
- [ ] Record compatibility separately from learner identity.
- [ ] Add WebXR interaction events without changing the grading semantics used on desktop.
- [ ] Test on at least two explicitly supported standalone headset models.
- [ ] Document session duration, breaks, sanitation, opt-out, and incident response.
- [ ] Do not collect gaze, emotion, voice, or biometric data without a completed privacy impact assessment and legal basis.

### Batch 9 gate

- [ ] The same scenario, action vocabulary, evidence, grading policy, and accessible alternative work in desktop and VR modes.
- [ ] Comfort, safety, device, and instructor validation checklists pass.

---

## Batch 10 — Production quality and deployment (P0 before real learners)

### Automated quality

- [ ] Require backend unit, API, permission, migration, deterministic-scoring, and offline-sync tests in CI.
- [ ] Require frontend unit, accessibility, Playwright, build, and offline tests in CI.
- [ ] Add visual regression tests for learner, instructor, results, offline, and 3D-loading states.
- [ ] Add dependency, license, static analysis, and secret scanning.
- [ ] Add migration, OpenAPI generation, generated-client drift, glTF validation, and performance-budget checks.

### Deployment and operations

- [ ] Add separate base, development, test, staging, and production Django settings.
- [x] Configure production SPA/static/media routing without intercepting `/api/`, `/admin/`, or `/media/`.
- [ ] Add staging and production deployment workflows with approval gates.
- [ ] Add CSP, HSTS, secure-cookie, trusted-origin, proxy, upload, and object-storage configuration.
- [ ] Add structured logs, request IDs, error monitoring, health monitoring, uptime checks, and tracing.
- [ ] Add object-storage lifecycle, PostgreSQL backups, restore drills, and rollback runbooks.
- [ ] Define pilot service objectives and alert thresholds.
- [ ] Run `manage.py check --deploy` and an independent security review.

### Final acceptance gate

- [ ] Fresh clone starts successfully using documented commands.
- [x] Clean PostgreSQL migration and seed pass.
- [ ] Learner happy path passes online and offline.
- [ ] Instructor assignment, monitoring, review, feedback, and export paths pass.
- [ ] Unauthorized and cross-school paths are rejected.
- [ ] Lowest-supported desktop/tablet performance and accessibility checks pass.
- [ ] Supported headset checks pass only if Batch 9 is included in the release.
- [ ] All code, API, architecture, operations, privacy, and recovery documentation is current.

---

## External decisions and non-code blockers

These can be documented during the session but cannot be truthfully completed without owners, institutions, legal review, hardware, or instructors.

- [ ] Rotate the previously exposed MongoDB credential with the credential provider.
- [ ] Authorize and perform Git-history secret removal if required.
- [ ] Approve the MVP product brief, supported languages, and physical workshop transfer task.
- [ ] Obtain the applicable Rwanda TVET curriculum/competency standard.
- [ ] Validate the procedure, hazards, tolerances, and grading with qualified instructors.
- [ ] Decide SQLite data retention and production hosting/data regions.
- [ ] Assign the data controller, processors, DPO responsibilities, retention rules, lawful bases, consent processes, and cross-border safeguards.
- [ ] Complete privacy and safeguarding reviews before real learners, social features, or sensor data.
- [ ] Select pilot schools, devices, headsets, support owners, and hardware custodians.
- [ ] Execute physical-device, workshop-transfer, discomfort, retention, cost, and learning-outcome evaluations.

## Explicitly deferred

- [ ] Native Unity/Godot application.
- [ ] Advanced multiplayer VR.
- [ ] AI high-stakes grading or autonomous tutor.
- [ ] Eye tracking, emotion inference, or biometric analytics.
- [ ] Blockchain credentials.
- [ ] Third-party simulation marketplace.
- [ ] Microservices or Kubernetes.
- [ ] Large multi-trade content library before the first module proves skill transfer.
