"""Small, deterministic xAPI 1.0.3 statement boundary validator."""

import uuid
from urllib.parse import urlparse

from django.utils.dateparse import parse_datetime


def _absolute_iri(value):
    return isinstance(value, str) and urlparse(value).scheme in {"http", "https"}


def validate_xapi_statement(statement):
    errors = []
    try:
        uuid.UUID(str(statement.get("id")))
    except (AttributeError, TypeError, ValueError):
        errors.append("id must be a UUID")
    actor = statement.get("actor")
    if not isinstance(actor, dict) or not isinstance(actor.get("mbox_sha1sum"), str):
        errors.append("actor requires a pseudonymous mbox_sha1sum IFI")
    elif len(actor["mbox_sha1sum"]) != 40:
        errors.append("actor mbox_sha1sum must be 40 hexadecimal characters")
    verb = statement.get("verb")
    if not isinstance(verb, dict) or not _absolute_iri(verb.get("id")):
        errors.append("verb.id must be an absolute IRI")
    activity = statement.get("object")
    if (
        not isinstance(activity, dict)
        or activity.get("objectType") != "Activity"
        or not _absolute_iri(activity.get("id"))
    ):
        errors.append("object must be an Activity with an absolute IRI")
    timestamp = statement.get("timestamp")
    if not isinstance(timestamp, str) or parse_datetime(timestamp) is None:
        errors.append("timestamp must be an ISO 8601 date-time")
    if statement.get("version") != "1.0.3":
        errors.append("version must be 1.0.3")
    return errors
