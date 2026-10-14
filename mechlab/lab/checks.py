from django.conf import settings
from django.core.checks import Tags, Warning, register

CONSOLE_BACKEND = "django.core.mail.backends.console.EmailBackend"


@register(Tags.security, deploy=True)
def email_is_delivered(app_configs, **kwargs):
    """Invitations and password resets must reach people, and their links must not be logged."""

    if settings.EMAIL_BACKEND == CONSOLE_BACKEND:
        return [
            Warning(
                "Email uses the console backend, so invitation and password-reset links are "
                "written to the server log instead of being delivered.",
                hint="Set DJANGO_EMAIL_HOST (and credentials) or DJANGO_EMAIL_BACKEND.",
                id="opedu.W001",
            )
        ]
    return []
