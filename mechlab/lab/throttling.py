"""Rate limits for sign-in and account recovery, keyed by the real client address.

Behind nginx every request arrives from the proxy's address, so a lockout keyed on REMOTE_ADDR
would lock a whole school out at once. ``OPEDU_TRUSTED_PROXY_COUNT`` says how many proxies sit
in front of Django; the client is the address that many hops back in X-Forwarded-For.
"""

from hashlib import sha256

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse


def client_ip(request) -> str:
    proxies = getattr(settings, "OPEDU_TRUSTED_PROXY_COUNT", 0)
    if proxies > 0:
        forwarded = [
            part.strip()
            for part in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")
            if part.strip()
        ]
        # Each trusted proxy appends the address it received the request from, so the entry
        # `proxies` places from the end is the one no client can forge.
        if len(forwarded) >= proxies:
            return forwarded[-proxies]
    return request.META.get("REMOTE_ADDR", "unknown")


def _key(scope: str, *parts: str) -> str:
    digest = sha256(":".join(part.casefold() for part in parts).encode()).hexdigest()
    return f"opedu:limit:{scope}:{digest}"


def count(scope: str, *parts: str) -> int:
    return cache.get(_key(scope, *parts), 0)


def record(scope: str, *parts: str, window: int) -> int:
    """Add one to a counter that expires ``window`` seconds after it was started."""

    key = _key(scope, *parts)
    if cache.add(key, 1, timeout=window):
        return 1
    try:
        return cache.incr(key)
    except ValueError:  # expired between add() and incr()
        cache.set(key, 1, timeout=window)
        return 1


def clear(scope: str, *parts: str) -> None:
    cache.delete(_key(scope, *parts))


def too_many(detail: str, *, code: str, retry_after: int) -> JsonResponse:
    response = JsonResponse({"detail": detail, "code": code, "retryAfter": retry_after}, status=429)
    response["Retry-After"] = str(retry_after)
    return response


class AdminLoginThrottleMiddleware:
    """Limit sign-in attempts on the Django admin form, which bypasses the API's lockout."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "POST" and request.path.rstrip("/").endswith("/admin/login"):
            window = settings.LOGIN_LOCKOUT_SECONDS
            if count("admin-login", client_ip(request)) >= settings.LOGIN_IP_FAILURE_LIMIT:
                return too_many(
                    "Too many sign-in attempts. Try again later.",
                    code="login_locked",
                    retry_after=window,
                )
            response = self.get_response(request)
            # A successful admin sign-in redirects; a failed one re-renders the form (200).
            if response.status_code == 200:
                record("admin-login", client_ip(request), window=window)
            return response
        return self.get_response(request)
