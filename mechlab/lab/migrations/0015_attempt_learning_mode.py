from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("lab", "0014_scenario_governance")]

    operations = [
        migrations.AddField(
            model_name="attempt",
            name="learning_mode",
            field=models.CharField(
                choices=[
                    ("guided", "Guided practice"),
                    ("independent", "Independent assessment"),
                ],
                default="guided",
                max_length=16,
            ),
        )
    ]
