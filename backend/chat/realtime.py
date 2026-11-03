"""Helpers for pushing events to WebSocket groups.

Every group event uses the single event type "forward"; the consumer simply
relays `payload` (already JSON-serialisable) to the browser.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def room_group(conversation_id):
    return f"chat_{conversation_id}"


def user_group(user_id):
    return f"user_{user_id}"


def message_payload(message):
    recipient_ids = list(message.conversation.participants.values_list("id", flat=True))
    replied_message = message.reply_to
    reply_preview = None
    if replied_message is not None:
        deleted = replied_message.is_deleted_for_everyone
        unavailable = deleted or replied_message.hidden_for.exists()
        reply_preview = {
            "id": replied_message.pk,
            "sender": replied_message.sender_id,
            "sender_username": replied_message.sender.username,
            "message": "This message was deleted"
            if deleted
            else "Message unavailable"
            if unavailable
            else replied_message.message,
            "attachment": None
            if unavailable or not replied_message.attachment
            else replied_message.attachment.url,
            "is_deleted_for_everyone": deleted,
        }
    return {
        "type": "message",
        "id": message.id,
        "conversation": message.conversation_id,
        "is_group": message.conversation.is_group,
        "recipient_ids": recipient_ids,
        "sender": message.sender_id,
        "sender_username": message.sender.username,
        "receiver": message.receiver_id,
        "reply_to": replied_message.pk if replied_message else None,
        "reply_preview": reply_preview,
        "message": "This message was deleted" if message.is_deleted_for_everyone else message.message,
        "message_type": message.message_type,
        "attachment": message.attachment.url if message.attachment and not message.is_deleted_for_everyone else None,
        "is_delivered": message.is_delivered,
        "is_read": message.is_read,
        "is_deleted_for_everyone": message.is_deleted_for_everyone,
        "is_forwarded": message.is_forwarded,
        "is_starred": False,
        "created_at": message.created_at.isoformat(),
        "expires_at": message.expires_at.isoformat() if message.expires_at else None,
    }


async def abroadcast(group, payload):
    layer = get_channel_layer()
    await layer.group_send(group, {"type": "forward", "payload": payload})


async def apublish_new_message(payload):
    """Deliver a new message to the open room and each participant."""
    await abroadcast(room_group(payload["conversation"]), payload)
    for user_id in set(payload.get("recipient_ids", [payload["sender"], payload["receiver"]])):
        if user_id:
            await abroadcast(
                user_group(user_id),
                {"type": "new_message", "conversation_id": payload["conversation"], "message": payload},
            )


# ---- sync wrappers, for use from normal Django (REST) views -------------
def broadcast(group, payload):
    try:
        async_to_sync(abroadcast)(group, payload)
    except Exception:  # never let a realtime hiccup break a REST call
        logger.exception("Failed to broadcast to %s", group)


def publish_new_message(payload):
    try:
        async_to_sync(apublish_new_message)(payload)
    except Exception:
        logger.exception("Failed to publish message")
