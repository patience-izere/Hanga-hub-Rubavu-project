#!/bin/sh
# Pulls the new images, migrates the database, restarts the stack and waits for it to report
# healthy, then publishes the site on the shared proxy. Run on the server:
#
#   IMAGE_TAG=<git sha> sh /opt/opedu/deploy.sh
#
# The deploy workflow runs it after CI passes on main. Without IMAGE_TAG it deploys :latest;
# with an older sha it rolls back the code (the database stays at the newest migration).
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env in $(pwd): copy .env.example to .env and fill it in." >&2
  exit 1
fi

docker compose pull web backend scheduler
docker compose up -d --wait db redis
# Before the new code serves traffic.
docker compose run --rm --no-deps backend python manage.py migrate --noinput
# The built-in lessons, kept in step with the code. Creates no accounts.
docker compose run --rm --no-deps backend python manage.py load_lessons
docker compose up -d --remove-orphans --wait --wait-timeout 240

# Publish on the shared HTTPS proxy once the app is healthy, but only when the domain already
# points here: otherwise Caddy would keep failing to get a certificate and hit Let's Encrypt's
# rate limits for the whole server.
EDGE_DIR=/opt/edge
DOMAIN="$(sed -n 's/^DOMAIN=//p' .env | tail -n 1 | tr -d "\"'")"
if [ -z "$DOMAIN" ]; then
  echo "Set DOMAIN in .env." >&2
  exit 1
fi
if [ ! -d "$EDGE_DIR/sites" ]; then
  echo "warning: $EDGE_DIR/sites not found; the site is not published over HTTPS." >&2
else
  SERVER_IPS="$(hostname -I 2>/dev/null || true) $(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  # Ask public DNS first: the server's own resolver caches a "no such name" answer for up to
  # an hour, so a record added just before deploying would look missing.
  DOMAIN_IP="$(curl -fsS --max-time 10 "https://dns.google/resolve?name=$DOMAIN&type=A" 2>/dev/null \
    | python3 -c 'import json, sys; print(next((a["data"] for a in json.load(sys.stdin).get("Answer", []) if a.get("type") == 1), ""))' 2>/dev/null || true)"
  if [ -z "$DOMAIN_IP" ]; then
    DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')"
  fi
  if [ -n "$DOMAIN_IP" ] && echo " $SERVER_IPS " | grep -q " $DOMAIN_IP "; then
    sed "s/{\$DOMAIN}/$DOMAIN/g" site.caddy > "$EDGE_DIR/sites/opedu.caddy.tmp"
    mv "$EDGE_DIR/sites/opedu.caddy.tmp" "$EDGE_DIR/sites/opedu.caddy"
    docker compose -f "$EDGE_DIR/docker-compose.yml" exec -T caddy \
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    echo "Published https://$DOMAIN"
  else
    echo "warning: $DOMAIN does not resolve to this server yet (got '${DOMAIN_IP:-nothing}')." >&2
    echo "         The app is running but not published. Add the DNS A record and deploy again." >&2
  fi
fi

# Keep a week of OPedu images for quick rollbacks; the registry has the rest.
docker image prune --all --force \
  --filter "label=org.opencontainers.image.source=https://github.com/patience-izere/Hanga-hub-Rubavu-project" \
  --filter "until=168h"
