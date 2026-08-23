from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("lab", "0016_xapi_delivery")]

    operations = [
        migrations.AddField(
            model_name="assetfile",
            name="license_spdx",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="assetfile",
            name="source_attribution",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="assetfile",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
