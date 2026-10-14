FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system opedu && adduser --system --ingroup opedu opedu

COPY requirements.lock ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.lock

COPY . .
RUN chown -R opedu:opedu /app

USER opedu
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/live/', timeout=3).read()"

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "mechlab.asgi:application"]
