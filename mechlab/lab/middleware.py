import json
import logging
import time
import uuid

request_logger = logging.getLogger("opedu.requests")


class RequestObservabilityMiddleware:
    """Attach a correlation ID and emit privacy-safe request telemetry."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID", "")
        try:
            request_id = str(uuid.UUID(request_id))
        except (ValueError, TypeError, AttributeError):
            request_id = str(uuid.uuid4())
        request.request_id = request_id
        started = time.monotonic()
        response = self.get_response(request)
        duration_ms = round((time.monotonic() - started) * 1000, 2)
        response["X-Request-ID"] = request_id
        log_request = request_logger.error if response.status_code >= 500 else request_logger.info
        log_request(
            json.dumps(
                {
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                },
                separators=(",", ":"),
            )
        )
        return response


class SecurityHeadersMiddleware:
    """Apply a conservative browser policy while allowing camera-based WebAR."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault(
            "Content-Security-Policy",
            "; ".join(
                [
                    "default-src 'self'",
                    "base-uri 'self'",
                    "object-src 'none'",
                    "frame-ancestors 'none'",
                    "form-action 'self'",
                    "script-src 'self'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob:",
                    "font-src 'self' data:",
                    "media-src 'self' blob:",
                    "connect-src 'self'",
                    "worker-src 'self' blob:",
                    "manifest-src 'self'",
                ]
            ),
        )
        response.setdefault(
            "Permissions-Policy",
            "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
        )
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return response
