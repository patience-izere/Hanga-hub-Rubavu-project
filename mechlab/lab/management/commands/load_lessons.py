from django.core.management import call_command
from django.core.management.base import BaseCommand

from lab.demo_content import BUILTIN_COURSE_DETAILS
from lab.models import Course


class Command(BaseCommand):
    help = (
        "Add OPedu's built-in lessons (automotive, electrical installation, workshop safety) to the "
        "open class, once. Creates no accounts. Safe to run on every deploy: after the first run "
        "the courses belong to their editors, so nothing is overwritten. --force reloads them."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Reload the built-in lessons even if they exist, overwriting edits to them.",
        )

    def handle(self, *args, **options):
        existing = Course.objects.filter(slug__in=BUILTIN_COURSE_DETAILS)
        if existing.exists() and not options["force"]:
            filled = self._fill_missing_details(existing)
            self.stdout.write(
                "Built-in lessons are already loaded; nothing changed"
                + (f" except catalogue details for {filled} course(s)." if filled else ".")
            )
            return
        call_command("seed_demo", content_only=True, stdout=self.stdout)
        self._fill_missing_details(Course.objects.filter(slug__in=BUILTIN_COURSE_DETAILS))

    @staticmethod
    def _fill_missing_details(courses):
        """Catalogue details for built-in courses that have none yet (never edited)."""

        filled = 0
        for course in courses:
            if course.summary:
                continue
            for field, value in BUILTIN_COURSE_DETAILS[course.slug].items():
                setattr(course, field, value)
            course.save()
            filled += 1
        return filled
