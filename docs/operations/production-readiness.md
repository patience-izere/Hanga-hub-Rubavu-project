# Production readiness and controlled release

Status: engineering controls implemented; institutional acceptance and production-provider
configuration remain release gates.

## Release sequence

1. Freeze a reviewed lesson, scenario, grading policy, asset package, marker value, consent form,
   supported-device list, and database migration set.
2. Run `python tools/project.py check` and retain its logs. CI repeats migration drift, OpenAPI,
   Python/TypeScript formatting, unit/API, frontend, asset-manifest, and bundle-budget checks.
3. Build immutable backend and frontend images. Scan them and record digests in the release note.
4. Back up PostgreSQL and object storage, verify the backup catalogue, and rehearse restoration in
   an isolated database.
5. Deploy to staging, migrate once, seed no demonstration users, and execute learner, instructor,
   content-author, school-isolation, offline, camera-denial, fallback, and restore smoke tests.
6. Obtain named curriculum, safety, privacy, accessibility, security, operations, and school owner
   approvals before promotion. Roll out to one controlled cohort before wider replication.

## Required production configuration

- `DJANGO_DEBUG=false`, a rotated secret key, explicit allowed hosts and trusted HTTPS origins.
- PostgreSQL and Redis URLs from the secret manager; no SQLite or in-memory channels.
- TLS at the trusted proxy, HSTS, secure cookies, CSP and camera Permissions Policy retained.
- Private object storage with allow-listed MIME types, immutable version paths, checksums, malware
  scanning, short-lived delivery authorization, and lifecycle/backup policies.
- Central collection of privacy-safe JSON request logs and `X-Request-ID`; alerting on 5xx rate,
  latency, readiness, failed synchronization, storage, database capacity, and backup age.
- Maximum request and in-memory upload sizes explicitly set for the provider.

Set `OPEDU_REQUIRE_OBJECT_STORAGE=true` and configure the `OPEDU_OBJECT_STORAGE_*` variables for a
private S3-compatible bucket. The adapter uses signature-v4, private objects, server-side
encryption, non-overwriting keys, and five-minute signed URLs by default. Prefer workload identity;
static access keys belong only in the deployment secret manager. Production endpoints are rejected
unless they use HTTPS. The provider must separately enforce public-access blocking, malware scan,
lifecycle, versioning, replication/backup, access logging, and restore tests.

The API exposes `/api/v1/health/live/` for process health and `/api/v1/health/ready/` for database
and cache readiness. The React container exposes `/health/live`; Compose waits for backend readiness
before starting it. Production monitoring must call these endpoints externally and alert on failure.

The React error boundary and global error listeners submit an authenticated, CSRF-protected signal
to `/api/v1/monitoring/client-errors/`. The payload is intentionally limited to a random event ID,
an enumerated error kind, the path without query parameters, and the immutable release. Error text,
stack traces, learner identity, lesson answers, and device fingerprints are never accepted. Forward
the `opedu.client_errors`, `opedu.requests`, and `opedu.health` loggers to the institution's approved
log and alerting service; alert on new browser-error releases, sustained 5xx rates, slow requests,
and failed readiness probes.

## Rollback and recovery

Application rollback uses the previous signed image while PostgreSQL migrations must remain
forward-compatible. Published lessons, scenarios, grading policies, asset packages, attempts, and
events are immutable; content rollback therefore clones a previously published scenario into a
new version and reassigns future learners. Never rewrite evidence already used for a result.

For a failed migration or data incident: stop new writes, preserve logs and request IDs, take a
forensic backup, notify the incident owners, restore only into an isolated environment, and follow
the approved recovery decision. The PostgreSQL commands and retention baseline are in
`docs/operations/postgresql.md`.

## Known release blockers

No repository change can supply qualified instructor approval, ethics/privacy/safeguarding
approval, a production-licensed and measured glTF training-rig package, physical device/thermal
testing, or consented pilot outcomes. Until those artifacts are recorded, this build is a WebAR
pilot candidate—not a production-qualified or globally validated platform.

The 73 outstanding items, responsible external owners, closure artifacts, and dependent repository
follow-up are enumerated in `external-release-gates.md`.

The optional external LRS also remains disabled until an institution approves its vocabulary,
endpoint, credentials, retention, and operational owner. The queued delivery and dead-letter
software boundary is described in `docs/architecture/webar-completion-boundaries.md`.
