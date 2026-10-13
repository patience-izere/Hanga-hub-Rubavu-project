"""Outbound email that never turns a delivery problem into a failed request."""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("opedu.email")


def send_email_safely(subject: str, message: str, recipients: list[str]) -> bool:
    """Send one message, returning whether the mail server accepted it.

    Callers decide what the person sees when it fails; the reason is logged without the body,
    which can contain invitation or password-reset links.
    """

    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, recipients)
    except Exception as error:  # noqa: BLE001 - any transport failure is reported the same way
        logger.error("Email delivery failed: %s (%s)", subject, type(error).__name__)
        return False
    return True
