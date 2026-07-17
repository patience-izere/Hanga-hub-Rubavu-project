# PostgreSQL operations

## Current migration decision

The repository's ignored `mechlab/db.sqlite3` is development-only and disposable. No production SQLite database has been identified. Do not import an unknown SQLite file automatically: if a school later supplies data that must be retained, inventory and validate it before writing a one-off import into PostgreSQL.

The complete migration chain from `lab.0001_initial` through `lab.0008_curriculum_organization` was applied to a clean PostgreSQL 17 database on 2026-07-17. The full 26-test Django suite passed on that database. Migration `0008` backfills role profiles before removing the obsolete generic profile table.

An actual custom-format backup and restore drill also passed on 2026-07-17. The restored database matched the seeded source counts: 1 school, 3 memberships, 1 assignment, and 1 lesson. The disposable drill container and archive were removed after verification.

CI starts a clean PostgreSQL 17 service, applies all migrations, and runs the Django suite against PostgreSQL on every push and pull request.

## Backup

Install PostgreSQL client tools so `pg_dump` and `pg_restore` are available. Set `DATABASE_URL` without placing credentials in shell history, then run:

```powershell
python tools/postgres.py backup
python tools/postgres.py verify backups/opedu-YYYYMMDDTHHMMSSZ.dump
```

Backups use PostgreSQL's custom archive format, omit ownership and privilege statements, and should be encrypted in the approved backup store. A successful `verify` proves the archive catalogue is readable; it does not replace a restore drill.

## Restore drill

Restore into an empty, isolated database before considering an archive usable. The confirmation must exactly match the database name encoded in the target URL:

```powershell
$env:DATABASE_URL = "postgresql://user:password@host:5432/opedu_restore_drill"
python tools/postgres.py restore backups/opedu-YYYYMMDDTHHMMSSZ.dump --confirm-database opedu_restore_drill
python mechlab/manage.py check
```

After restoration, verify school, membership, assignment, attempt, event, and audit-event counts and complete one learner/instructor smoke workflow. Never run the restore command against production during a drill.

## Retention

The starting policy is 30 daily backups, 12 monthly backups, and at least one encrypted copy outside the primary hosting failure domain. This is a provisional engineering baseline; the privacy and school-retention policy must approve it before launch.

Local archives matching only `opedu-*.dump` can be pruned explicitly:

```powershell
python tools/postgres.py prune --directory backups --keep-days 30 --confirm-prune
```

Object-storage lifecycle rules should enforce production retention. Monitor backup completion, archive size, and the date of the latest successful restore drill.
