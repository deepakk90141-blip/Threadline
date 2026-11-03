from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone
from datetime import timedelta
import uuid


def profile_image_path(instance, filename):
    return f"profile_images/{instance.user.id}/{filename}"


def group_image_path(instance, filename):
    return f"group_images/{instance.id}/{filename}"


def message_expiration(profile, created_at=None):
    timer = profile.default_message_timer
    if timer == "off":
        return None
    duration = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "90d": timedelta(days=90),
    }[timer]
    return (created_at or timezone.now()) + duration


class Profile(models.Model):
    """Extra, chat-specific info attached to Django's built-in User."""

    PRIVACY_CHOICES = [
        ("everyone", "Everyone"),
        ("my_contacts", "My contacts"),
        ("accepted_only", "My accepted contacts only"),
        ("nobody", "Nobody"),
    ]
    MESSAGE_TIMER_CHOICES = [
        ("off", "Off"),
        ("24h", "24 hours"),
        ("7d", "7 days"),
        ("90d", "90 days"),
    ]
    GROUP_ADD_CHOICES = [
        ("everyone", "Everyone"),
        ("my_contacts", "My contacts"),
        ("accepted_only", "My accepted contacts only"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    full_name = models.CharField(max_length=150, blank=True)
    bio = models.CharField(max_length=300, blank=True)
    mobile_number = models.CharField(max_length=20, blank=True)
    profile_image = models.ImageField(upload_to=profile_image_path, blank=True, null=True)
    read_receipts = models.BooleanField(default=True)
    group_add_policy = models.CharField(max_length=20, choices=GROUP_ADD_CHOICES, default="everyone")
    default_message_timer = models.CharField(
        max_length=3, choices=MESSAGE_TIMER_CHOICES, default="off"
    )
    last_seen_visibility = models.CharField(
        max_length=20, choices=PRIVACY_CHOICES, default="everyone"
    )
    bio_visibility = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    profile_photo_visibility = models.CharField(
        max_length=20, choices=PRIVACY_CHOICES, default="everyone"
    )
    theme = models.CharField(max_length=10, choices=[("light", "Light"), ("dark", "Dark")], default="light")
    CHAT_BACKGROUND_THEME_CHOICES = [
        ("default", "Default"),
        ("black", "Black"),
        ("gray", "Gray"),
        ("silver", "Silver"),
        ("white", "White"),
        ("purple", "Purple"),
        ("violet", "Violet"),
        ("lavender", "Lavender"),
        ("pink", "Pink"),
        ("rose", "Rose"),
        ("red", "Red"),
        ("coral", "Coral"),
        ("orange", "Orange"),
        ("amber", "Amber"),
        ("yellow", "Yellow"),
        ("lime", "Lime"),
        ("green", "Green"),
        ("mint", "Mint"),
        ("teal", "Teal"),
        ("cyan", "Cyan"),
        ("sky", "Sky"),
        ("blue", "Blue"),
        ("navy", "Navy"),
        ("sand", "Sand"),
    ]
    default_chat_theme = models.CharField(
        max_length=10,
        choices=CHAT_BACKGROUND_THEME_CHOICES,
        default="default",
    )
    app_language = models.CharField(
        max_length=5, choices=[("en", "English"), ("hi", "Hindi")], default="en"
    )
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.user.username


class Conversation(models.Model):
    """A private conversation or a multi-user group conversation."""

    participants = models.ManyToManyField(User, related_name="conversations")
    is_group = models.BooleanField(default=False)
    group_name = models.CharField(max_length=100, blank=True)
    group_bio = models.CharField(max_length=300, blank=True)
    group_image = models.ImageField(upload_to=group_image_path, blank=True, null=True)
    group_admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="administered_group_conversations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def other_participant(self, user):
        return self.participants.exclude(id=user.id).first()

    def __str__(self):
        names = ", ".join(u.username for u in self.participants.all())
        return f"Conversation({names})"


class CallSession(models.Model):
    call_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="call_sessions"
    )
    initiator = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="initiated_calls"
    )
    participants = models.ManyToManyField(User, related_name="call_sessions", blank=True)
    media_type = models.CharField(
        max_length=5,
        choices=[("audio", "Audio"), ("video", "Video")],
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(blank=True, null=True)


class ConversationPreference(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="user_preferences"
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conversation_preferences")
    is_deleted = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    is_muted = models.BooleanField(default=False)
    is_favorite = models.BooleanField(default=False)
    is_unread = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"],
                name="unique_conversation_preference_per_user",
            )
        ]


class UserBlock(models.Model):
    blocker = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_users")
    blocked = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_by_users")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["blocker", "blocked"], name="unique_user_block"),
        ]


class Message(models.Model):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    MESSAGE_TYPE_CHOICES = [
        (TEXT, "Text"),
        (IMAGE, "Image"),
        (FILE, "File"),
    ]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="replies",
    )
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_messages")
    read_by = models.ManyToManyField(User, blank=True, related_name="read_group_messages")
    message = models.TextField(max_length=5000, blank=True)
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPE_CHOICES, default=TEXT)
    attachment = models.FileField(upload_to="attachments/", blank=True, null=True)
    is_delivered = models.BooleanField(default=False)
    is_read = models.BooleanField(default=False)
    is_deleted_for_everyone = models.BooleanField(default=False)
    is_forwarded = models.BooleanField(default=False)
    hidden_for = models.ManyToManyField(User, blank=True, related_name="hidden_messages")
    starred_by = models.ManyToManyField(User, blank=True, related_name="starred_messages")
    expires_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender} -> {self.receiver}: {self.message[:30]}"


def get_profile(user):
    """Return the user's Profile, creating it if it somehow doesn't exist
    (e.g. users created before the signal was installed)."""
    try:
        return user.profile
    except Profile.DoesNotExist:
        profile, _ = Profile.objects.get_or_create(user=user)
        user.profile = profile
        return profile
