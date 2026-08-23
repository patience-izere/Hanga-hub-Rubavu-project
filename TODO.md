# OPedu Platform Improvement TODO

This backlog defines the work required to turn the current mechanical-lab proof of concept into a useful learning platform.

For the dependency-ordered implementation checklist intended for one continuous execution session, use [`EXECUTION_TODO.md`](EXECUTION_TODO.md). This file remains the complete product, research, policy, pilot, and engineering roadmap.

## Fixed architecture decisions

- [x] Use React with TypeScript for the learner and instructor frontend.
- [x] Use Vite as the frontend build system.
- [x] Keep Django as a backend API and administration service.
- [x] Use Django REST Framework under a versioned `/api/v1/` namespace.
- [x] Use PostgreSQL for persistent application data.
- [x] Use Redis for WebSockets, caching, and background-job coordination when those features are introduced.
- [x] Keep the first release as a modular monolith; do not introduce microservices.
- [x] Deliver every learning simulation in desktop mode first, then add WebXR support.
- [ ] Optimize for unreliable connectivity and shared school devices.

## Meaningful MVP definition

The first meaningful release is complete when an instructor can assign one curriculum-aligned mechanical lesson and a learner can:

1. Sign in.
2. See the assigned lesson and its learning objectives.
3. Open an optimized 3D simulation on a desktop browser.
4. Follow a guided mechanical procedure with safety rules and feedback.
5. Complete an independently assessed attempt.
6. Leave and resume without losing progress.
7. Receive a result explaining mastered and missed competencies.
8. Have the attempt appear in the instructor dashboard.

The first release should contain one excellent module rather than many unstructured 3D models.

---

## Phase 0 — Product scope and security blockers (P0)

### Product definition

- [ ] Select the first trade and lesson for the MVP.
  - Recommended starting point: automotive electrical fault diagnosis or mechanical assembly/disassembly.
- [ ] Obtain the corresponding Rwanda TVET Board curriculum or competency standard.
- [ ] Identify 3–5 competencies the lesson will assess.
- [ ] Define the real workshop task learners must perform after the simulation.
- [ ] Interview at least two technical instructors and document the normal teaching procedure.
- [ ] Document learner prerequisites, common mistakes, hazards, tools, and expected completion time.
- [ ] Write a one-page product brief covering the target learner, instructor, school, problem, outcome, and success measure.
- [ ] Decide the initial supported languages: English and Kinyarwanda are recommended.

### Security remediation

- [ ] Rotate the MongoDB credential exposed in `mechlab/mechlab/settings.py`.
- [ ] Remove the exposed URI from the current file and all reachable Git history.
- [x] Move every secret and environment-specific setting to environment variables.
- [x] Add a safe `.env.example` containing names only, never real credentials.
- [x] Make production startup fail when `SECRET_KEY`, database configuration, or allowed hosts are missing.
- [x] Make `DEBUG=False` the secure default.
- [x] Remove `@csrf_exempt` from progress-related endpoints.
- [x] Change logout to a POST action.
- [x] Add basic login throttling and account lockout protection.
- [x] Remove or disable the unauthenticated global chat until rooms, authorization, and moderation exist.
- [ ] Create an initial privacy and data-retention checklist for learner data.

### Repository cleanup

- [x] Confirm the supported Python and Node.js versions and record them in the repository.
- [x] Add `.editorconfig`, frontend linting, backend linting, and formatting rules.
- [x] Delete or archive abandoned JavaScript implementations after confirming they are unused.
- [ ] Remove duplicate imports, dead Django views, obsolete commented configuration, and unused CSS. (Python/URL/ASGI cleanup is complete; a focused legacy CSS audit remains.)
- [x] Replace the duplicated README files with one project overview and component-specific setup guides.
- [x] Add an architecture decision record explaining React, Django, PostgreSQL, WebXR, and offline-first choices.

**Phase 0 exit criteria:** no live credentials are present; the first lesson, competencies, users, and measurable outcome are documented.

---

## Phase 1 — Development foundation (P0)

### Repository layout

- [x] Create `frontend/` for the React application.
- [x] Keep the Django project in `mechlab/` initially to avoid an unnecessary move during the migration.
- [x] Create `docs/architecture/`, `docs/product/`, and `docs/pilot/` directories.
- [x] Add root commands or scripts for starting, testing, linting, and building both applications.
- [x] Decide whether to use npm or pnpm and commit exactly one lockfile.

### React foundation

- [x] Scaffold React, TypeScript, and Vite.
- [x] Configure React Router.
- [x] Configure TanStack Query for server state.
- [x] Add a small accessible component system and design tokens.
- [x] Configure ESLint, Prettier, strict TypeScript, and import aliases.
- [x] Configure Vitest and React Testing Library.
- [ ] Add Playwright for end-to-end tests. (The runner, CI integration, password-recovery smoke test, and role-route tests are complete; full learner/instructor workflows remain.)
- [x] Add environment validation for the backend API URL.
- [x] Create development, test, and production build configurations.

### Backend modernization

- [x] Upgrade Django 3.2 to Django 5.2 LTS in tested increments.
- [x] Upgrade Django REST Framework, Channels, Pillow, Daphne, and other dependencies to supported compatible versions.
- [x] Pin dependencies with hashes or a reproducible lock/constraints workflow.
- [ ] Split Django settings into base, development, test, and production settings.
- [x] Add backend linting and formatting with Ruff.
- [x] Add pytest and pytest-django.
- [x] Generate an OpenAPI schema and make it part of CI.
- [x] Use consistent JSON error responses.
- [x] Add `/api/v1/health/live/` and `/api/v1/health/ready/` endpoints.

### Local development

- [x] Add Dockerfiles for frontend and backend.
- [x] Add Docker Compose services for frontend, backend, PostgreSQL, and Redis.
- [x] Add one documented command that starts the complete local system.
- [x] Add repeatable seed data for a school, instructor, learner, course, and lesson.
- [ ] Verify local development on Windows and Linux/CI.

**Phase 1 exit criteria:** a new developer can clone the repository, start the complete stack, and run all checks using documented commands.

---

## Phase 2 — PostgreSQL and backend API (P0)

### PostgreSQL migration

- [x] Add PostgreSQL configuration using `DATABASE_URL` or equivalent validated variables.
- [x] Create development and test databases through Docker Compose.
- [x] Review all existing migrations before applying them to PostgreSQL.
- [x] Fix model defects, including `UserProgress.__str__` returning a User object instead of a string.
- [x] Decide whether existing SQLite data must be preserved. (The ignored local database is disposable; unknown school data requires an explicit inventory.)
- [x] If data matters, write and test an export/import migration procedure. (No retained SQLite data currently exists, so automatic import is intentionally not required.)
- [x] Apply migrations to a clean PostgreSQL database in CI.
- [x] Add backup, restore, and retention documentation before production deployment.
- [x] Test restoration from an actual backup.

### Authentication and authorization

- [x] Keep secure same-origin session-cookie authentication for the first web release.
- [x] Create `/api/v1/auth/me/`, login, logout, password-change, and password-reset flows.
- [x] Configure CSRF correctly for the React client.
- [x] Add email verification or an administrator-controlled school onboarding flow. (School administrators can issue expiring, single-use invitations.)
- [x] Define roles: platform administrator, school administrator, instructor, learner, and content author. (The deny-by-default matrix and reusable permissions are documented; future mutation APIs must apply them.)
- [x] Add organization/school membership and enforce tenant isolation in every current learning/evidence query.
- [x] Add object-level permission tests for learner attempts and school-scoped instructor evidence. (Additional content-authoring permission coverage remains as those APIs are introduced.)
- [ ] Add audit events for important administrative and assessment actions. (Password and assessment attempt audit events are complete; future mutation APIs must add their events.)

### Initial API quality

- [x] Standardize pagination, filtering, sorting, and search.
- [x] Use absolute or consistently resolvable URLs for media assets.
- [ ] Add file type, size, and content validation for uploaded 3D assets and thumbnails.
- [x] Add API rate limits.
- [ ] Add API tests for success, validation, unauthorized, forbidden, and cross-school access cases.
- [ ] Generate a typed TypeScript API client from the OpenAPI schema.

**Phase 2 exit criteria:** authentication, permissions, seeded data, and migrations work reliably against PostgreSQL; the React client consumes a documented `/api/v1/` API.

---

## Phase 3 — Learning domain model (P0)

Replace the single-score data model with records that describe real learning.

### Organization and users

- [x] Add `Organization` or `School`.
- [x] Add school membership with a role and status.
- [x] Add class/cohort and enrollment models.
- [x] Replace the current profile design with validated learner/instructor profiles.
- [x] Avoid collecting birth date and phone number unless a documented purpose requires them.

### Curriculum and content

- [x] Add `Trade` or `Program`.
- [x] Add `Course` and `Module`.
- [x] Add `Competency` with curriculum reference, level, evidence rules, and mastery criteria.
- [x] Add `Lesson` with objectives, prerequisites, estimated time, language, content version, and publication state.
- [x] Add versioned `SimulationScenario` records with immutable published definitions.
- [x] Add `ProcedureStep`, required tool, hazard, acceptable action, tolerance, hint, and feedback records.
- [x] Add versioned 3D asset packages and integrity-checked asset-file metadata. (The legacy isolated model API remains as a compatibility bridge.)
- [x] Register all existing content models in Django Admin. (Fine-grained authoring permissions remain.)
- [x] Add draft, review, approved, published, and retired content states with controlled transitions and audit events.

### Assignment and assessment

- [ ] Add `Assignment` with school, class, lesson, due date, and attempt rules. (Learner, lesson, assigner and due date are complete.)
- [x] Add `Attempt` with status, start/end time, immutable scenario/grading-policy versions, and resume state.
- [x] Add immutable `AttemptEvent` records for each significant learner action.
- [x] Add immutable `StepResult` records with safety violations, hints used, duration, tolerance outcome, and attempt counts.
- [x] Add competency-level assessment results with mastery thresholds and event-backed evidence references.
- [ ] Add instructor observations and feedback.
- [x] Define deterministic pending, passed, failed, requires-review, and mastered attempt outcomes.
- [x] Make grading deterministic and versioned with an immutable algorithm identifier and policy parameters.
- [ ] Plan xAPI-compatible event names and identifiers without blocking the first MVP on a separate LRS.

**Phase 3 exit criteria:** the database can represent one complete lesson, its procedure, assignments, resumable attempts, evidence, and competency results.

---

## Phase 4 — React product experience (P0)

### Shared application shell

- [ ] Build accessible navigation, account menu, loading states, errors, empty states, and notifications. (The initial shell and core states are complete.)
- [x] Add role-aware routes and route guards.
- [ ] Add English and Kinyarwanda internationalization infrastructure.
- [ ] Add responsive layouts for desktop, tablet, and headset browser widths.
- [ ] Establish a recognizable OPedu visual system rather than page-specific inline CSS.
- [ ] Meet keyboard navigation, focus visibility, form-label, contrast, and screen-reader requirements.

### Learner experience

- [x] Build learner dashboard with current assignments and progress.
- [ ] Build lesson overview with objectives, prerequisites, safety information, and expected time. (Objectives, safety and time are complete.)
- [ ] Build pre-lesson knowledge check.
- [ ] Build simulation launch and compatibility check. (Launch and resume are complete; capability diagnostics remain.)
- [x] Build attempt resume flow.
- [ ] Build result page showing competency evidence and recommended remediation. (Attempt score, step evidence and review recommendation are complete; competency-level evidence remains.)
- [ ] Build attempt history.
- [x] Provide a desktop alternative for every immersive interaction.

### Instructor experience

- [ ] Build class and learner views. (The first school-wide learner attempt view is complete; cohorts and learner profiles remain.)
- [ ] Build assignment creation and scheduling.
- [ ] Build lesson preview.
- [ ] Build progress and competency dashboard. (Attempt, completion, error and safety metrics are complete; competency aggregation remains.)
- [ ] Show learners who are blocked, repeatedly unsafe, or overdue. (Safety errors are highlighted; blocked/repeated/overdue rules remain.)
- [ ] Build attempt review with event timeline and instructor feedback. (School-scoped immutable event review is complete; instructor-authored feedback remains.)
- [ ] Add CSV export for initial reporting needs.

### Retire Django templates

- [x] Reproduce login, signup/onboarding, home, lab, and support flows in React. (Public self-signup is intentionally replaced by controlled school invitations.)
- [x] Keep Django Admin server-rendered; it does not need to be rewritten.
- [x] Remove public Django template routes only after React replacements pass end-to-end tests.
- [x] Configure Django to serve APIs and media while the production web server serves the React build.
- [x] Add SPA fallback routing without intercepting `/api/`, `/admin/`, or `/media/`.

**Phase 4 exit criteria:** learners and instructors can complete the meaningful MVP workflow without using a Django template page.

---

## Phase 5 — Rebuild the 3D laboratory (P0)

### 3D technical foundation

- [x] Install Three.js through the frontend package manager; remove CDN script dependencies.
- [x] Build the scene in typed, testable modules.
- [x] Add React Three Fiber after a successful proof of concept.
- [ ] Select and integrate maintained physics, recommended: Rapier.
- [ ] Add a centralized asset loader with progress, cancellation, caching, and useful errors.
- [ ] Load scenario and asset URLs from the versioned API.
- [ ] Add camera controls suitable for mouse, touch, keyboard, and headset controllers. (Mouse/touch orbit and zoom are complete; keyboard and headset controls remain.)
- [ ] Add component selection, outlines, labels, and contextual instructions. (Selection highlights and contextual HTML instructions are complete; labels/outlines remain.)
- [ ] Implement deterministic snapping and assembly tolerances.
- [ ] Implement reset, undo, and safe restart.
- [x] Save only meaningful simulation state, not cloned scene objects.

### Asset pipeline

- [ ] Audit licensing and ownership of every existing model, especially the Mercedes-Benz model.
- [ ] Define glTF naming rules for parts, tools, pivots, colliders, and interaction metadata.
- [ ] Create a Blender export checklist.
- [ ] Add automated glTF validation.
- [ ] Use Meshopt or Draco compression where appropriate.
- [ ] Convert textures to KTX2 and set texture-size limits.
- [ ] Generate thumbnails and asset manifests automatically.
- [ ] Define performance budgets for download size, memory, polygons, materials, draw calls, and frame rate.
- [ ] Test assets on the lowest supported school device, not only developer computers.

### First meaningful simulation

- [ ] Create an orientation/tutorial scene.
- [x] Implement guided mode with highlighted next action.
- [ ] Implement independent assessment mode without step-by-step answers.
- [x] Add hazards, incorrect actions, consequences, and corrective feedback.
- [ ] Add randomized but equivalent fault cases.
- [ ] Record step-level events to the backend with offline buffering. (Ordered online event recording is complete; offline buffering remains.)
- [ ] Implement pause, resume, reconnect, and safe submission. (Pause/resume and validated submission are complete; reconnect/offline synchronization remains.)
- [ ] Validate procedure accuracy with a qualified technical instructor.
- [ ] Validate scoring and tolerances with multiple instructors.

**Phase 5 exit criteria:** the first lesson teaches and assesses a real procedure, produces repeatable results, and runs within the agreed performance budget.

---

## Phase 6 — Offline-first and school operations (P1)

- [ ] Make the React application installable as a PWA.
- [ ] Cache the application shell safely.
- [ ] Let instructors pre-download selected lessons and assets.
- [ ] Store active attempts locally in IndexedDB.
- [ ] Queue learning events while offline and synchronize idempotently.
- [ ] Show clear online, offline, pending-sync, and failed-sync states.
- [ ] Resolve conflicts without losing the original event history.
- [ ] Add asset version and integrity checks.
- [ ] Test interrupted downloads and low-bandwidth recovery.
- [ ] Design a school-local content cache/edge-server option.
- [ ] Add a simple device inventory with last seen, application version, installed lessons, and available storage.
- [ ] Document charging, cleaning, storage, Wi-Fi, updates, and support procedures.

**Phase 6 exit criteria:** a downloaded lesson can be completed during an internet outage and synchronizes safely when connectivity returns.

---

## Phase 7 — WebXR and immersive mode (P1)

- [ ] Add WebXR capability detection without hiding the desktop experience.
- [ ] Add a deliberate “Enter VR” action and clean session exit.
- [ ] Use the WebXR animation loop and headset-provided camera.
- [ ] Add left- and right-controller input.
- [ ] Add ray, direct-grab, and two-handed interaction patterns as required.
- [ ] Add hand tracking only where it improves the procedure.
- [ ] Add floor reference, safe boundaries, recentering, and seated mode.
- [ ] Add spatial audio cues without making audio the only way to understand a warning.
- [ ] Add reduced motion, teleportation, snap turning, and comfort settings where movement is necessary.
- [ ] Add an instructor-visible mirrored view.
- [ ] Record headset/device compatibility separately from learner identity where possible.
- [ ] Test on at least two supported standalone headset models before claiming broad compatibility.
- [ ] Establish short-session, break, sanitation, opt-out, and incident procedures for school pilots.
- [ ] Do not add eye tracking, biometric analytics, or voice recording without a privacy impact assessment and explicit legal basis.

**Phase 7 exit criteria:** the same lesson works in desktop and immersive modes, remains assessable, and passes documented comfort and safety checks.

---

## Phase 8 — Communication and support (P1)

- [ ] Replace the global chat concept with scoped instructor/class support.
- [ ] Require authentication and class membership for every room.
- [ ] Use `wss://` in production.
- [ ] Add message identity, timestamps, persistence, length limits, and rate limits.
- [ ] Add reporting, moderation, blocking, and audit tools before enabling learner-to-learner messaging.
- [ ] Prefer instructor announcements and structured help requests before real-time social chat.
- [ ] Build searchable help content for controls, troubleshooting, safety, and offline use.
- [ ] Add a support request workflow with diagnostic information that excludes unnecessary personal data.

---

## Phase 9 — Quality, privacy, and production readiness (P0 before launch)

### Automated quality

- [ ] Require backend unit, API, permission, and migration tests in CI.
- [ ] Require frontend unit, accessibility, and end-to-end tests in CI.
- [ ] Add WebSocket tests if communication is enabled.
- [ ] Add visual regression tests for important screens.
- [ ] Add automated dependency and secret scanning.
- [ ] Add static asset and glTF validation.
- [ ] Add database migration checks.
- [ ] Add performance budgets to CI where practical.
- [ ] Maintain a small physical-device/headset release checklist.

### Privacy and safeguarding

- [ ] Determine the platform data controller and processors.
- [ ] Appoint or involve the required Data Protection Officer.
- [ ] Register processing activities as required under Rwanda's data-protection law.
- [ ] Document the legal basis and purpose for each personal-data field.
- [ ] Obtain appropriate parental-responsibility consent for learners under 16 where required.
- [ ] Add consent withdrawal, data access, correction, export, and deletion processes.
- [ ] Define retention periods for accounts, attempts, logs, messages, and support records.
- [ ] Encrypt data in transit and at rest.
- [ ] Document and authorize any cross-border storage or subprocessors.
- [ ] Complete a privacy impact assessment before collecting headset biometrics, voice, gaze, or body-tracking records.
- [ ] Complete a safeguarding review before enabling social or multi-user VR.

### Production operations

- [ ] Choose a hosting region and managed PostgreSQL provider consistent with data obligations.
- [ ] Configure staging and production environments.
- [ ] Add automated deployments with approval gates.
- [ ] Add structured logs, error monitoring, uptime checks, and tracing.
- [ ] Define service-level objectives for the pilot.
- [ ] Configure object-storage lifecycle, backups, and restore drills.
- [ ] Add a rollback procedure for application and content releases.
- [ ] Add security headers, CSP, HSTS, secure cookies, and trusted-origin configuration.
- [ ] Run Django deployment checks and an independent security review before handling real learner data.

**Phase 9 exit criteria:** the platform can be monitored, restored, secured, and legally operated with real learners.

---

## Phase 10 — Pilot and evidence (P1)

- [ ] Select two pilot schools and document infrastructure readiness.
- [ ] Train instructors before learner onboarding.
- [ ] Establish a support contact and hardware custodian at each school.
- [ ] Obtain school, instructor, learner, and parental approvals as applicable.
- [ ] Record a baseline knowledge assessment.
- [ ] Record a baseline physical-skill task using the same competency rubric.
- [ ] Run the simulation in a blended lesson, not as a standalone entertainment session.
- [ ] Measure completion, safety errors, hints, retries, time, and competency mastery.
- [ ] Repeat the knowledge and physical-skill assessment after training.
- [ ] Run a delayed retention assessment after 4–6 weeks.
- [ ] Track discomfort, accessibility barriers, hardware failures, connectivity, and instructor workload.
- [ ] Compare outcomes with an appropriate conventional-learning group where feasible.
- [ ] Measure cost per learner and cost per demonstrated competency.
- [ ] Conduct structured learner and instructor interviews.
- [ ] Publish an internal pilot report with limitations and go/no-go criteria.
- [ ] Improve the first module before building the next trade module.

---

## First three development sprints

### Sprint 1 — Secure and runnable foundation

- [ ] Complete credential rotation and secure settings.
- [ ] Write the MVP product brief and choose the first competency module.
- [x] Scaffold React/TypeScript/Vite in `frontend/`.
- [x] Add Docker Compose with Django, React, PostgreSQL, and Redis.
- [x] Begin the Django 5.2 LTS upgrade.
- [x] Establish lint, test, and build commands in CI.

### Sprint 2 — Authentication and application shell

- [x] Complete PostgreSQL migration.
- [x] Implement `/api/v1/auth/` endpoints with CSRF-safe sessions.
- [x] Add school memberships and roles.
- [x] Build the React application shell, login, logout, and current-user handling.
- [x] Add API schema generation and typed client generation.
- [x] Add seeded instructor and learner accounts.

### Sprint 3 — First vertical learning slice

- [x] Add course, lesson, competency, assignment, and attempt models.
- [x] Build learner assignment list and lesson overview.
- [x] Rebuild the 3D viewer using package-managed Three.js.
- [ ] Load one optimized model from `/api/v1/`.
- [x] Record one guided procedure step and persist the attempt. (Seven ordered steps, incorrect actions, resume state, completion and scoring are implemented.)
- [x] Display that result in a minimal instructor view.

At the end of Sprint 3, the system should demonstrate the complete architecture through one thin but real learning workflow.

---

## Explicitly postponed until the core works

- [ ] Native Unity/Godot application.
- [ ] Advanced multiplayer VR.
- [ ] AI tutor or automated high-stakes grading.
- [ ] Eye tracking or emotion inference.
- [ ] Blockchain credentials.
- [ ] Marketplace for third-party simulations.
- [ ] Microservices or Kubernetes.
- [ ] Large content library before one module proves physical-skill transfer.

## Definition of done for every task

A task is not complete until:

- [ ] Acceptance behaviour is documented.
- [ ] Code has appropriate automated tests.
- [ ] Permissions and privacy implications are reviewed.
- [ ] Loading, empty, error, offline, and unauthorized states are handled where relevant.
- [ ] User-facing text is ready for localization.
- [ ] The change is documented.
- [ ] CI passes.
- [ ] The feature is verified on its lowest supported device.
