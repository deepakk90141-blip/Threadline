from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0005_profile_privacy_and_message_expiry"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationpreference",
            name="is_favorite",
            field=models.BooleanField(default=False),
        ),
    ]
