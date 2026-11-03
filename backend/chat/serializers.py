from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import Conversation, ConversationPreference, Message, Profile, UserBlock, get_profile


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = [
            "full_name", "bio", "mobile_number", "profile_image", "read_receipts",
            "group_add_policy", "default_message_timer", "last_seen_visibility",
            "bio_visibility", "profile_photo_visibility", "theme", "app_language",
            "is_online", "last_seen", "created_at",
        ]
        read_only_fields = ["is_online", "last_seen", "created_at"]


class UserSerializer(serializers.ModelSerializer):
    """Public-facing representation of a user, including profile info."""

    full_name = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()
    mobile_number = serializers.SerializerMethodField()
    profile_image = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "bio",
            "mobile_number",
            "profile_image",
            "is_online",
            "last_seen",
        ]

    def get_full_name(self, obj):
        return get_profile(obj).full_name

    def _can_view(self, obj, visibility):
        request = self.context.get("request")
        if request is None or request.user.pk == obj.pk or visibility == "everyone":
            return True
        if visibility == "nobody":
            return False
        return Conversation.objects.filter(
            participants=request.user
        ).filter(participants=obj).exists()

    def get_bio(self, obj):
        profile = get_profile(obj)
        return profile.bio if self._can_view(obj, profile.bio_visibility) else ""

    def get_mobile_number(self, obj):
        return get_profile(obj).mobile_number

    def get_profile_image(self, obj):
        profile = get_profile(obj)
        if not self._can_view(obj, profile.profile_photo_visibility):
            return None
        image = profile.profile_image
        if not image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(image.url) if request else image.url

    def get_is_online(self, obj):
        profile = get_profile(obj)
        return profile.is_online if self._can_view(obj, profile.last_seen_visibility) else False

    def get_last_seen(self, obj):
        profile = get_profile(obj)
        return profile.last_seen if self._can_view(obj, profile.last_seen_visibility) else None


class ConversationParticipantSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()
    profile_image = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "bio", "profile_image", "is_online", "last_seen"]

    def get_full_name(self, obj):
        return get_profile(obj).full_name

    def _can_view(self, obj, visibility):
        request = self.context.get("request")
        if request is None or request.user.pk == obj.pk or visibility == "everyone":
            return True
        if visibility == "nobody":
            return False
        return Conversation.objects.filter(
            participants=request.user
        ).filter(participants=obj).exists()

    def get_bio(self, obj):
        profile = get_profile(obj)
        return profile.bio if self._can_view(obj, profile.bio_visibility) else ""

    def get_profile_image(self, obj):
        profile = get_profile(obj)
        if not self._can_view(obj, profile.profile_photo_visibility) or not profile.profile_image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(profile.profile_image.url) if request else profile.profile_image.url

    def get_is_online(self, obj):
        profile = get_profile(obj)
        return profile.is_online if self._can_view(obj, profile.last_seen_visibility) else False

    def get_last_seen(self, obj):
        profile = get_profile(obj)
        return profile.last_seen if self._can_view(obj, profile.last_seen_visibility) else None


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    mobile_number = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "full_name", "mobile_number"]

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def create(self, validated_data):
        full_name = validated_data.pop("full_name", "")
        mobile_number = validated_data.pop("mobile_number", "")
        password = validated_data.pop("password")

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        # Profile is auto-created by a signal; just fill in the extra fields.
        profile = get_profile(user)
        profile.full_name = full_name
        profile.mobile_number = mobile_number
        profile.save()

        return user


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    reply_preview = serializers.SerializerMethodField()
    reply_to = serializers.PrimaryKeyRelatedField(
        queryset=Message.objects.all(),
        required=False,
        allow_null=True,
    )
    is_starred = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_username",
            "receiver",
            "reply_to",
            "reply_preview",
            "message",
            "message_type",
            "attachment",
            "is_delivered",
            "is_read",
            "is_deleted_for_everyone",
            "is_forwarded",
            "is_starred",
            "expires_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "sender", "receiver", "is_delivered", "is_read", "created_at", "updated_at",
        ]

    def get_is_starred(self, obj):
        request = self.context.get("request")
        return bool(request and obj.starred_by.filter(pk=request.user.pk).exists())

    def get_reply_preview(self, obj):
        replied_message = obj.reply_to
        if replied_message is None:
            return None
        request = self.context.get("request")
        deleted = replied_message.is_deleted_for_everyone
        hidden_for_anyone = replied_message.hidden_for.exists()
        hidden_for_request = (
            request is not None
            and replied_message.hidden_for.filter(pk=request.user.pk).exists()
        )
        unavailable = hidden_for_anyone or hidden_for_request
        return {
            "id": replied_message.pk,
            "sender": replied_message.sender_id,
            "sender_username": replied_message.sender.username,
            "message": "This message was deleted"
            if deleted
            else "Message unavailable"
            if unavailable
            else replied_message.message,
            "attachment": None
            if deleted or unavailable or not replied_message.attachment
            else replied_message.attachment.url,
            "is_deleted_for_everyone": deleted,
        }

    def validate_reply_to(self, value):
        request = self.context.get("request")
        raw_conversation_id = self.initial_data.get("conversation")
        try:
            conversation_id = int(raw_conversation_id)
        except (TypeError, ValueError):
            raise serializers.ValidationError("A valid conversation is required.")
        if value.conversation_id != conversation_id:
            raise serializers.ValidationError(
                "You can only reply to a message in the same conversation."
            )
        if request and value.hidden_for.filter(pk=request.user.pk).exists():
            raise serializers.ValidationError("That message is not available.")
        return value

    def get_is_read(self, obj):
        request = self.context.get("request")
        if obj.conversation.is_group and request:
            readers = obj.read_by.exclude(pk=obj.sender_id)
            if obj.sender_id == request.user.pk:
                return readers.exists()
            return obj.read_by.filter(pk=request.user.pk).exists()
        return obj.is_read

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if (
            request
            and not instance.conversation.is_group
            and instance.sender_id == request.user.pk
            and not get_profile(instance.receiver).read_receipts
        ):
            data["is_read"] = False
        if instance.is_deleted_for_everyone:
            data["message"] = "This message was deleted"
            data["attachment"] = None
        return data

    def validate_message(self, value):
        if len(value.strip()) == 0 and not self.initial_data.get("attachment"):
            raise serializers.ValidationError("Message cannot be empty.")
        if len(value) > 5000:
            raise serializers.ValidationError("Message is too long (max 5000 characters).")
        return value


class ProfileSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = [
            "full_name", "bio", "mobile_number", "profile_image", "read_receipts",
            "group_add_policy", "default_message_timer", "last_seen_visibility",
            "bio_visibility", "profile_photo_visibility", "theme", "app_language",
            "default_chat_theme",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if instance.profile_image:
            data["profile_image"] = (
                request.build_absolute_uri(instance.profile_image.url)
                if request else instance.profile_image.url
            )
        else:
            data["profile_image"] = None
        return data


class ConversationSerializer(serializers.ModelSerializer):
    other_user = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    group_image = serializers.SerializerMethodField()
    group_admin_id = serializers.IntegerField(read_only=True, allow_null=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()
    is_archived = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    is_muted = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    is_unread = serializers.SerializerMethodField()
    is_blocked = serializers.SerializerMethodField()
    is_blocked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "is_group", "group_name", "group_bio", "group_image", "group_admin_id", "participants", "other_user", "last_message", "unread_count", "is_deleted",
            "is_archived", "is_pinned", "is_muted", "is_favorite", "is_unread", "is_blocked",
            "is_blocked_by_me", "created_at", "updated_at",
        ]

    def get_group_image(self, obj):
        if not obj.group_image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.group_image.url) if request else obj.group_image.url

    def _preference(self, obj):
        request_user = self.context["request"].user
        cache = self.context.setdefault("_conversation_preferences", {})
        key = (obj.pk, request_user.pk)
        if key not in cache:
            cache[key] = ConversationPreference.objects.filter(
                conversation=obj, user=request_user
            ).first()
        return cache[key]

    def get_is_deleted(self, obj):
        preference = self._preference(obj)
        return preference.is_deleted if preference else False

    def get_is_archived(self, obj):
        preference = self._preference(obj)
        return preference.is_archived if preference else False

    def get_is_pinned(self, obj):
        preference = self._preference(obj)
        return preference.is_pinned if preference else False

    def get_is_muted(self, obj):
        preference = self._preference(obj)
        return preference.is_muted if preference else False

    def get_is_favorite(self, obj):
        preference = self._preference(obj)
        return preference.is_favorite if preference else False

    def get_is_unread(self, obj):
        preference = self._preference(obj)
        return preference.is_unread if preference else False

    def get_is_blocked(self, obj):
        if obj.is_group:
            return False
        other = obj.other_participant(self.context["request"].user)
        return bool(
            other
            and UserBlock.objects.filter(
                Q(blocker=self.context["request"].user, blocked=other)
                | Q(blocker=other, blocked=self.context["request"].user)
            ).exists()
        )

    def get_is_blocked_by_me(self, obj):
        if obj.is_group:
            return False
        other = obj.other_participant(self.context["request"].user)
        return bool(
            other
            and UserBlock.objects.filter(blocker=self.context["request"].user, blocked=other).exists()
        )

    def get_other_user(self, obj):
        if obj.is_group:
            return None
        request_user = self.context["request"].user
        other = obj.other_participant(request_user)
        return ConversationParticipantSerializer(other, context=self.context).data if other else None

    def get_participants(self, obj):
        return ConversationParticipantSerializer(
            obj.participants.all().select_related("profile"),
            many=True,
            context=self.context,
        ).data

    def get_last_message(self, obj):
        request_user = self.context["request"].user
        last = obj.messages.exclude(hidden_for=request_user).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).order_by("-created_at").first()
        return MessageSerializer(last, context=self.context).data if last else None

    def get_unread_count(self, obj):
        request_user = self.context["request"].user
        preference = self._preference(obj)
        if obj.is_group:
            unread = obj.messages.exclude(sender=request_user).exclude(read_by=request_user)
            return max(1, unread.count()) if preference and preference.is_unread else unread.count()
        if preference and preference.is_unread:
            return max(1, obj.messages.filter(receiver=request_user, is_read=False).count())
        return obj.messages.filter(receiver=request_user, is_read=False).count()
