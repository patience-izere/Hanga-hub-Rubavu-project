from __future__ import annotations

import hashlib
import hmac

from django.conf import settings


def research_participant_code(school_id: int, user_id: int) -> str:
    """Return the stable school-scoped pseudonym used across all pilot evidence."""

    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"opedu-research-v1:{school_id}:{user_id}".encode(),
        hashlib.sha256,
    ).hexdigest()[:24]
