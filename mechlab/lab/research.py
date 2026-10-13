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


def research_attempt_code(school_id: int, attempt_id: int) -> str:
    """A research-only attempt key that cannot be joined to the named operational export."""

    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"opedu-research-attempt-v1:{school_id}:{attempt_id}".encode(),
        hashlib.sha256,
    ).hexdigest()[:16]


def consenting_participant_codes(school_ids) -> set[tuple[int, str]]:
    """(school, participant code) pairs with active, unexpired research consent."""

    from django.utils import timezone

    from .models import ResearchConsentReceipt

    return set(
        ResearchConsentReceipt.objects.filter(
            school_id__in=school_ids,
            status=ResearchConsentReceipt.Status.ACTIVE,
            expires_at__gt=timezone.now(),
        ).values_list("school_id", "participant_code")
    )
