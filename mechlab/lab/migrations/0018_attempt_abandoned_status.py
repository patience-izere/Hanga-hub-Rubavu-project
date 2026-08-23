from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("lab", "0017_asset_file_governance")]

    operations = [
        migrations.AlterField(
            model_name="attempt",
            name="status",
            field=models.CharField(
                choices=[
                    ("in_progress", "In progress"),
                    ("completed", "Completed"),
                    ("requires_review", "Requires review"),
                    ("abandoned", "Abandoned"),
                ],
                default="in_progress",
                max_length=24,
            ),
        )
    ]
