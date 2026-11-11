from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Publish OPedu's built-in lessons (automotive, electrical installation, workshop safety) "
        "into the open class. Creates no accounts; safe to run on every deploy."
    )

    def handle(self, *args, **options):
        call_command("seed_demo", content_only=True, stdout=self.stdout)
