"""ASGI application for HTTP and authenticated WebSocket traffic."""

import os

import lab.routing
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mechlab.settings")

http_application = get_asgi_application()

from django.conf import settings  # noqa: E402 - settings are configured by get_asgi_application

if settings.SERVE_STATIC:
    from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler  # noqa: E402

    # Daphne serves no static files itself, which left Django admin unstyled in production.
    http_application = ASGIStaticFilesHandler(http_application)

application = ProtocolTypeRouter(
    {
        "http": http_application,
        "websocket": AuthMiddlewareStack(URLRouter(lab.routing.websocket_urlpatterns)),
    }
)
