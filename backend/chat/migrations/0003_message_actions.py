from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0002_message_hidden_for"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="is_deleted_for_everyone",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="is_forwarded",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="starred_by",
            field=models.ManyToManyField(
                blank=True,
                related_name="starred_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
