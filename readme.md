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

The platform now stands on its own for more than one school:

- **Ways in without email.** Learners join a class with a code from the board and choose a
  six-digit PIN, or receive printed sign-in slips. Anyone can sign up to practise the open
  catalogue, visitors can try a lesson at `/demo` with no account, and schools, garages and
  hubs can ask to be set up (approved in Django Admin).
- **Practice that can go wrong safely.** Decision steps offer real options, specific wrong
  actions have consequences (a spark, a blown meter fuse, a wrong reading), and each attempt
  gets one of several equivalent fault cases. Free practice runs do not use up attempts and
  stay private to the learner.
- **One scene player for every lesson.** Lessons describe their 3D bench as data built from a
  shared prop library, so new lessons need no new code. In Camera AR the same bench stands on
  the printed marker and tilts with it.
- **Feedback and motivation.** A marked pre-lesson quiz, a step-by-step replay, streaks,
  personal bests, a skills passport, and certificates with a public check link that only claim
  what happened.
- **Class tools.** A live team challenge for the projector that ranks safety before speed.

`seed_demo` ships demonstration lessons in two trades. Automobile Technology: battery diagnosis,
jump-starting, replacing a fuse, checking charging voltage. Electrical Installation: safe
isolation and continuity testing. Plus a workshop hazard hunt for all trades. Authors build and
try practicals like these in the Module Studio without writing JSON, and the learner interface is
available in English, French and Swahili (the last two as drafts awaiting review). **Their procedures, readings and
fault cases are draft content** and must be validated by a qualified instructor against the
Rwanda TVET Board curriculum before learners are assessed with them. See
`docs/product/learner-experience.md` for the scenario format and what remains.
