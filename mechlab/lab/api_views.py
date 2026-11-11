from __future__ import annotations

import json
import logging
import uuid

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
from django.core.validators import validate_email
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from . import throttling
from .audit import record_audit_event
from .models import School
from .notifications import email_is_configured, send_email_safely

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
        user.school_memberships.filter(is_active=True, school__is_active=True)
        .order_by("role")
        .values_list("role", flat=True)
        .distinct()
    )
    if user.is_superuser:
        roles.insert(0, "platform_admin")
    profile = getattr(user, "learner_profile", None)
    # Research tools appear only while a study is running: for a platform administrator, when any
    # school takes part; for everyone else, when their own school does.
    if user.is_superuser:
        research = School.objects.filter(is_active=True, research_enabled=True).exists()
    else:
        research = user.school_memberships.filter(
            is_active=True, school__is_active=True, school__research_enabled=True
        ).exists()
    return {
        "id": user.pk,
        "email": user.email,
        "username": user.username,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "organization": membership.school.name if membership else "",
        "isStaff": user.is_staff,
        "roles": roles,
        # Collected at invitation time; the interface uses it as the initial locale so a learner
        # who chose Kinyarwanda does not have to switch on every device.
        "preferredLanguage": getattr(profile, "preferred_language", ""),
        "usesPin": bool(getattr(profile, "uses_pin", False)),
        # Optional parts of the product this person's organisation has switched on.
        "features": {"research": research, "email": email_is_configured()},
    }


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
    # Being signed out is a normal answer to "who am I?", not an error: a 401 here filled every
    # visitor's console with a failed request and hid real failures.
    if not request.user.is_authenticated:
        return JsonResponse({"user": None})
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

    address = throttling.client_ip(request)
    window = settings.LOGIN_LOCKOUT_SECONDS
    if (
        throttling.count("login", address, identifier) >= settings.LOGIN_FAILURE_LIMIT
        or throttling.count("login-account", identifier) >= settings.LOGIN_ACCOUNT_FAILURE_LIMIT
        or throttling.count("login-ip", address) >= settings.LOGIN_IP_FAILURE_LIMIT
    ):
        return throttling.too_many(
            "Too many unsuccessful sign-in attempts. Try again later.",
            code="login_locked",
            retry_after=window,
        )

    user_model = get_user_model()
    email_user = user_model.objects.filter(email__iexact=identifier).first()
    username = email_user.get_username() if email_user is not None else identifier
    # A six-digit PIN is far easier to guess than a password, so accounts that use one lock for
    # longer after fewer wrong tries. An instructor can issue a new PIN, which lifts the lock.
    pin_account = user_model.objects.filter(
        username__iexact=username, learner_profile__uses_pin=True
    ).first()
    if pin_account is not None:
        username = pin_account.get_username()
        if throttling.count("login-pin", username) >= settings.PIN_LOGIN_FAILURE_LIMIT:
            return throttling.too_many(
                "Too many wrong PINs. Ask your instructor for a new PIN, or try again later.",
                code="login_locked",
                retry_after=settings.PIN_LOCKOUT_SECONDS,
            )
    user = authenticate(request, username=username, password=password)
    if user is None:
        if pin_account is not None:
            throttling.record("login-pin", username, window=settings.PIN_LOCKOUT_SECONDS)
        disabled_user = email_user or user_model.objects.filter(username=identifier).first()
        if (
            disabled_user is not None
            and not disabled_user.is_active
            and disabled_user.check_password(password)
        ):
            return JsonResponse(
                {"detail": "This account is disabled.", "code": "account_disabled"},
                status=403,
            )
        throttling.record("login", address, identifier, window=window)
        throttling.record("login-account", identifier, window=window)
        throttling.record("login-ip", address, window=window)
        return JsonResponse({"detail": "That sign-in name or password is not right."}, status=401)
    if not user.is_active:
        return JsonResponse({"detail": "This account is disabled."}, status=403)
    memberships = user.school_memberships.all()
    if (
        not user.is_staff
        and memberships.exists()
        and not memberships.filter(is_active=True, school__is_active=True).exists()
    ):
        throttling.clear("login", address, identifier)
        return JsonResponse(
            {
                "detail": "Your school access is suspended. Contact your school administrator.",
                "code": "membership_suspended",
            },
            status=403,
        )

    login(request, user)
    throttling.clear("login", address, identifier)
    throttling.clear("login-pin", user.get_username())
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
    user_key = str(request.user.pk)
    window = settings.LOGIN_LOCKOUT_SECONDS
    # Someone at an unlocked workshop computer must not be able to guess the password.
    if throttling.count("password-change", user_key) >= settings.LOGIN_FAILURE_LIMIT:
        return throttling.too_many(
            "Too many incorrect current passwords. Try again later.",
            code="password_change_locked",
            retry_after=window,
        )
    if not request.user.check_password(current_password):
        throttling.record("password-change", user_key, window=window)
        return JsonResponse({"detail": "The current password is incorrect."}, status=400)
    throttling.clear("password-change", user_key)
    profile = getattr(request.user, "learner_profile", None)
    if profile is not None and profile.uses_pin and new_password.isdigit():
        # A learner who was issued a PIN may choose another PIN; anything else must be a full
        # password, after which the account is treated as a password account.
        from .access import pin_problem

        problem = pin_problem(new_password)
        errors = [problem] if problem else []
    else:
        errors = _password_errors(new_password, user=request.user)
        if not errors and profile is not None and profile.uses_pin:
            profile.uses_pin = False
            profile.save(update_fields=["uses_pin", "updated_at"])
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
    window = settings.PASSWORD_RESET_WINDOW_SECONDS
    address = throttling.client_ip(request)
    if throttling.record("reset-ip", address, window=window) > settings.PASSWORD_RESET_IP_LIMIT:
        return throttling.too_many(
            "Too many reset requests from this network. Try again later.",
            code="reset_throttled",
            retry_after=window,
        )
    # Past a few messages an hour the request is still answered the same way, but nothing is
    # sent, so the endpoint cannot be used to flood someone's inbox.
    within_email_limit = (
        throttling.record("reset-email", email, window=window)
        <= settings.PASSWORD_RESET_EMAIL_LIMIT
    )
    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email, is_active=True).first()
    if user and within_email_limit:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        # The answer is identical whether or not delivery works, so the endpoint never reveals
        # which addresses have accounts.
        send_email_safely(
            "Reset your OPedu password",
            f"Use this link to reset your OPedu password: {reset_url}",
            [user.email],
        )
    if not email_is_configured():
        # Said the same way for every address, so it still reveals nothing about accounts.
        return JsonResponse(
            {
                "detail": "Email is not set up on OPedu yet, so no reset link can be sent. Ask "
                "your instructor or school administrator to reset your password.",
                "emailConfigured": False,
            }
        )
    return JsonResponse(
        {
            "detail": "If an active account matches that email, password reset instructions "
            "were sent.",
            "emailConfigured": True,
        }
    )


@require_http_methods(["GET", "POST"])
def password_reset_confirm(request: HttpRequest, uidb64: str, token: str) -> JsonResponse:
    """GET checks the link when the page opens; POST sets the new password."""

    invalid = JsonResponse(
        {"detail": "This reset link is invalid or expired.", "code": "reset_link_invalid"},
        status=400,
    )
    try:
        body = _json_body(request) if request.method == "POST" else {}
        user_id = urlsafe_base64_decode(uidb64).decode()
        user = get_user_model().objects.get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, get_user_model().DoesNotExist):
        return invalid
    if not default_token_generator.check_token(user, token):
        return invalid
    if request.method == "GET":
        return JsonResponse({"valid": True})
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


@require_POST
def profile(request: HttpRequest) -> JsonResponse:
    """Change your own name and email. A new email needs the current password."""

    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    try:
        body = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    user = request.user
    first_name = " ".join(str(body.get("firstName", user.first_name) or "").split())
    last_name = " ".join(str(body.get("lastName", user.last_name) or "").split())
    email = str(body.get("email", user.email) or "").strip().casefold()
    errors: dict[str, list[str]] = {}
    if len(first_name) > 150:
        errors["firstName"] = ["Use at most 150 characters."]
    if len(last_name) > 150:
        errors["lastName"] = ["Use at most 150 characters."]
    email_changed = email != (user.email or "").casefold()
    if email_changed:
        if email:
            try:
                validate_email(email)
            except ValidationError:
                errors["email"] = ["Enter a valid email address."]
            else:
                if (
                    get_user_model()
                    .objects.filter(email__iexact=email)
                    .exclude(pk=user.pk)
                    .exists()
                ):
                    errors["email"] = ["Another account already uses this email address."]
        if not user.has_usable_password() or not user.check_password(
            str(body.get("currentPassword") or "")
        ):
            errors["currentPassword"] = ["Enter your current password to change your email."]
    if errors:
        first = next(iter(errors.values()))[0]
        return JsonResponse({"detail": first, **errors}, status=400)
    changed = []
    if first_name != user.first_name:
        user.first_name = first_name
        changed.append("first_name")
    if last_name != user.last_name:
        user.last_name = last_name
        changed.append("last_name")
    if email_changed:
        user.email = email
        changed.append("email")
    if changed:
        user.save(update_fields=changed)
        record_audit_event(
            event_type="account.profile_updated",
            actor=user,
            school=_primary_school(user),
            target=user,
            payload={"fields": changed},
        )
    return JsonResponse({"user": _user_payload(request)})


@require_POST
def preferences(request: HttpRequest) -> JsonResponse:
    """Save the interface language, so it follows a learner to a shared or new device."""

    from .models import LearnerProfile

    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    try:
        body = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    language = str(body.get("preferredLanguage") or "")
    if language not in LearnerProfile.Language.values:
        return JsonResponse(
            {"preferredLanguage": [f"Choose one of: {', '.join(LearnerProfile.Language.values)}."]},
            status=400,
        )
    profile, _ = LearnerProfile.objects.get_or_create(user=request.user)
    if profile.preferred_language != language:
        profile.preferred_language = language
        profile.save(update_fields=["preferred_language", "updated_at"])
    return JsonResponse({"user": _user_payload(request)})
