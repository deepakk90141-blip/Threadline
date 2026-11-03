from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("chat", "0006_conversationpreference_is_favorite"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversation",
            name="is_group",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="conversation",
            name="group_name",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="message",
            name="read_by",
            field=models.ManyToManyField(
                blank=True,
                related_name="read_group_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
