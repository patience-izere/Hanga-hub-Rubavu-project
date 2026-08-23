from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from lab.audit import record_audit_event
from lab.models import ResearchConsentReceipt, ResearchSurveyResponse


class Command(BaseCommand):
    help = "Delete expired pseudonymous research responses and retain an expiry receipt."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report expired consent receipts without deleting responses.",
        )

    def handle(self, *args, **options):
        expired = list(
            ResearchConsentReceipt.objects.filter(
                status=ResearchConsentReceipt.Status.ACTIVE,
                expires_at__lte=timezone.now(),
            ).select_related("school")
        )
        if options["dry_run"]:
            self.stdout.write(f"{len(expired)} research consent receipt(s) are expired.")
            return

        deleted_responses = 0
        with transaction.atomic():
            for receipt in expired:
                deleted, _ = ResearchSurveyResponse.objects.filter(
                    school=receipt.school,
                    participant_code=receipt.participant_code,
                    consent_version=receipt.consent_version,
                    scenario_version=receipt.scenario_version,
                ).delete()
                deleted_responses += deleted
                receipt.status = ResearchConsentReceipt.Status.EXPIRED
                receipt.save(update_fields=["status"])
                record_audit_event(
                    event_type="research.responses_expired",
                    school=receipt.school,
                    target=receipt,
                    payload={
                        "consentVersion": receipt.consent_version,
                        "scenarioVersion": receipt.scenario_version,
                        "deletedResponses": deleted,
                    },
                )
        self.stdout.write(
            self.style.SUCCESS(
                f"Expired {len(expired)} consent receipt(s); deleted {deleted_responses} "
                "research response(s)."
            )
        )
