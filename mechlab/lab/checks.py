from django.core.checks import Tags, Warning, register

from .notifications import email_is_configured


@register(Tags.security, deploy=True)
def email_is_delivered(app_configs, **kwargs):
    """Invitations and password resets must reach people, and their links must not be logged."""

    if not email_is_configured():
        return [
            Warning(
                "No mail server is configured, so invitations, password resets and review "
                "notices are not sent; the interface asks people to share links themselves.",
                hint="Set DJANGO_EMAIL_HOST (and credentials) or DJANGO_EMAIL_BACKEND.",
                id="opedu.W001",
            )
        ]
    return []
