"""Ways into the platform that do not depend on an email inbox.

Many technical learners share a phone or have no working email address. A class can therefore
issue sign-in names with numeric PINs, or show a join code on the board. Staff accounts keep full
passwords; a PIN only ever protects a learner's own practice records, and PIN accounts get a
stricter lockout than password accounts to make guessing impractical.
"""

from __future__ import annotations

import re
import secrets
from datetime import timedelta
from hashlib import sha256

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from .audit import record_audit_event
from .models import (
    Cohort,
    School,
    SchoolInvitation,
    SchoolMembership,
    SchoolRegistrationRequest,
)
from .notifications import send_email_safely

PIN_LENGTH = 6
# Letters and digits that are hard to confuse when read off a board or a printed slip.
JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
JOIN_CODE_LENGTH = 6
OPEN_SCHOOL_CODE = "open-class"

_PHONE = re.compile(r"^\+?\d{9,15}$")
_SIGN_IN_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,59}$")


def pin_problem(pin: str) -> str | None:
    """Why a PIN is unacceptable, or ``None`` when it is fine."""

    if not isinstance(pin, str) or not pin.isdigit() or len(pin) != PIN_LENGTH:
        return f"Choose a PIN of exactly {PIN_LENGTH} digits."
    if len(set(pin)) <= 2:
        return "That PIN is too easy to guess. Use more different digits."
    digits = [int(character) for character in pin]
    steps = {(later - earlier) % 10 for earlier, later in zip(digits, digits[1:], strict=False)}
    if steps in ({1}, {9}):
        return "That PIN is too easy to guess. Avoid a run such as 123456."
    return None


def generate_pin() -> str:
    while True:
        pin = "".join(str(secrets.randbelow(10)) for _ in range(PIN_LENGTH))
        if pin_problem(pin) is None:
            return pin


def generate_join_code() -> str:
    while True:
        code = "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))
        if not Cohort.objects.filter(join_code=code).exists():
            return code


def normalize_join_code(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def normalize_phone(value: str) -> str | None:
    """A phone number usable as a sign-in name, or ``None`` when it is not one."""

    compact = re.sub(r"[\s().-]", "", str(value or ""))
    return compact.lstrip("+") if _PHONE.match(compact) else None


def split_name(full_name: str) -> tuple[str, str]:
    parts = str(full_name or "").split()
    if not parts:
        return "", ""
    return parts[0][:150], " ".join(parts[1:])[:150]


def sign_in_name_taken(name: str) -> bool:
    user_model = get_user_model()
    return (
        user_model.objects.filter(username__iexact=name).exists()
        or user_model.objects.filter(email__iexact=name).exists()
    )


def unique_sign_in_name(first_name: str, last_name: str) -> str:
    """A short, typeable sign-in name such as ``aline.uwase`` or ``aline.uwase2``."""

    base = ".".join(part for part in (slugify(first_name), slugify(last_name)) if part)
    base = (base or "learner")[:40].strip(".-") or "learner"
    if len(base) < 3:
        base = f"{base}.learner"
    candidate, suffix = base, 2
    while sign_in_name_taken(candidate):
        candidate = f"{base}{suffix}"
        suffix += 1
    return candidate


def valid_sign_in_name(value: str) -> bool:
    return bool(_SIGN_IN_NAME.match(value))


def open_school() -> School:
    """The organisation that people who sign up on their own belong to."""

    school = School.objects.filter(is_open=True).order_by("pk").first()
    if school is None:
        school, _ = School.objects.get_or_create(
            code=OPEN_SCHOOL_CODE,
            defaults={"name": "OPedu Open Class", "is_open": True, "kind": School.Kind.HUB},
        )
        if not school.is_open:
            school.is_open = True
            school.save(update_fields=["is_open"])
    return school


def _unique_school_code(name: str) -> str:
    base = slugify(name)[:50] or "organisation"
    code, suffix = base, 2
    while School.objects.filter(code=code).exists():
        code = f"{base}-{suffix}"
        suffix += 1
    return code


def approve_school_registration(request_record: SchoolRegistrationRequest, reviewer):
    """Create the organisation and invite its contact as the first administrator.

    Returns ``(school, accept_url, email_sent)``. The invitation works like any other: a single
    use link that expires after seven days, so nobody receives a password by email.
    """

    if request_record.status != SchoolRegistrationRequest.Status.PENDING:
        raise ValueError("Only a pending registration can be approved.")
    raw_token = secrets.token_urlsafe(32)
    with transaction.atomic():
        school = School.objects.create(
            name=request_record.organisation_name,
            code=_unique_school_code(request_record.organisation_name),
            kind=request_record.kind,
        )
        invitation = SchoolInvitation.objects.create(
            school=school,
            email=request_record.email.casefold(),
            role=SchoolMembership.Role.ADMIN,
            token_hash=sha256(raw_token.encode()).hexdigest(),
            created_by=reviewer,
            expires_at=timezone.now() + timedelta(days=7),
        )
        request_record.status = SchoolRegistrationRequest.Status.APPROVED
        request_record.school = school
        request_record.reviewed_by = reviewer
        request_record.reviewed_at = timezone.now()
        request_record.save(update_fields=["status", "school", "reviewed_by", "reviewed_at"])
        record_audit_event(
            event_type="school.registration_approved",
            actor=reviewer,
            school=school,
            target=invitation,
            payload={"registrationId": request_record.pk, "kind": school.kind},
        )
    accept_url = f"{settings.FRONTEND_URL}/join/{raw_token}"
    email_sent = send_email_safely(
        f"{school.name} can now use OPedu",
        f"Hello {request_record.contact_name},\n\n"
        f"Your request to use OPedu for {school.name} was approved. Open this link within seven "
        f"days to create the administrator account: {accept_url}\n",
        [request_record.email],
    )
    return school, accept_url, email_sent
