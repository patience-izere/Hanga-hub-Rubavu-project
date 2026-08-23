import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from lab.learning_serializers import AttemptEventInputSerializer
from lab.models import Attempt


class Command(BaseCommand):
    help = "Check the versioned event JSON contract against API serializer choices."

    def handle(self, *args, **options):
        path = Path(__file__).resolve().parents[2] / "schemas" / "attempt-event-v1.json"
        schema = json.loads(path.read_text(encoding="utf-8"))
        properties = schema.get("properties", {})
        schema_events = set(properties.get("eventType", {}).get("enum", []))
        serializer = AttemptEventInputSerializer()
        api_events = set(serializer.fields["eventType"].choices)
        schema_renderers = set(properties.get("rendererMode", {}).get("enum", []))
        model_renderers = {value for value, _ in Attempt.RendererMode.choices}
        findings = []
        if schema_events != api_events:
            findings.append(
                f"eventType mismatch: schema-only={schema_events - api_events}; "
                f"API-only={api_events - schema_events}"
            )
        if schema_renderers != model_renderers:
            findings.append(
                f"rendererMode mismatch: schema-only={schema_renderers - model_renderers}; "
                f"model-only={model_renderers - schema_renderers}"
            )
        if properties.get("schemaVersion", {}).get("const") != 1:
            findings.append("schemaVersion must remain 1 until a compatibility migration exists")
        required = set(schema.get("required", []))
        if not {"eventId", "eventType", "rendererMode", "occurredAt", "payload"}.issubset(required):
            findings.append("event schema is missing required envelope fields")
        if findings:
            raise CommandError("; ".join(findings))
        self.stdout.write(
            self.style.SUCCESS(
                f"Event contract v1 matches {len(api_events)} event types and "
                f"{len(model_renderers)} renderers."
            )
        )
