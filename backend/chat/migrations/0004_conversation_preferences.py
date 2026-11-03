from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def create_existing_preferences(apps, schema_editor):
    Conversation = apps.get_model("chat", "Conversation")
    ConversationPreference = apps.get_model("chat", "ConversationPreference")
    database = schema_editor.connection.alias

    for conversation in Conversation.objects.using(database).iterator():
        for user in conversation.participants.using(database).all():
            ConversationPreference.objects.using(database).get_or_create(
                conversation_id=conversation.pk,
                user_id=user.pk,
            )


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0003_message_actions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ConversationPreference",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("is_deleted", models.BooleanField(default=False)),
                ("is_archived", models.BooleanField(default=False)),
                ("is_pinned", models.BooleanField(default=False)),
                ("is_muted", models.BooleanField(default=False)),
                ("is_unread", models.BooleanField(default=False)),
                (
                    "conversation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_preferences",
                        to="chat.conversation",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="conversation_preferences",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("conversation", "user"),
                        name="unique_conversation_preference_per_user",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="UserBlock",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "blocked",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="blocked_by_users",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "blocker",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="blocked_users",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("blocker", "blocked"),
                        name="unique_user_block",
                    )
                ],
            },
        ),
        migrations.RunPython(create_existing_preferences, migrations.RunPython.noop),
    ]
