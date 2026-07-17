# Local development

From the repository root, install backend development dependencies and frontend dependencies:

```powershell
cd mechlab
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock
cd ..\frontend
npm ci
```

Run root tasks with the activated virtual environment or its Python executable:

```powershell
python tools/project.py seed
python tools/project.py check
```

Run the containerized development stack with `python tools/project.py dev`.

After changing `requirements.in` or `requirements-dev.in`, regenerate hashed locks from `mechlab/`:

```powershell
python -m piptools compile --allow-unsafe --strip-extras --generate-hashes --output-file requirements.lock requirements.in
python -m piptools compile --allow-unsafe --strip-extras --generate-hashes --output-file requirements-dev.lock requirements-dev.in
```

For backend-only development, run `python manage.py runserver`. To exercise the ASGI application directly, run `daphne -p 8000 mechlab.asgi:application`; local settings use the in-memory Channels layer unless `REDIS_URL` is configured.
