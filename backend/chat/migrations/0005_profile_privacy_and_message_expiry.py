from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0004_conversation_preferences"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="bio",
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name="profile",
            name="read_receipts",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="profile",
            name="group_add_policy",
            field=models.CharField(
                choices=[
                    ("everyone", "Everyone"),
                    ("my_contacts", "My contacts"),
                    ("accepted_only", "My accepted contacts only"),
                ],
                default="everyone",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="default_message_timer",
            field=models.CharField(
                choices=[
                    ("off", "Off"),
                    ("24h", "24 hours"),
                    ("7d", "7 days"),
                    ("90d", "90 days"),
                ],
                default="off",
                max_length=3,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="last_seen_visibility",
            field=models.CharField(
                choices=[
                    ("everyone", "Everyone"),
                    ("my_contacts", "My contacts"),
                    ("accepted_only", "My accepted contacts only"),
                    ("nobody", "Nobody"),
                ],
                default="everyone",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="bio_visibility",
            field=models.CharField(
                choices=[
                    ("everyone", "Everyone"),
                    ("my_contacts", "My contacts"),
                    ("accepted_only", "My accepted contacts only"),
                    ("nobody", "Nobody"),
                ],
                default="everyone",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="profile_photo_visibility",
            field=models.CharField(
                choices=[
                    ("everyone", "Everyone"),
                    ("my_contacts", "My contacts"),
                    ("accepted_only", "My accepted contacts only"),
                    ("nobody", "Nobody"),
                ],
                default="everyone",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="theme",
            field=models.CharField(
                choices=[("light", "Light"), ("dark", "Dark")],
                default="light",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="app_language",
            field=models.CharField(
                choices=[("en", "English"), ("hi", "Hindi")],
                default="en",
                max_length=5,
            ),
        ),
        migrations.AddField(
            model_name="message",
            name="expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
