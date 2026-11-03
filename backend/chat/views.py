import os

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.validators import validate_email
from django.db.models import Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Conversation,
    ConversationPreference,
    Message,
    Profile,
    UserBlock,
    get_profile,
    message_expiration,
)
from .realtime import broadcast, message_payload, publish_new_message, room_group, user_group
from .serializers import (
    ConversationSerializer,
    MessageSerializer,
    ProfileSettingsSerializer,
    RegisterSerializer,
    UserSerializer,
)


def purge_expired_messages():
    expired = list(Message.objects.filter(expires_at__lte=timezone.now()).only("id", "attachment"))
    for message in expired:
        if message.attachment:
            message.attachment.storage.delete(message.attachment.name)
        message.delete()


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user, context={"request": request}).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user, context={"request": request}).data})


class LogoutView(APIView):
    def post(self, request):
        Profile.objects.filter(user=request.user).update(is_online=False, last_seen=timezone.now())
        Token.objects.filter(user=request.user).delete()
        return Response({"detail": "Logged out."})


class CurrentUserView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)


class ProfileSettingsView(APIView):
    def get(self, request):
        return Response(
            ProfileSettingsSerializer(
                get_profile(request.user), context={"request": request}
            ).data
        )

    def patch(self, request):
        profile = get_profile(request.user)
        remove_profile_image = request.data.get("remove_profile_image") in (True, "true", "True", "1")
        serializer = ProfileSettingsSerializer(
            profile,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        old_image_name = profile.profile_image.name if profile.profile_image else None
        serializer.save()
        if remove_profile_image and profile.profile_image:
            profile.profile_image.delete(save=True)
        elif (
            old_image_name
            and profile.profile_image
            and old_image_name != profile.profile_image.name
        ):
            profile.profile_image.storage.delete(old_image_name)
        return Response(serializer.data)


class AccountSettingsView(APIView):
    def patch(self, request):
        user = request.user
        profile = get_profile(user)
        new_password = request.data.get("new_password")
        if new_password:
            current_password = request.data.get("current_password", "")
            if not user.check_password(current_password):
                return Response(
                    {"detail": "Current password is incorrect."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                validate_password(new_password, user)
            except ValidationError as error:
                return Response(
                    {"new_password": list(error.messages)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(new_password)

        username = request.data.get("username")
        if username is not None:
            username = str(username).strip()
            if not username:
                return Response(
                    {"username": ["Username cannot be empty."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if User.objects.exclude(pk=user.pk).filter(username__iexact=username).exists():
                return Response(
                    {"username": ["This username is already taken."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.username = username

        email = request.data.get("email")
        if email is not None:
            email = str(email).strip()
            if email:
                try:
                    validate_email(email)
                except ValidationError as error:
                    return Response(
                        {"email": list(error.messages)},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if email and User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
                return Response(
                    {"email": ["This email address is already in use."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.email = email

        mobile_number = request.data.get("mobile_number")
        if mobile_number is not None:
            profile.mobile_number = str(mobile_number).strip()
            profile.save(update_fields=["mobile_number"])

        if user.has_usable_password() or username is not None or email is not None or new_password:
            user.save()
        return Response(UserSerializer(user, context={"request": request}).data)

    def delete(self, request):
        password = request.data.get("password", "")
        if not request.user.check_password(password):
            return Response(
                {"detail": "Password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile = get_profile(request.user)
        if profile.profile_image:
            profile.profile_image.delete(save=False)
        messages = list(Message.objects.filter(
            Q(sender=request.user) | Q(receiver=request.user)
        ).only("id", "attachment"))
        for message in messages:
            if message.attachment:
                message.attachment.storage.delete(message.attachment.name)
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockedContactsView(generics.ListAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.filter(
            blocked_by_users__blocker=self.request.user
        ).select_related("profile")

    def delete(self, request, pk):
        block = UserBlock.objects.filter(blocker=request.user, blocked_id=pk).first()
        if block is None:
            return Response({"detail": "Blocked contact not found."}, status=status.HTTP_404_NOT_FOUND)
        other_id = block.blocked_id
        conversation_ids = list(
            Conversation.objects.filter(participants=request.user)
            .filter(participants__id=other_id)
            .values_list("id", flat=True)
        )
        block.delete()
        for conversation_id in conversation_ids:
            broadcast(user_group(other_id), {"type": "refresh", "conversation_id": conversation_id})
            broadcast(user_group(request.user.id), {"type": "refresh", "conversation_id": conversation_id})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.exclude(id=self.request.user.id).select_related("profile")


class UserSearchView(generics.ListAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()
        qs = User.objects.exclude(id=self.request.user.id).select_related("profile")
        if query:
            qs = qs.filter(
                Q(username__icontains=query)
                | Q(email__icontains=query)
                | Q(profile__full_name__icontains=query)
            )
        return qs


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------
def get_admin_managed_group(request, conversation_id):
    conversation = get_object_or_404(
        Conversation.objects.filter(is_group=True, participants=request.user),
        pk=conversation_id,
    )
    if conversation.group_admin_id != request.user.pk:
        raise PermissionDenied("Only the group admin can manage this group.")
    return conversation


class ConversationListView(generics.ListAPIView):
    serializer_class = ConversationSerializer

    def get_queryset(self):
        user = self.request.user
        preferences = ConversationPreference.objects.filter(
            conversation_id=OuterRef("pk"), user=user, is_pinned=True
        )
        queryset = Conversation.objects.filter(participants=user).annotate(
            _is_pinned=Exists(preferences)
        ).exclude(user_preferences__user=user, user_preferences__is_deleted=True)
        return queryset.order_by("-_is_pinned", "-updated_at").prefetch_related(
            "participants", "messages"
        )


class ConversationCreateView(APIView):
    """Get-or-create a private conversation between the current user and
    another user identified by `user_id`."""

    def post(self, request):
        other_user_id = request.data.get("user_id")
        if not other_user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if str(other_user_id) == str(request.user.id):
            return Response({"detail": "Cannot start a conversation with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        other_user = get_object_or_404(User, id=other_user_id)
        if UserBlock.objects.filter(
            Q(blocker=request.user, blocked=other_user)
            | Q(blocker=other_user, blocked=request.user)
        ).exists():
            return Response(
                {"detail": "This conversation is blocked."},
                status=status.HTTP_403_FORBIDDEN,
            )

        existing = (
            Conversation.objects.filter(is_group=False, participants=request.user)
            .filter(participants=other_user)
            .first()
        )
        if existing:
            preference, _ = ConversationPreference.objects.get_or_create(
                conversation=existing, user=request.user
            )
            preference.is_deleted = False
            preference.is_archived = False
            preference.is_unread = False
            preference.save(update_fields=["is_deleted", "is_archived", "is_unread"])
            serializer = ConversationSerializer(existing, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        conversation = Conversation.objects.create()
        conversation.participants.add(request.user, other_user)
        ConversationPreference.objects.get_or_create(conversation=conversation, user=request.user)
        ConversationPreference.objects.get_or_create(conversation=conversation, user=other_user)
        serializer = ConversationSerializer(conversation, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GroupConversationCreateView(APIView):
    def post(self, request):
        group_name = request.data.get("group_name")
        user_ids = request.data.get("user_ids")
        if not isinstance(group_name, str):
            return Response({"detail": "Group name must be text."}, status=status.HTTP_400_BAD_REQUEST)
        group_name = group_name.strip()
        if not group_name:
            return Response({"detail": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(group_name) > 100:
            return Response({"detail": "Group name cannot exceed 100 characters."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(user_ids, list) or not user_ids:
            return Response({"detail": "Select at least one other member."}, status=status.HTTP_400_BAD_REQUEST)
        if any(not isinstance(user_id, int) or isinstance(user_id, bool) or user_id < 1 for user_id in user_ids):
            return Response({"detail": "user_ids must contain positive integer IDs."}, status=status.HTTP_400_BAD_REQUEST)

        member_ids = set(user_ids)
        if request.user.pk in member_ids:
            member_ids.remove(request.user.pk)
        if not member_ids:
            return Response({"detail": "Select at least one other member."}, status=status.HTTP_400_BAD_REQUEST)
        members = list(User.objects.filter(pk__in=member_ids).select_related("profile"))
        if len(members) != len(member_ids):
            return Response({"detail": "One or more selected users were not found."}, status=status.HTTP_404_NOT_FOUND)

        conversation = Conversation.objects.create(
            is_group=True,
            group_name=group_name,
            group_admin=request.user,
        )
        conversation.participants.add(request.user, *members)
        ConversationPreference.objects.bulk_create(
            [ConversationPreference(conversation=conversation, user=member) for member in [request.user, *members]]
        )
        for member in members:
            broadcast(user_group(member.pk), {"type": "refresh", "conversation_id": conversation.pk})

        serializer = ConversationSerializer(conversation, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GroupMemberRemoveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, conversation_id, user_id):
        conversation = get_admin_managed_group(request, conversation_id)
        if user_id == request.user.pk:
            return Response(
                {"detail": "The group admin cannot remove themselves."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        member = get_object_or_404(conversation.participants, pk=user_id)
        conversation.participants.remove(member)
        ConversationPreference.objects.filter(conversation=conversation, user=member).delete()
        broadcast(
            room_group(conversation.pk),
            {
                "type": "group_member_removed",
                "conversation_id": conversation.pk,
                "user_id": member.pk,
            },
        )
        broadcast(user_group(member.pk), {"type": "refresh", "conversation_id": conversation.pk})
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupMemberAddView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, conversation_id):
        conversation = get_admin_managed_group(request, conversation_id)

        user_ids = request.data.get("user_ids")
        if not isinstance(user_ids, list) or not user_ids:
            return Response(
                {"detail": "Select at least one new member."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if any(
            not isinstance(user_id, int) or isinstance(user_id, bool) or user_id < 1
            for user_id in user_ids
        ):
            return Response(
                {"detail": "user_ids must contain positive integer IDs."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        member_ids = set(user_ids) - set(
            conversation.participants.values_list("pk", flat=True)
        )
        members = list(User.objects.filter(pk__in=member_ids).select_related("profile"))
        if len(members) != len(member_ids):
            return Response(
                {"detail": "One or more selected users were not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not members:
            return Response(
                {"detail": "Select at least one new member."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conversation.participants.add(*members)
        ConversationPreference.objects.bulk_create(
            [
                ConversationPreference(conversation=conversation, user=member)
                for member in members
            ]
        )
        for member in members:
            broadcast(
                user_group(member.pk),
                {"type": "refresh", "conversation_id": conversation.pk},
            )
        broadcast(
            room_group(conversation.pk),
            {"type": "group_updated", "conversation_id": conversation.pk},
        )
        serializer = ConversationSerializer(conversation, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class GroupConversationDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_admin_managed_group(request, conversation_id)
        participant_ids = list(conversation.participants.values_list("pk", flat=True))
        conversation_id = conversation.pk
        conversation.delete()
        for participant_id in participant_ids:
            broadcast(
                user_group(participant_id),
                {"type": "conversation_deleted", "conversation_id": conversation_id},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupInformationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, conversation_id):
        conversation = get_admin_managed_group(request, conversation_id)
        update_fields = []

        group_image = request.FILES.get("group_image")
        if group_image:
            allowed_extensions = {".jpg", ".jpeg", ".jfif", ".png", ".webp"}
            extension = os.path.splitext(group_image.name)[1].lower()
            if extension not in allowed_extensions:
                return Response(
                    {"group_image": ["Use a JPG, JPEG/JFIF, PNG, or WEBP image."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if group_image.size > 5 * 1024 * 1024:
                return Response(
                    {"group_image": ["Image must be 5 MB or smaller."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            conversation.group_image = group_image
            update_fields.append("group_image")

        if "group_name" in request.data:
            group_name = request.data["group_name"]
            if not isinstance(group_name, str) or not group_name.strip():
                return Response(
                    {"group_name": ["Group name is required."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            group_name = group_name.strip()
            if len(group_name) > 100:
                return Response(
                    {"group_name": ["Group name cannot exceed 100 characters."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            conversation.group_name = group_name
            update_fields.append("group_name")

        if "group_bio" in request.data:
            group_bio = request.data["group_bio"]
            if not isinstance(group_bio, str):
                return Response(
                    {"group_bio": ["Group description must be text."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            group_bio = group_bio.strip()
            if len(group_bio) > 300:
                return Response(
                    {"group_bio": ["Group description cannot exceed 300 characters."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            conversation.group_bio = group_bio
            update_fields.append("group_bio")

        if not update_fields:
            return Response(
                {"detail": "Provide a group name, description, or image to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conversation.save(update_fields=[*update_fields, "updated_at"])
        broadcast(
            room_group(conversation.pk),
            {"type": "group_updated", "conversation_id": conversation.pk},
        )
        for member_id in conversation.participants.values_list("pk", flat=True):
            broadcast(
                user_group(member_id),
                {"type": "refresh", "conversation_id": conversation.pk},
            )
        serializer = ConversationSerializer(conversation, context={"request": request})
        return Response(serializer.data)


class ConversationMessagesView(generics.ListAPIView):
    """Message history for a conversation the user belongs to. Opening it
    marks incoming messages as read and tells the sender in real time."""

    serializer_class = MessageSerializer

    def list(self, request, *args, **kwargs):
        purge_expired_messages()
        conversation = get_object_or_404(
            Conversation.objects.filter(participants=request.user), id=kwargs["conversation_id"]
        )
        ConversationPreference.objects.filter(
            conversation=conversation, user=request.user
        ).update(is_unread=False)
        can_send_receipts = get_profile(request.user).read_receipts
        if conversation.is_group:
            unread_queryset = conversation.messages.exclude(sender=request.user).exclude(
                read_by=request.user
            ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
            unread_ids = list(unread_queryset.values_list("id", flat=True)) if can_send_receipts else []
            if unread_ids:
                for message in unread_queryset.filter(id__in=unread_ids):
                    message.read_by.add(request.user)
        else:
            unread_ids = list(
                conversation.messages.filter(receiver=request.user, is_read=False).values_list("id", flat=True)
            ) if can_send_receipts else []
        if unread_ids:
            if not conversation.is_group:
                Message.objects.filter(id__in=unread_ids).update(is_read=True, is_delivered=True)
            broadcast(
                room_group(conversation.id),
                {"type": "read", "message_ids": unread_ids, "reader_id": request.user.id},
            )
        queryset = conversation.messages.exclude(hidden_for=request.user).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).select_related("sender", "receiver")
        return Response(self.get_serializer(queryset, many=True).data)


class ConversationDeleteView(generics.DestroyAPIView):
    """Hide a conversation for the requesting user without deleting its history."""

    def get_queryset(self):
        return Conversation.objects.filter(participants=self.request.user)

    def perform_destroy(self, instance):
        preference, _ = ConversationPreference.objects.get_or_create(
            conversation=instance, user=self.request.user
        )
        preference.is_deleted = True
        preference.is_archived = False
        preference.save(update_fields=["is_deleted", "is_archived"])
        broadcast(
            user_group(self.request.user.id),
            {"type": "refresh", "conversation_id": instance.id},
        )


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------
class MessageCreateView(generics.CreateAPIView):
    """REST fallback for sending a message (e.g. with an attachment).
    The new message is pushed to connected clients over WebSocket too."""

    serializer_class = MessageSerializer

    def perform_create(self, serializer):
        conversation = get_object_or_404(
            Conversation.objects.filter(participants=self.request.user),
            id=self.request.data.get("conversation"),
        )
        receiver = conversation.other_participant(self.request.user) if not conversation.is_group else self.request.user
        if not conversation.is_group and UserBlock.objects.filter(
            Q(blocker=self.request.user, blocked=receiver)
            | Q(blocker=receiver, blocked=self.request.user)
        ).exists():
            raise PermissionDenied("This conversation is blocked.")
        message = serializer.save(
            sender=self.request.user,
            receiver=receiver,
            conversation=conversation,
            reply_to=serializer.validated_data.get("reply_to"),
            expires_at=message_expiration(get_profile(self.request.user)),
        )
        conversation.save()
        if conversation.is_group:
            ConversationPreference.objects.filter(
                conversation=conversation, user__in=conversation.participants.all(), is_deleted=True
            ).update(is_deleted=False)
        else:
            ConversationPreference.objects.filter(
                conversation=conversation, user=receiver, is_deleted=True
            ).update(is_deleted=False)
        publish_new_message(message_payload(message))


class MessageCollectionView(generics.ListAPIView):
    """Return messages the signed-in user starred or shared as attachments."""

    serializer_class = MessageSerializer

    def get_queryset(self):
        purge_expired_messages()
        kind = self.request.query_params.get("kind")
        queryset = Message.objects.filter(
            conversation__participants=self.request.user,
            is_deleted_for_everyone=False,
        ).exclude(hidden_for=self.request.user).select_related("sender", "receiver", "conversation")
        if kind == "starred":
            return queryset.filter(starred_by=self.request.user).order_by("-created_at")
        if kind == "shared":
            return queryset.exclude(attachment="").exclude(attachment__isnull=True).order_by("-created_at")
        return Message.objects.none()


class ExpiredMessagesView(APIView):
    def post(self, request):
        purge_expired_messages()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationActionView(APIView):
    """Manage chat visibility and per-account settings; supports one or many chat IDs."""

    def post(self, request):
        conversation_ids = request.data.get("conversation_ids")
        action = request.data.get("action")
        if not isinstance(conversation_ids, list) or not conversation_ids:
            return Response(
                {"detail": "conversation_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if any(
            not isinstance(conversation_id, int)
            or isinstance(conversation_id, bool)
            or conversation_id < 1
            for conversation_id in conversation_ids
        ):
            return Response(
                {"detail": "conversation_ids must contain positive integer IDs."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(conversation_ids) > 100:
            return Response(
                {"detail": "Select no more than 100 conversations at a time."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        supported_actions = {
            "delete", "archive", "unarchive", "pin", "mute", "mark_unread",
            "clear", "block", "unblock", "favorite",
        }
        if action not in supported_actions:
            return Response(
                {"detail": "Unsupported conversation action."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conversations = list(
            Conversation.objects.filter(participants=request.user, id__in=conversation_ids).distinct()
        )
        if len(conversations) != len(set(conversation_ids)):
            return Response(
                {"detail": "One or more conversations were not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        for conversation in conversations:
            preference, _ = ConversationPreference.objects.get_or_create(
                conversation=conversation, user=request.user
            )
            if action == "delete":
                preference.is_deleted = True
                preference.is_archived = False
                preference.save(update_fields=["is_deleted", "is_archived"])
            elif action == "archive":
                preference.is_archived = True
                preference.is_deleted = False
                preference.save(update_fields=["is_archived", "is_deleted"])
            elif action == "unarchive":
                preference.is_archived = False
                preference.save(update_fields=["is_archived"])
            elif action == "pin":
                preference.is_pinned = not preference.is_pinned
                preference.save(update_fields=["is_pinned"])
            elif action == "mute":
                preference.is_muted = not preference.is_muted
                preference.save(update_fields=["is_muted"])
            elif action == "favorite":
                preference.is_favorite = not preference.is_favorite
                preference.save(update_fields=["is_favorite"])
            elif action == "mark_unread":
                preference.is_unread = True
                preference.save(update_fields=["is_unread"])
            elif action == "clear":
                for message in conversation.messages.all():
                    message.hidden_for.add(request.user)
            elif action in {"block", "unblock"}:
                if conversation.is_group:
                    return Response(
                        {"detail": "Block members individually from their personal chats."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                other = conversation.other_participant(request.user)
                if other is None:
                    return Response(
                        {"detail": "Could not determine the other participant."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if action == "block":
                    UserBlock.objects.get_or_create(blocker=request.user, blocked=other)
                else:
                    UserBlock.objects.filter(blocker=request.user, blocked=other).delete()
                broadcast(
                    user_group(other.id),
                    {"type": "refresh", "conversation_id": conversation.id},
                )
        if action in {"delete", "archive"}:
            return Response(status=status.HTTP_204_NO_CONTENT)
        result = ConversationSerializer(conversations, many=True, context={"request": request}).data
        return Response(result)


class MessageActionView(APIView):
    """Apply message actions only when the requester belongs to its conversation."""

    def post(self, request, pk):
        message = get_object_or_404(
            Message.objects.filter(conversation__participants=request.user)
            .select_related("conversation", "sender", "receiver"),
            pk=pk,
        )
        action = request.data.get("action")

        if action == "delete_for_me":
            message.hidden_for.add(request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)

        if action == "toggle_star":
            if message.starred_by.filter(pk=request.user.pk).exists():
                message.starred_by.remove(request.user)
            else:
                message.starred_by.add(request.user)
            return Response(MessageSerializer(message, context={"request": request}).data)

        if action == "delete_for_everyone":
            if message.sender_id != request.user.pk:
                return Response(
                    {"detail": "Only the sender can delete this message for everyone."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not message.is_deleted_for_everyone:
                message.is_deleted_for_everyone = True
                message.message = ""
                message.attachment = None
                message.save(update_fields=["is_deleted_for_everyone", "message", "attachment", "updated_at"])
                broadcast(
                    room_group(message.conversation_id),
                    {
                        "type": "message_updated",
                        "id": message.id,
                        "message": "This message was deleted",
                        "attachment": None,
                        "is_deleted_for_everyone": True,
                    },
                )
                for user_id in message.conversation.participants.values_list("id", flat=True):
                    broadcast(
                        user_group(user_id),
                        {"type": "refresh", "conversation_id": message.conversation_id},
                    )
            return Response(MessageSerializer(message, context={"request": request}).data)

        if action == "forward":
            if message.is_deleted_for_everyone:
                return Response(
                    {"detail": "Deleted messages cannot be forwarded."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target_user_id = request.data.get("user_id")
            if not target_user_id:
                return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
            target = get_object_or_404(User, pk=target_user_id)
            if target.pk == request.user.pk:
                return Response(
                    {"detail": "You cannot forward a message to yourself."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            conversation = (
                Conversation.objects.filter(is_group=False, participants=request.user)
                .filter(participants=target)
                .first()
            )
            if UserBlock.objects.filter(
                Q(blocker=request.user, blocked=target)
                | Q(blocker=target, blocked=request.user)
            ).exists():
                return Response(
                    {"detail": "This conversation is blocked."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if conversation is None:
                conversation = Conversation.objects.create()
                conversation.participants.add(request.user, target)
                ConversationPreference.objects.get_or_create(conversation=conversation, user=request.user)
                ConversationPreference.objects.get_or_create(conversation=conversation, user=target)
            forwarded = Message.objects.create(
                conversation=conversation,
                sender=request.user,
                receiver=target,
                message=message.message,
                message_type=message.message_type,
                is_forwarded=True,
                expires_at=message_expiration(get_profile(request.user)),
            )
            if message.attachment:
                with message.attachment.open("rb") as attachment_file:
                    forwarded.attachment.save(
                        message.attachment.name.rsplit("/", 1)[-1],
                        ContentFile(attachment_file.read()),
                    )
            conversation.save()
            publish_new_message(message_payload(forwarded))
            return Response(
                MessageSerializer(forwarded, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            {"detail": "Unsupported message action."},
            status=status.HTTP_400_BAD_REQUEST,
        )
