from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("lab", "0015_attempt_learning_mode")]

    operations = [
        migrations.CreateModel(
            name="XApiDelivery",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("statement_id", models.UUIDField(unique=True)),
                ("statement", models.JSONField()),
                ("status", models.CharField(choices=[("pending", "Pending"), ("delivered", "Delivered"), ("failed", "Failed"), ("dead_letter", "Dead letter")], default="pending", max_length=16)),
                ("delivery_attempts", models.PositiveSmallIntegerField(default=0)),
                ("next_attempt_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("last_error", models.TextField(blank=True)),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("attempt", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="xapi_deliveries", to="lab.attempt")),
            ],
            options={"ordering": ["next_attempt_at", "created_at"]},
        ),
        migrations.AddIndex(
            model_name="xapidelivery",
            index=models.Index(fields=["status", "next_attempt_at"], name="lab_xapidel_status_88c035_idx"),
        ),
    ]
