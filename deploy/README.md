# Deploying OPedu

OPedu runs on the shared VPS in `/opt/opedu`, next to other, unrelated projects. Its own
containers (`opedu-web`, `opedu-backend`, `opedu-scheduler`, `opedu-db`, `opedu-redis`) are
published at `https://opedu.izere.work` by the server's shared Caddy proxy in `/opt/edge`.

`.github/workflows/deploy.yml` builds the images, pushes them to GitHub Container Registry and
runs `deploy.sh` on the server after CI passes on `main`.

## One-time server setup (done on 2026-11-11)

- `/opt/opedu`, owned by `deploy`, holds `docker-compose.yml`, `deploy.sh`, `site.caddy` and
  `.env` (mode 600; secrets generated on the server).
- The `opedu` database and Redis run in their own containers: `docker compose up -d db redis`.

## Deploy key

The workflow connects as `deploy` with an SSH key kept only in GitHub secrets.

1. Add the public key on the server, as root:

   ```sh
   echo 'no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA… opedu-github-actions' \
     >> /home/deploy/.ssh/authorized_keys
   ```

2. Add the repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `OPEDU_SSH_HOST` | the server's IP address |
   | `OPEDU_SSH_USER` | `deploy` |
   | `OPEDU_SSH_KEY` | the whole private key file, including the `-----BEGIN…` and `-----END…` lines |
   | `OPEDU_SSH_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 <server IP>` |

   Copy the private key with `cat opedu_deploy` (or `xclip -selection clipboard < opedu_deploy`)
   rather than through an editor, so its line breaks survive.

The workflow prints the key's fingerprint; it must match
`ssh-keygen -lf /home/deploy/.ssh/authorized_keys` on the server.

## What each deploy does

1. Pulls the images for the commit and starts the database and Redis.
2. Runs the migrations.
3. Runs `manage.py load_lessons`: the built-in lessons (automotive, electrical installation,
   workshop safety), kept in step with the code. It creates no accounts.
4. Starts the stack, waits for it to be healthy, and publishes the site on the shared proxy once
   the domain resolves to the server.

## After the first deploy

- Sign in as the platform administrator and open **Platform › Schools** to add the first school
  (tick "Make me an administrator"), then invite its staff from **School › Invitations**.
- To send email, fill the `DJANGO_EMAIL_*` values in `/opt/opedu/.env` and redeploy. Until then
  the app shows each invitation link for you to share, and tells people that password-reset
  emails cannot be sent.

## By hand

```sh
cd /opt/opedu
IMAGE_TAG=<full commit sha> sh deploy.sh        # deploy or roll back
docker compose logs -f backend                   # logs
docker compose exec backend python manage.py createsuperuser
```

Rolling back moves the code only; the database stays at the newest migration.
