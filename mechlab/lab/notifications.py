"""Outbound email that never turns a delivery problem into a failed request."""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("opedu.email")


CONSOLE_BACKEND = "django.core.mail.backends.console.EmailBackend"


def email_is_configured() -> bool:
    """False when messages only reach the server log, so nobody actually receives them."""

    return settings.EMAIL_BACKEND != CONSOLE_BACKEND


def send_email_safely(subject: str, message: str, recipients: list[str]) -> bool:
    """Send one message, returning whether it was handed to a real mail server.

    Callers decide what the person sees when it fails; the reason is logged without the body,
    which can contain invitation or password-reset links. With no mail server configured the
    message is not sent at all and the answer is False, so the interface never claims that an
    email went out.
    """

    if not email_is_configured():
        logger.warning("Email not sent, no mail server is configured: %s", subject)
        return False
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, recipients)
    except Exception as error:  # noqa: BLE001 - any transport failure is reported the same way
        logger.error("Email delivery failed: %s (%s)", subject, type(error).__name__)
        return False
    return True
