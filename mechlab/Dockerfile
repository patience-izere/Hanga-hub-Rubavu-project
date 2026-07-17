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

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "mechlab.asgi:application"]
