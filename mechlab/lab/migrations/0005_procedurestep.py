from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("lab", "0004_learning_domain"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProcedureStep",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("order", models.PositiveSmallIntegerField()),
                ("code", models.SlugField(max_length=80)),
                ("title", models.CharField(max_length=180)),
                ("instruction", models.TextField()),
                ("action_code", models.SlugField(max_length=100)),
                ("feedback", models.TextField()),
                ("safety_critical", models.BooleanField(default=False)),
                ("points", models.PositiveSmallIntegerField(default=10)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("lesson", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="procedure_steps", to="lab.lesson")),
            ],
            options={"ordering": ["order"]},
        ),
        migrations.AddConstraint(
            model_name="procedurestep",
            constraint=models.UniqueConstraint(fields=("lesson", "order"), name="unique_lesson_procedure_order"),
        ),
        migrations.AddConstraint(
            model_name="procedurestep",
            constraint=models.UniqueConstraint(fields=("lesson", "code"), name="unique_lesson_procedure_code"),
        ),
    ]
