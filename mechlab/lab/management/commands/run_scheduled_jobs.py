import logging
import time

from django.core.management import call_command
from django.core.management.base import BaseCommand

logger = logging.getLogger("opedu.scheduler")

JOBS = (
    ("deliver_xapi", {"limit": 500}),
    ("purge_expired_research", {}),
)


class Command(BaseCommand):
    help = (
        "Run recurring jobs (xAPI delivery and research retention) once, or forever at an "
        "interval. One failing job never stops the others."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=int,
            default=0,
            help="Seconds between runs. 0 runs every job once and exits.",
        )

    def handle(self, *args, **options):
        interval = options["interval"]
        while True:
            for name, job_options in JOBS:
                try:
                    call_command(name, stdout=self.stdout, **job_options)
                except Exception:  # noqa: BLE001 - report and keep the schedule running
                    logger.exception("Scheduled job %s failed", name)
            if interval <= 0:
                return
            time.sleep(interval)
