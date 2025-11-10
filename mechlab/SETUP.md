# Quick setup (development)

Follow these steps to get a local development environment running:

1. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies

```bash
pip install -r requirements.txt
```

3. (Optional) copy the example env and adjust values

```bash
cp .env.example .env
# Edit .env and set DJANGO_SECRET_KEY if desired
```

4. Run database migrations and create a superuser

```bash
python manage.py migrate
python manage.py createsuperuser
```

5. Run the development server (channels in-memory layer works with runserver)

```bash
python manage.py runserver
# or to use an ASGI server with websockets: daphne -p 8000 mechlab.asgi:application
```

6. Run Django checks

```bash
python manage.py check
```

Notes:
- For production you should set DJANGO_DEBUG=False and configure a production
  `CHANNEL_LAYERS` (Redis) and a proper WSGI/ASGI server.
