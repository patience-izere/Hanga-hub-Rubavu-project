from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("lab", "0005_procedurestep"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_type", models.CharField(max_length=100)),
                ("target_type", models.CharField(blank=True, max_length=80)),
                ("target_id", models.CharField(blank=True, max_length=80)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("occurred_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_events", to=settings.AUTH_USER_MODEL)),
                ("school", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_events", to="lab.school")),
            ],
            options={"ordering": ["-occurred_at"]},
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(fields=["event_type", "-occurred_at"], name="lab_auditev_event_t_b9ce37_idx"),
        ),
    ]
