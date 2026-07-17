"""Safe PostgreSQL backup, verification, restore, and retention helpers."""

from __future__ import annotations

import argparse
import os
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


@dataclass(frozen=True)
class Connection:
    database: str
    host: str
    password: str
    port: int
    sslmode: str | None
    user: str


def connection_from_url(database_url: str) -> Connection:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DATABASE_URL must use postgres:// or postgresql://.")
    database = unquote(parsed.path.lstrip("/"))
    if not all([parsed.hostname, parsed.username, database]):
        raise ValueError("DATABASE_URL must include host, user, and database name.")
    query = parse_qs(parsed.query)
    return Connection(
        database=database,
        host=parsed.hostname,
        password=unquote(parsed.password or ""),
        port=parsed.port or 5432,
        sslmode=query.get("sslmode", [None])[0],
        user=unquote(parsed.username),
    )


def postgres_environment(connection: Connection) -> dict[str, str]:
    environment = os.environ.copy()
    environment["PGPASSWORD"] = connection.password
    if connection.sslmode:
        environment["PGSSLMODE"] = connection.sslmode
    return environment


def connection_arguments(connection: Connection) -> list[str]:
    return [
        "--host",
        connection.host,
        "--port",
        str(connection.port),
        "--username",
        connection.user,
        "--dbname",
        connection.database,
    ]


def run(command: list[str], connection: Connection) -> None:
    subprocess.run(command, env=postgres_environment(connection), check=True)


def backup(connection: Connection, output: Path | None) -> Path:
    destination = output or Path("backups") / (
        f"opedu-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.dump"
    )
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "pg_dump",
            *connection_arguments(connection),
            "--format=custom",
            "--no-owner",
            "--no-privileges",
            "--file",
            str(destination),
        ],
        connection,
    )
    return destination


def verify(archive: Path) -> None:
    subprocess.run(["pg_restore", "--list", str(archive.resolve())], check=True)


def restore(connection: Connection, archive: Path, confirmation: str) -> None:
    if confirmation != connection.database:
        raise ValueError("Restore confirmation must exactly match the target database name.")
    archive = archive.resolve()
    if not archive.is_file():
        raise FileNotFoundError(f"Backup archive does not exist: {archive}")
    run(
        [
            "pg_restore",
            *connection_arguments(connection),
            "--clean",
            "--if-exists",
            "--exit-on-error",
            "--no-owner",
            "--no-privileges",
            str(archive),
        ],
        connection,
    )


def prune(directory: Path, keep_days: int, confirmed: bool) -> list[Path]:
    if not confirmed:
        raise ValueError("Pruning requires --confirm-prune.")
    if keep_days < 1:
        raise ValueError("--keep-days must be at least 1.")
    directory = directory.resolve()
    cutoff = datetime.now(UTC) - timedelta(days=keep_days)
    removed = []
    for archive in directory.glob("opedu-*.dump"):
        modified = datetime.fromtimestamp(archive.stat().st_mtime, tz=UTC)
        if modified < cutoff:
            archive.unlink()
            removed.append(archive)
    return removed


def parser() -> argparse.ArgumentParser:
    command_parser = argparse.ArgumentParser(description=__doc__)
    command_parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="PostgreSQL connection URL; defaults to DATABASE_URL.",
    )
    subcommands = command_parser.add_subparsers(dest="command", required=True)

    backup_parser = subcommands.add_parser("backup")
    backup_parser.add_argument("--output", type=Path)

    verify_parser = subcommands.add_parser("verify")
    verify_parser.add_argument("archive", type=Path)

    restore_parser = subcommands.add_parser("restore")
    restore_parser.add_argument("archive", type=Path)
    restore_parser.add_argument("--confirm-database", required=True)

    prune_parser = subcommands.add_parser("prune")
    prune_parser.add_argument("--directory", type=Path, default=Path("backups"))
    prune_parser.add_argument("--keep-days", type=int, default=30)
    prune_parser.add_argument("--confirm-prune", action="store_true")
    return command_parser


def main() -> None:
    arguments = parser().parse_args()
    if arguments.command == "verify":
        verify(arguments.archive)
        return
    if arguments.command == "prune":
        for removed in prune(arguments.directory, arguments.keep_days, arguments.confirm_prune):
            print(f"Removed {removed}")
        return
    if not arguments.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")
    connection = connection_from_url(arguments.database_url)
    if arguments.command == "backup":
        print(backup(connection, arguments.output))
    elif arguments.command == "restore":
        restore(connection, arguments.archive, arguments.confirm_database)


if __name__ == "__main__":
    main()
