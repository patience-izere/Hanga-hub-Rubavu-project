from datetime import UTC, datetime, timedelta
from os import utime

import pytest

from tools.postgres import connection_from_url, prune


def test_connection_from_url_decodes_credentials_and_sslmode():
    connection = connection_from_url(
        "postgresql://opedu%40school:secret%2Fvalue@db.example:5433/opedu%20pilot?sslmode=require"
    )
    assert connection.user == "opedu@school"
    assert connection.password == "secret/value"
    assert connection.host == "db.example"
    assert connection.port == 5433
    assert connection.database == "opedu pilot"
    assert connection.sslmode == "require"


def test_connection_from_url_rejects_non_postgresql_urls():
    with pytest.raises(ValueError, match="postgres"):
        connection_from_url("sqlite:///db.sqlite3")


def test_prune_requires_confirmation_and_only_removes_expired_named_archives(tmp_path):
    expired = tmp_path / "opedu-20200101T000000Z.dump"
    current = tmp_path / "opedu-current.dump"
    unrelated = tmp_path / "other.dump"
    for archive in [expired, current, unrelated]:
        archive.write_bytes(b"test archive")
    old_timestamp = (datetime.now(UTC) - timedelta(days=60)).timestamp()
    utime(expired, (old_timestamp, old_timestamp))
    utime(unrelated, (old_timestamp, old_timestamp))

    with pytest.raises(ValueError, match="confirm-prune"):
        prune(tmp_path, keep_days=30, confirmed=False)
    removed = prune(tmp_path, keep_days=30, confirmed=True)

    assert removed == [expired]
    assert not expired.exists()
    assert current.exists()
    assert unrelated.exists()
