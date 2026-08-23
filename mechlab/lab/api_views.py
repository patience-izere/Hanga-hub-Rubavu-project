from __future__ import annotations

import json
import logging
import uuid
from hashlib import sha256

from django.conf import settings
from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .audit import record_audit_event

health_logger = logging.getLogger("opedu.health")
client_error_logger = logging.getLogger("opedu.client_errors")

CLIENT_ERROR_KINDS = {"component_error", "unhandled_error", "unhandled_rejection"}


def _json_body(request: HttpRequest) -> dict:
    try:
        value = json.loads(request.body or b"{}")
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Request body must be valid JSON.") from exc
    if not isinstance(value, dict):
        raise ValueError("Request body must be a JSON object.")
    return value


def _user_payload(request: HttpRequest) -> dict:
    user = request.user
    membership = (
        user.school_memberships.filter(is_active=True, school__is_active=True)
        .select_related("school")
        .first()
    )
    roles = list(
        user.school_memberships.filter(is_active=True)
        .order_by("role")
        .values_list("role", flat=True)
        .distinct()
    )
    if user.is_superuser:
        roles.insert(0, "platform_admin")
    return {
        "id": user.pk,
        "email": user.email,
        "username": user.username,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "organization": membership.school.name if membership else "",
        "isStaff": user.is_staff,
        "roles": roles,
    }


def _login_cache_key(request: HttpRequest, identifier: str) -> str:
    address = request.META.get("REMOTE_ADDR", "unknown")
    digest = sha256(f"{address}:{identifier.casefold()}".encode()).hexdigest()
    return f"opedu:login-failures:{digest}"


def _password_errors(password: str, user=None) -> list[str]:
    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        return list(exc.messages)
    return []


def _primary_school(user):
    membership = user.school_memberships.filter(is_active=True).select_related("school").first()
    return membership.school if membership else None


@require_GET
def health_live(request: HttpRequest) -> JsonResponse:
    return JsonResponse(
        {
            "status": "ok",
            "service": "opedu-api",
            "version": settings.OPEDU_RELEASE_VERSION,
        }
    )


@require_GET
def health_ready(request: HttpRequest) -> JsonResponse:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            if cursor.fetchone() != (1,):
                raise RuntimeError("Database readiness probe returned an unexpected value.")
        cache_key = f"opedu:readiness:{uuid.uuid4()}"
        cache.set(cache_key, "ok", timeout=10)
        if cache.get(cache_key) != "ok":
            raise RuntimeError("Cache readiness probe failed.")
        cache.delete(cache_key)
    except Exception as error:
        health_logger.warning(
            "Readiness probe failed",
            extra={"error_type": type(error).__name__},
        )
        return JsonResponse(
            {
                "status": "unavailable",
                "service": "opedu-api",
                "version": settings.OPEDU_RELEASE_VERSION,
            },
            status=503,
        )
    return JsonResponse(
        {
            "status": "ok",
            "service": "opedu-api",
            "version": settings.OPEDU_RELEASE_VERSION,
        }
    )


@require_POST
def client_error(request: HttpRequest) -> JsonResponse:
    """Accept a deliberately low-detail browser error signal for central monitoring."""

    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    try:
        body = _json_body(request)
        event_id = str(uuid.UUID(str(body.get("eventId", ""))))
    except (ValueError, TypeError, AttributeError):
        return JsonResponse({"detail": "A valid eventId is required."}, status=400)

    kind = str(body.get("kind", ""))
    route = str(body.get("route", ""))
    release = str(body.get("release", ""))
    if kind not in CLIENT_ERROR_KINDS:
        return JsonResponse({"detail": "Unsupported error kind."}, status=400)
    if not route.startswith("/") or "?" in route or "#" in route or len(route) > 200:
        return JsonResponse(
            {"detail": "route must be a path without query or fragment."}, status=400
        )
    if not release or len(release) > 100:
        return JsonResponse({"detail": "release is required."}, status=400)

    client_error_logger.error(
        json.dumps(
            {
                "event": "browser_error",
                "event_id": event_id,
                "request_id": getattr(request, "request_id", ""),
                "kind": kind,
                "route": route,
                "release": release,
            },
            separators=(",", ":"),
        )
    )
    return JsonResponse({"accepted": True}, status=202)


@ensure_csrf_cookie
@require_GET
def csrf(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"detail": "CSRF cookie set."})


@require_GET
def me(request: HttpRequest) -> JsonResponse:
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    return JsonResponse({"user": _user_payload(request)})


@require_POST
def login_api(request: HttpRequest) -> JsonResponse:
    try:
        body = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    identifier = str(body.get("email") or body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not identifier or not password:
        return JsonResponse({"detail": "Email and password are required."}, status=400)

    cache_key = _login_cache_key(request, identifier)
    failures = cache.get(cache_key, 0)
    if failures >= settings.LOGIN_FAILURE_LIMIT:
        return JsonResponse(
            {
                "detail": "Too many unsuccessful sign-in attempts. Try again later.",
                "code": "login_locked",
                "retryAfter": settings.LOGIN_LOCKOUT_SECONDS,
            },
            status=429,
        )

    user_model = get_user_model()
    email_user = user_model.objects.filter(email__iexact=identifier).first()
    username = email_user.get_username() if email_user is not None else identifier
    user = authenticate(request, username=username, password=password)
    if user is None:
        cache.set(cache_key, failures + 1, timeout=settings.LOGIN_LOCKOUT_SECONDS)
        return JsonResponse({"detail": "Invalid email or password."}, status=401)
    if not user.is_active:
        return JsonResponse({"detail": "This account is disabled."}, status=403)

    login(request, user)
    cache.delete(cache_key)
    return JsonResponse({"user": _user_payload(request)})


@require_POST
def logout_api(request: HttpRequest) -> JsonResponse:
    logout(request)
    return JsonResponse({"detail": "Signed out."})


@require_POST
def password_change(request: HttpRequest) -> JsonResponse:
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    try:
        body = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    current_password = str(body.get("currentPassword") or "")
    new_password = str(body.get("newPassword") or "")
    if not request.user.check_password(current_password):
        return JsonResponse({"detail": "The current password is incorrect."}, status=400)
    errors = _password_errors(new_password, user=request.user)
    if errors:
        return JsonResponse({"detail": " ".join(errors), "errors": errors}, status=400)
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)
    record_audit_event(
        event_type="account.password_changed",
        actor=request.user,
        school=_primary_school(request.user),
        target=request.user,
    )
    return JsonResponse({"detail": "Password changed."})


@require_POST
def password_reset_request(request: HttpRequest) -> JsonResponse:
    try:
        body = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    email = str(body.get("email") or "").strip()
    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        send_mail(
            "Reset your OPedu password",
            f"Use this link to reset your OPedu password: {reset_url}",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
        )
    return JsonResponse(
        {
            "detail": "If an active account matches that email, password reset instructions were sent."
        }
    )


@require_POST
def password_reset_confirm(request: HttpRequest, uidb64: str, token: str) -> JsonResponse:
    try:
        body = _json_body(request)
        user_id = urlsafe_base64_decode(uidb64).decode()
        user = get_user_model().objects.get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, get_user_model().DoesNotExist):
        return JsonResponse({"detail": "This reset link is invalid or expired."}, status=400)
    if not default_token_generator.check_token(user, token):
        return JsonResponse({"detail": "This reset link is invalid or expired."}, status=400)
    new_password = str(body.get("newPassword") or "")
    errors = _password_errors(new_password, user=user)
    if errors:
        return JsonResponse({"detail": " ".join(errors), "errors": errors}, status=400)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    record_audit_event(
        event_type="account.password_reset",
        actor=user,
        school=_primary_school(user),
        target=user,
    )
    return JsonResponse({"detail": "Password reset complete."})
