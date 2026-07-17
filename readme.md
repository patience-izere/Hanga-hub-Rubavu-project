# OPedu Technical Learning Platform

OPedu is being rebuilt as a competency-based technical learning platform. React provides the learner and instructor experience, while Django exposes the application API and administration tools. PostgreSQL stores institutional and learning data, and Redis supports real-time and asynchronous work.

React now owns every public product route. Django is limited to `/api/v1/`, Django Admin, media, and compatibility redirects from former template URLs.

## Architecture

- `frontend/` — React, TypeScript, Vite, TanStack Query and React Router.
- `mechlab/` — Django 5.2 LTS, Django REST Framework and Channels.
- PostgreSQL — primary application database.
- Redis — Channels and future caching/background jobs.
- `compose.yaml` — complete local development environment.
- `TODO.md` — prioritized product and engineering backlog.

## Run with Docker

1. Copy `.env.example` to `.env` and replace the development secrets.
2. Start the platform:

   ```powershell
   docker compose up --build
   ```

3. Open the React application at `http://localhost:5173`.
4. Open Django Admin at `http://localhost:8000/admin/`.

Create an administrator in another terminal:

```powershell
docker compose exec backend python manage.py createsuperuser
```

Create the idempotent demonstration school, school administrator, learner, instructor, lesson and assignment:

```powershell
docker compose exec backend python manage.py seed_demo --password "choose-a-development-password"
```

The default demonstration emails are `admin@opedu.local`, `learner@opedu.local`, and `instructor@opedu.local`.

Sign in as the school administrator to invite instructors or learners, review pending invitations, and activate or deactivate school memberships. Invitation links expire after seven days, can be used once, and create the account and membership together.

Sign in as the learner, open **Battery Inspection and Diagnosis**, and start the attempt. The guided workshop records each action to Django, resumes from the last completed step, applies safety-aware scoring, and provides HTML controls equivalent to every 3D interaction.

Sign in as the instructor after the learner starts an attempt to review school-level completion metrics, safety flags, scores, and the ordered action timeline. Instructor access is based on active school membership rather than Django staff status.

## Run without Docker

PostgreSQL and Redis must already be available and `.env` must contain connection URLs.

Backend:

```powershell
cd mechlab
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/media` requests to Django, preserving same-origin cookie and CSRF behaviour during development.

## Quality checks

From the repository root, the cross-platform task runner can execute the complete gate:

```powershell
.\mechlab\.venv\Scripts\python.exe tools\project.py check
```

Other root tasks are `dev`, `seed`, `lint`, `format`, `test`, `build`, and `api-generate`. The generated OpenAPI schema is committed at `openapi/schema.yml`; interactive development documentation is available at `/api/v1/docs/`.

PostgreSQL backup, verification, restore, and retention commands are documented in `docs/operations/postgresql.md` and implemented by `tools/postgres.py`.

Backend:

```powershell
python manage.py check
python manage.py test
```

Frontend:

```powershell
npm run lint
npm test
npm run build
```

## Current milestone

The current vertical slice covers normalized programs, modules, cohorts and enrollment; controlled school onboarding; and the learner/instructor evidence paths. It includes assignment, lesson briefing, a resumable guided 3D battery procedure, immutable action evidence, server-side completion/scoring, learner results, school-level instructor metrics, and attempt review. The 3D route is lazy-loaded so the engine does not slow public, authentication, or dashboard pages.

The next priority is offline action buffering and an optimized glTF asset pipeline, followed by competency aggregation and instructor feedback. WebXR should be added only after the same procedure is validated with technical instructors on desktop hardware.
