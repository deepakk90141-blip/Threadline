import json
from datetime import timedelta
from uuid import UUID

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone

from .models import (
    CallSession,
    Conversation,
    ConversationPreference,
    Message,
    Profile,
    UserBlock,
    get_profile,
    message_expiration,
)
from .realtime import (
    abroadcast,
    apublish_new_message,
    message_payload,
    room_group,
    user_group,
)

MAX_MESSAGE_LENGTH = 5000


class ForwardMixin:
    """Group events all use type "forward" and carry a ready-made payload."""

    async def forward(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def send_error(self, detail):
        await self.send(text_data=json.dumps({"type": "error", "detail": detail}))


class ChatConsumer(ForwardMixin, AsyncWebsocketConsumer):
    """
    One socket per open conversation.
    ws://host/ws/chat/<conversation_id>/?token=<auth_token>

    Handles: message, typing, read.  The sender is ALWAYS the authenticated
    socket user -- nothing identity-related is read from the client payload.
    """

    async def connect(self):
        self.room_group_name = None
        self.user = self.scope.get("user")

        # Accept first, then close with an app-specific code. Closing before
        # accept() makes the browser see a generic 1006 and it could never
        # tell "unauthorized" from "server down".
        await self.accept()

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.conversation_id = int(self.scope["url_route"]["kwargs"]["conversation_id"])
        if not await self.is_member():
            await self.close(code=4003)
            return

        self.room_group_name = room_group(self.conversation_id)
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

    async def disconnect(self, close_code):
        if self.room_group_name:
            await abroadcast(
                self.room_group_name,
                {"type": "typing", "user_id": self.user.id, "username": self.user.username, "is_typing": False},
            )
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def forward(self, event):
        await super().forward(event)
        payload = event.get("payload", {})
        if (
            payload.get("type") == "group_member_removed"
            and payload.get("user_id") == self.user.id
        ):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            self.room_group_name = None
            await self.close(code=4003)

    async def receive(self, text_data=None, bytes_data=None):
        if not self.room_group_name:
            return
        try:
            data = json.loads(text_data)
        except (TypeError, ValueError):
            await self.send_error("Invalid JSON payload.")
            return
        if not isinstance(data, dict):
            await self.send_error("Invalid payload.")
            return

        event_type = data.get("type")
        if event_type == "message":
            await self.handle_message(data)
        elif event_type == "typing":
            await abroadcast(
                self.room_group_name,
                {
                    "type": "typing",
                    "user_id": self.user.id,
                    "username": self.user.username,
                    "is_typing": bool(data.get("is_typing")),
                },
            )
        elif event_type == "read":
            await self.handle_read(data)
        else:
            await self.send_error(f"Unknown event type: {event_type}")

    async def handle_message(self, data):
        text = data.get("message")
        if not isinstance(text, str) or not text.strip():
            await self.send_error("Message cannot be empty.")
            return
        text = text.strip()
        if len(text) > MAX_MESSAGE_LENGTH:
            await self.send_error(f"Message is too long (max {MAX_MESSAGE_LENGTH} characters).")
            return

        reply_to_id = data.get("reply_to")
        if reply_to_id is not None and (
            not isinstance(reply_to_id, int) or isinstance(reply_to_id, bool) or reply_to_id < 1
        ):
            await self.send_error("Reply target is invalid.")
            return
        payload, error = await self.create_message(text, reply_to_id)
        if error:
            await self.send_error(error)
            return
        if payload is None:
            await self.send_error("You are not a member of this conversation.")
            return
        await apublish_new_message(payload)

    async def handle_read(self, data):
        raw_ids = data.get("message_ids")
        if not isinstance(raw_ids, list):
            return
        ids = [i for i in raw_ids if isinstance(i, int)][:200]
        updated = await self.mark_read(ids)
        if updated:
            await abroadcast(
                self.room_group_name,
                {"type": "read", "message_ids": updated, "reader_id": self.user.id},
            )

    # ---- DB helpers ------------------------------------------------------
    @database_sync_to_async
    def is_member(self):
        return Conversation.objects.filter(id=self.conversation_id, participants__id=self.user.id).exists()

    @database_sync_to_async
    def create_message(self, text, reply_to_id=None):
        conversation = Conversation.objects.filter(
            id=self.conversation_id, participants__id=self.user.id
        ).first()
        if conversation is None:
            return None, None
        reply_to = None
        if reply_to_id is not None:
            reply_to = Message.objects.filter(
                pk=reply_to_id,
                conversation=conversation,
            ).exclude(hidden_for=self.user).first()
            if reply_to is None:
                return None, "That message cannot be replied to."
        receiver = (
            self.user
            if conversation.is_group
            else conversation.participants.exclude(id=self.user.id).first()
        )
        if receiver is None:
            return None, "This conversation has no other participant."
        if not conversation.is_group and UserBlock.objects.filter(
            Q(blocker=self.user, blocked=receiver) | Q(blocker=receiver, blocked=self.user)
        ).exists():
            return None, "This conversation is blocked."
        recipients = conversation.participants.exclude(id=self.user.id)
        delivered = Profile.objects.filter(user__in=recipients, is_online=True).exists()

        message = Message.objects.create(
            conversation=conversation,
            sender=self.user,
            receiver=receiver,
            reply_to=reply_to,
            message=text,
            message_type=Message.TEXT,
            is_delivered=delivered,
            expires_at=message_expiration(get_profile(self.user)),
        )
        conversation.save()  # bump updated_at so the chat list re-orders
        ConversationPreference.objects.filter(
            conversation=conversation, user__in=recipients, is_deleted=True
        ).update(is_deleted=False)
        return message_payload(message), None

    @database_sync_to_async
    def mark_read(self, ids):
        if not get_profile(self.user).read_receipts:
            return []
        conversation = Conversation.objects.filter(pk=self.conversation_id).first()
        if conversation is None:
            return []
        qs = Message.objects.filter(
            id__in=ids,
            conversation_id=self.conversation_id,
            is_read=False,
        ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
        if conversation.is_group:
            qs = qs.exclude(sender=self.user).exclude(read_by=self.user)
            updated = list(qs.values_list("id", flat=True))
            for message in qs.filter(id__in=updated):
                message.read_by.add(self.user)
            return updated
        qs = qs.filter(receiver=self.user)
        updated = list(qs.values_list("id", flat=True))
        if updated:
            Message.objects.filter(id__in=updated).update(is_read=True, is_delivered=True)
        return updated


class NotificationConsumer(ForwardMixin, AsyncWebsocketConsumer):
    """
    One socket per logged-in user for the whole session.
    ws://host/ws/notifications/?token=<auth_token>

    - Being connected == being online (independent of which chat is open).
    - Receives new-message alerts, presence changes and conversation
      deletions through the user's personal group.
    """

    async def connect(self):
        self.group_name = None
        self.user = self.scope.get("user")
        await self.accept()

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.group_name = user_group(self.user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        last_seen = await self.set_presence(True)
        await self.broadcast_presence(True, last_seen)

        # Anything sent to us while we were offline is now "delivered".
        delivered = await self.mark_pending_delivered()
        for conversation_id, ids in delivered.items():
            await abroadcast(room_group(conversation_id), {"type": "delivered", "message_ids": ids})

    async def disconnect(self, close_code):
        if self.group_name:
            for event in await self.finish_disconnected_calls():
                for participant_id in event["recipients"]:
                    if participant_id != self.user.id:
                        await abroadcast(
                            user_group(participant_id),
                            {
                                "type": event["type"],
                                "call_id": str(event["call_id"]),
                                **(
                                    {"user_id": self.user.id}
                                    if event["type"] == "call_participant_left"
                                    else {}
                                ),
                            },
                        )
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            last_seen = await self.set_presence(False)
            await self.broadcast_presence(False, last_seen)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data)
        except (TypeError, ValueError):
            await self.send_error("Invalid JSON payload.")
            return
        if not isinstance(data, dict):
            await self.send_error("Invalid payload.")
            return

        event_type = data.get("type")
        if event_type == "call_invite":
            await self.handle_call_invite(data)
        elif event_type == "call_join":
            await self.handle_call_join(data)
        elif event_type == "call_decline":
            await self.handle_call_decline(data)
        elif event_type == "call_signal":
            await self.handle_call_signal(data)
        elif event_type in {"call_leave", "call_end"}:
            await self.handle_call_finish(data, event_type)
        else:
            await self.send_error(f"Unknown event type: {event_type}")

    async def handle_call_invite(self, data):
        conversation_id = data.get("conversation_id")
        call_id = self.parse_call_id(data.get("call_id"))
        media_type = data.get("media_type")
        target_user_id = data.get("target_user_id")
        if (
            not isinstance(conversation_id, int)
            or isinstance(conversation_id, bool)
            or conversation_id < 1
            or call_id is None
            or media_type not in {"audio", "video"}
        ):
            await self.send_error("Invalid call invitation.")
            return
        recipients = await self.create_call(
            call_id,
            conversation_id,
            media_type,
            target_user_id,
        )
        if recipients is None:
            await self.send_error("You cannot start a call in this conversation.")
            return
        if not recipients:
            await self.send_error("There is no other participant to call.")
            await self.finish_call_record(call_id)
            return

        payload = {
            "type": "call_invite",
            "call_id": str(call_id),
            "conversation_id": conversation_id,
            "media_type": media_type,
            "caller_id": self.user.id,
            "caller_name": self.user.get_full_name() or self.user.username,
            "conversation_name": recipients[0]["conversation_name"],
            "is_group": recipients[0]["is_group"],
        }
        for recipient in recipients:
            await abroadcast(user_group(recipient["id"]), payload)

    async def handle_call_join(self, data):
        call_id = self.parse_call_id(data.get("call_id"))
        if call_id is None:
            await self.send_error("Invalid call ID.")
            return
        call = await self.join_call(call_id)
        if call is None:
            await self.send_error("This call is no longer available.")
            return
        payload = {
            "type": "call_participant_joined",
            "call_id": str(call_id),
            "conversation_id": call["conversation_id"],
            "user_id": self.user.id,
            "user_name": self.user.get_full_name() or self.user.username,
        }
        for participant_id in call["conversation_participant_ids"]:
            await abroadcast(user_group(participant_id), payload)
        await abroadcast(
            user_group(self.user.id),
            {
                "type": "call_roster",
                "call_id": str(call_id),
                "conversation_id": call["conversation_id"],
                "initiator_id": call["initiator_id"],
                "media_type": call["media_type"],
                "participants": call["participants"],
            },
        )

    async def handle_call_decline(self, data):
        call_id = self.parse_call_id(data.get("call_id"))
        if call_id is None:
            await self.send_error("Invalid call ID.")
            return
        participant_ids = await self.decline_call(call_id)
        if participant_ids is None:
            await self.send_error("This call is no longer available.")
            return
        payload = {
            "type": "call_declined",
            "call_id": str(call_id),
            "user_id": self.user.id,
            "user_name": self.user.get_full_name() or self.user.username,
        }
        for participant_id in participant_ids:
            if participant_id != self.user.id:
                await abroadcast(user_group(participant_id), payload)

    async def handle_call_signal(self, data):
        call_id = self.parse_call_id(data.get("call_id"))
        target_user_id = data.get("target_user_id")
        signal = data.get("signal")
        if (
            call_id is None
            or not isinstance(target_user_id, int)
            or isinstance(target_user_id, bool)
            or not isinstance(signal, dict)
            or len(json.dumps(signal)) > 200_000
        ):
            await self.send_error("Invalid call signal.")
            return
        if not await self.can_signal_call(call_id, target_user_id):
            await self.send_error("You cannot signal this call participant.")
            return
        await abroadcast(
            user_group(target_user_id),
            {
                "type": "call_signal",
                "call_id": str(call_id),
                "from_user_id": self.user.id,
                "signal": signal,
            },
        )

    async def handle_call_finish(self, data, event_type):
        call_id = self.parse_call_id(data.get("call_id"))
        if call_id is None:
            await self.send_error("Invalid call ID.")
            return
        result = await self.finish_call(call_id, self.user.id, event_type == "call_end")
        if result is None:
            await self.send_error("This call is no longer available.")
            return
        if result["ended"]:
            payload = {"type": "call_ended", "call_id": str(call_id)}
        else:
            payload = {
                "type": "call_participant_left",
                "call_id": str(call_id),
                "user_id": self.user.id,
            }
        for participant_id in result["recipients"]:
            if participant_id != self.user.id:
                await abroadcast(user_group(participant_id), payload)

    @staticmethod
    def parse_call_id(value):
        try:
            return UUID(str(value))
        except (TypeError, ValueError, AttributeError):
            return None

    @database_sync_to_async
    def create_call(self, call_id, conversation_id, media_type, target_user_id):
        now = timezone.now()
        CallSession.objects.filter(
            is_active=True,
            created_at__lt=now - timedelta(hours=4),
        ).update(is_active=False, ended_at=now)
        conversation = Conversation.objects.filter(
            pk=conversation_id,
            participants=self.user,
        ).first()
        if conversation is None:
            return None
        if CallSession.objects.filter(is_active=True, participants=self.user).exists():
            return None
        participants = list(
            conversation.participants.exclude(pk=self.user.pk).values("id")
        )
        if not participants:
            return []
        if conversation.is_group:
            if target_user_id is not None:
                return None
        else:
            other_id = participants[0]["id"]
            if target_user_id != other_id:
                return None
            if UserBlock.objects.filter(
                Q(blocker_id=self.user.pk, blocked_id=other_id)
                | Q(blocker_id=other_id, blocked_id=self.user.pk)
            ).exists():
                return None
            participants = [{"id": other_id}]

        call = CallSession.objects.create(
            call_id=call_id,
            conversation=conversation,
            initiator=self.user,
            media_type=media_type,
        )
        call.participants.add(self.user)
        conversation_name = conversation.group_name if conversation.is_group else ""
        for participant in participants:
            participant["conversation_name"] = conversation_name
            participant["is_group"] = conversation.is_group
        return participants

    @database_sync_to_async
    def finish_call_record(self, call_id):
        CallSession.objects.filter(call_id=call_id, is_active=True).update(
            is_active=False,
            ended_at=timezone.now(),
        )

    @database_sync_to_async
    def join_call(self, call_id):
        if CallSession.objects.filter(
            is_active=True,
            participants=self.user,
        ).exclude(call_id=call_id).exists():
            return None
        call = CallSession.objects.filter(
            call_id=call_id,
            is_active=True,
            conversation__participants=self.user,
        ).select_related("conversation", "initiator").first()
        if call is None:
            return None
        existing_participants = list(
            call.participants.values("id", "username")
        )
        call.participants.add(self.user)
        return {
            "conversation_id": call.conversation_id,
            "initiator_id": call.initiator_id,
            "media_type": call.media_type,
            "participants": existing_participants,
            "conversation_participant_ids": list(
                call.conversation.participants.values_list("id", flat=True)
            ),
        }

    @database_sync_to_async
    def decline_call(self, call_id):
        call = CallSession.objects.filter(
            call_id=call_id,
            is_active=True,
            conversation__participants=self.user,
        ).first()
        if call is None:
            return None
        if call.participants.filter(pk=self.user.pk).exists():
            return None
        return list(call.conversation.participants.values_list("id", flat=True))

    @database_sync_to_async
    def can_signal_call(self, call_id, target_user_id):
        call = CallSession.objects.filter(
            call_id=call_id,
            is_active=True,
            participants=self.user,
        ).first()
        return bool(
            call
            and call.participants.filter(pk=target_user_id).exists()
            and target_user_id != self.user.pk
        )

    @database_sync_to_async
    def finish_call(self, call_id, user_id, end_for_everyone):
        call = CallSession.objects.filter(
            call_id=call_id,
            is_active=True,
            participants__pk=user_id,
        ).select_related("conversation").first()
        if call is None:
            return None
        recipients = list(
            call.conversation.participants.values_list("id", flat=True)
        )
        if end_for_everyone:
            if call.initiator_id != user_id:
                return None
            call.is_active = False
            call.ended_at = timezone.now()
            call.save(update_fields=["is_active", "ended_at"])
            return {"ended": True, "recipients": recipients}
        call.participants.remove(user_id)
        return {"ended": False, "recipients": recipients}

    @database_sync_to_async
    def finish_disconnected_calls(self):
        events = []
        calls = list(
            CallSession.objects.filter(
                is_active=True,
                participants=self.user,
            ).select_related("conversation")
        )
        for call in calls:
            recipients = list(
                call.conversation.participants.values_list("id", flat=True)
            )
            if call.initiator_id == self.user.id:
                call.is_active = False
                call.ended_at = timezone.now()
                call.save(update_fields=["is_active", "ended_at"])
                event_type = "call_ended"
            else:
                call.participants.remove(self.user)
                event_type = "call_participant_left"
            events.append({
                "type": event_type,
                "call_id": call.call_id,
                "recipients": recipients,
            })
        return events

    async def broadcast_presence(self, is_online, last_seen):
        for partner_id in await self.partner_ids():
            await abroadcast(
                user_group(partner_id),
                {"type": "presence", "user_id": self.user.id, "is_online": is_online, "last_seen": last_seen},
            )

    @database_sync_to_async
    def set_presence(self, is_online):
        now = timezone.now()
        Profile.objects.get_or_create(user_id=self.user.id)
        Profile.objects.filter(user_id=self.user.id).update(is_online=is_online, last_seen=now)
        return now.isoformat()

    @database_sync_to_async
    def partner_ids(self):
        conversation_ids = Conversation.objects.filter(participants__id=self.user.id).values_list("id", flat=True)
        through = Conversation.participants.through
        return list(
            through.objects.filter(conversation_id__in=list(conversation_ids))
            .exclude(user_id=self.user.id)
            .values_list("user_id", flat=True)
            .distinct()
        )

    @database_sync_to_async
    def mark_pending_delivered(self):
        pending = list(
            Message.objects.filter(receiver=self.user, is_delivered=False).values_list("id", "conversation_id")
        )
        if not pending:
            return {}
        Message.objects.filter(id__in=[pk for pk, _ in pending]).update(is_delivered=True)
        grouped = {}
        for pk, conversation_id in pending:
            grouped.setdefault(conversation_id, []).append(pk)
        return grouped
