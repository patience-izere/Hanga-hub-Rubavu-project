import base64
import json
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from lab.models import XApiDelivery
from lab.xapi_validation import validate_xapi_statement


class Command(BaseCommand):
    help = "Deliver queued xAPI 1.0.3 statements to an institutionally approved LRS."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        if not settings.LRS_ENDPOINT:
            self.stdout.write("LRS delivery is disabled; OPEDU_LRS_ENDPOINT is not configured.")
            return
        if not settings.LRS_ENDPOINT.startswith("https://"):
            raise CommandError("OPEDU_LRS_ENDPOINT must use HTTPS.")

        deliveries = XApiDelivery.objects.filter(
            status__in=[XApiDelivery.Status.PENDING, XApiDelivery.Status.FAILED],
            next_attempt_at__lte=timezone.now(),
        )[: max(1, options["limit"])]
        delivered = 0
        for delivery in deliveries:
            errors = validate_xapi_statement(delivery.statement)
            if errors:
                self._fail(delivery, "; ".join(errors), dead_letter=True)
                continue
            try:
                self._send(delivery)
            except (HTTPError, URLError, TimeoutError, OSError) as error:
                self._fail(delivery, str(error))
                continue
            delivery.status = XApiDelivery.Status.DELIVERED
            delivery.delivery_attempts += 1
            delivery.delivered_at = timezone.now()
            delivery.last_error = ""
            delivery.save(
                update_fields=[
                    "status",
                    "delivery_attempts",
                    "delivered_at",
                    "last_error",
                    "updated_at",
                ]
            )
            delivered += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Delivered {delivered} xAPI statement(s); reviewed {len(deliveries)}."
            )
        )

    def _send(self, delivery):
        query = urlencode({"statementId": str(delivery.statement_id)})
        request = Request(
            f"{settings.LRS_ENDPOINT.rstrip('/')}/statements?{query}",
            data=json.dumps(delivery.statement, separators=(",", ":")).encode("utf-8"),
            method="PUT",
            headers={
                "Content-Type": "application/json",
                "X-Experience-API-Version": "1.0.3",
            },
        )
        if settings.LRS_KEY or settings.LRS_SECRET:
            token = base64.b64encode(f"{settings.LRS_KEY}:{settings.LRS_SECRET}".encode()).decode(
                "ascii"
            )
            request.add_header("Authorization", f"Basic {token}")
        with urlopen(request, timeout=15) as response:  # noqa: S310
            if response.status not in {200, 204}:
                raise URLError(f"Unexpected LRS response {response.status}")

    def _fail(self, delivery, message, *, dead_letter=False):
        delivery.delivery_attempts += 1
        exhausted = delivery.delivery_attempts >= settings.LRS_MAX_DELIVERY_ATTEMPTS
        delivery.status = (
            XApiDelivery.Status.DEAD_LETTER
            if dead_letter or exhausted
            else XApiDelivery.Status.FAILED
        )
        delivery.last_error = message[:2000]
        delivery.next_attempt_at = timezone.now() + timedelta(
            minutes=min(1440, 2**delivery.delivery_attempts)
        )
        delivery.save(
            update_fields=[
                "status",
                "delivery_attempts",
                "last_error",
                "next_attempt_at",
                "updated_at",
            ]
        )
