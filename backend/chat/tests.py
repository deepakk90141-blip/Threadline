import tempfile

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase
from django.test.utils import override_settings
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from chatproject.asgi import application
from .models import CallSession, Conversation, Message


class HealthCheckTests(TestCase):
    def test_health_check_returns_ok(self):
        response = self.client.get("/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class RegistrationTests(TestCase):
    def test_registration_creates_account_profile_and_auth_token(self):
        response = self.client.post(
            "/api/register/",
            {
                "username": "mobile-new-user",
                "email": "mobile-new-user@example.com",
                "full_name": "Mobile User",
                "mobile_number": "5550100",
                "password": "T0p!cal-Ocean-73",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["token"])
        self.assertEqual(response.data["user"]["username"], "mobile-new-user")


class ProfileSettingsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="settings-user",
            password="test-password",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_default_chat_theme_can_be_saved_and_loaded(self):
        response = self.client.patch(
            "/api/settings/",
            {"default_chat_theme": "purple"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["default_chat_theme"], "purple")

        settings = self.client.get("/api/settings/")
        self.assertEqual(settings.status_code, 200)
        self.assertEqual(settings.data["default_chat_theme"], "purple")

    def test_default_chat_theme_rejects_unknown_palette_values(self):
        response = self.client.patch(
            "/api/settings/",
            {"default_chat_theme": "ultraviolet"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)


class GroupConversationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="group-owner", password="test-password")
        self.member = User.objects.create_user(username="group-member", password="test-password")
        self.new_member = User.objects.create_user(username="group-new-member", password="not-a-real-secret")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_create_group_and_send_messages_between_members(self):
        response = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Project chat", "user_ids": [self.member.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        conversation_id = response.data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        self.assertTrue(conversation.is_group)
        self.assertEqual(conversation.group_name, "Project chat")
        self.assertEqual(conversation.group_admin_id, self.owner.pk)
        self.assertEqual(response.data["group_admin_id"], self.owner.pk)
        self.assertSetEqual(
            set(conversation.participants.values_list("id", flat=True)),
            {self.owner.pk, self.member.pk},
        )
        member_data = next(
            participant
            for participant in response.data["participants"]
            if participant["id"] == self.member.pk
        )
        self.assertTrue({"profile_image", "last_seen", "bio"}.issubset(member_data))
        self.assertNotIn("email", member_data)
        self.assertNotIn("mobile_number", member_data)

        sent = self.client.post(
            "/api/messages/",
            {"conversation": conversation_id, "message": "Hello group"},
            format="json",
        )
        self.assertEqual(sent.status_code, 201)
        message = Message.objects.get(pk=sent.data["id"])
        self.assertEqual(message.sender_id, self.owner.pk)
        self.assertEqual(message.receiver_id, self.owner.pk)

        owner_reply = self.client.post(
            "/api/messages/",
            {
                "conversation": conversation_id,
                "message": "Replying to my own message",
                "reply_to": message.pk,
            },
            format="json",
        )
        self.assertEqual(owner_reply.status_code, 201)
        self.assertEqual(owner_reply.data["reply_to"], message.pk)
        self.assertEqual(
            owner_reply.data["reply_preview"]["sender_username"],
            self.owner.username,
        )
        self.assertEqual(owner_reply.data["reply_preview"]["message"], "Hello group")

        member_client = APIClient()
        member_client.force_authenticate(self.member)
        history = member_client.get(f"/api/conversations/{conversation_id}/messages/")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data), 2)
        self.assertTrue(history.data[0]["is_read"])
        self.assertTrue(message.read_by.filter(pk=self.member.pk).exists())

        conversation_list = member_client.get("/api/conversations/")
        self.assertEqual(conversation_list.data[0]["unread_count"], 0)

        member_message = member_client.post(
            "/api/messages/",
            {
                "conversation": conversation_id,
                "message": "Members can still chat",
                "reply_to": message.pk,
            },
            format="json",
        )
        self.assertEqual(member_message.status_code, 201)
        self.assertEqual(member_message.data["sender"], self.member.pk)
        self.assertEqual(member_message.data["reply_to"], message.pk)
        self.assertEqual(member_message.data["reply_preview"]["message"], "Hello group")

        other_group = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Other chat", "user_ids": [self.new_member.pk]},
            format="json",
        )
        invalid_reply = self.client.post(
            "/api/messages/",
            {
                "conversation": other_group.data["id"],
                "message": "Must not quote another conversation",
                "reply_to": message.pk,
            },
            format="json",
        )
        self.assertEqual(invalid_reply.status_code, 400)

    def test_group_creation_requires_at_least_one_other_member(self):
        for user_ids in ([], [self.owner.pk]):
            with self.subTest(user_ids=user_ids):
                response = self.client.post(
                    "/api/conversations/groups/create/",
                    {"group_name": "Empty group", "user_ids": user_ids},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)

    def test_personal_conversation_profile_omits_email_and_phone(self):
        response = self.client.post(
            "/api/conversations/create/",
            {"user_id": self.member.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("profile_image", response.data["other_user"])
        self.assertIn("last_seen", response.data["other_user"])
        self.assertIn("bio", response.data["other_user"])
        self.assertNotIn("email", response.data["other_user"])
        self.assertNotIn("mobile_number", response.data["other_user"])

    def test_only_group_admin_can_remove_members(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Admin test", "user_ids": [self.member.pk]},
            format="json",
        )
        conversation_id = created.data["id"]
        self_remove = self.client.post(
            f"/api/conversations/{conversation_id}/members/{self.owner.pk}/remove/"
        )
        self.assertEqual(self_remove.status_code, 400)

        member_client = APIClient()
        member_client.force_authenticate(self.member)

        forbidden = member_client.post(
            f"/api/conversations/{conversation_id}/members/{self.member.pk}/remove/"
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertTrue(
            Conversation.objects.get(pk=conversation_id).participants.filter(pk=self.member.pk).exists()
        )

        removed = self.client.post(
            f"/api/conversations/{conversation_id}/members/{self.member.pk}/remove/"
        )
        self.assertEqual(removed.status_code, 204)
        conversation = Conversation.objects.get(pk=conversation_id)
        self.assertFalse(conversation.participants.filter(pk=self.member.pk).exists())
        self.assertEqual(conversation.group_admin_id, self.owner.pk)
        self.assertFalse(
            conversation.user_preferences.filter(user=self.member).exists()
        )

        history = member_client.get(f"/api/conversations/{conversation_id}/messages/")
        self.assertEqual(history.status_code, 404)

    def test_group_admin_can_update_description_and_add_members(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Admin test", "user_ids": [self.member.pk]},
            format="json",
        )
        conversation_id = created.data["id"]

        updated = self.client.patch(
            f"/api/conversations/{conversation_id}/information/",
            {"group_bio": "Plans for the project"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["group_bio"], "Plans for the project")
        self.assertEqual(
            Conversation.objects.get(pk=conversation_id).group_bio,
            "Plans for the project",
        )
        renamed = self.client.patch(
            f"/api/conversations/{conversation_id}/information/",
            {"group_name": "Renamed project"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.data["group_name"], "Renamed project")

        added = self.client.post(
            f"/api/conversations/{conversation_id}/members/add/",
            {"user_ids": [self.new_member.pk]},
            format="json",
        )
        self.assertEqual(added.status_code, 200)
        conversation = Conversation.objects.get(pk=conversation_id)
        self.assertTrue(conversation.participants.filter(pk=self.new_member.pk).exists())
        self.assertTrue(
            conversation.user_preferences.filter(user=self.new_member).exists()
        )

        member_client = APIClient()
        member_client.force_authenticate(self.member)
        denied_bio = member_client.patch(
            f"/api/conversations/{conversation_id}/information/",
            {"group_bio": "Changed by non-admin"},
            format="json",
        )
        denied_rename = member_client.patch(
            f"/api/conversations/{conversation_id}/information/",
            {"group_name": "Hijacked group"},
            format="json",
        )
        denied_add = member_client.post(
            f"/api/conversations/{conversation_id}/members/add/",
            {"user_ids": [self.new_member.pk]},
            format="json",
        )
        self.assertEqual(denied_bio.status_code, 403)
        self.assertEqual(denied_rename.status_code, 403)
        self.assertEqual(denied_add.status_code, 403)
        self.assertEqual(
            Conversation.objects.get(pk=conversation_id).group_name,
            "Renamed project",
        )
        self.assertEqual(
            Conversation.objects.get(pk=conversation_id).group_bio,
            "Plans for the project",
        )

    def test_group_admin_can_upload_group_image(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Image test", "user_ids": [self.member.pk]},
            format="json",
        )
        conversation_id = created.data["id"]
        image_content = (
            b"\x89PNG\r\n\x1a\n"
            b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde"
            b"\x00\x00\x00\x0bIDAT\x08\xd7c\xf8\x0f\x00\x01\x01\x01\x00"
            b"\x18\xdd\x8d\xb0"
            b"\x00\x00\x00\x00IEND\xaeB`\x82"
        )

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                uploaded_image = SimpleUploadedFile(
                    "group.png",
                    image_content,
                    content_type="image/png",
                )
                response = self.client.patch(
                    f"/api/conversations/{conversation_id}/information/",
                    {"group_image": uploaded_image},
                    format="multipart",
                )

        self.assertEqual(response.status_code, 200, response.data)
        conversation = Conversation.objects.get(pk=conversation_id)
        self.assertTrue(conversation.group_image.name.endswith(".png"))
        self.assertIn("/media/group_images/", response.data["group_image"])

    def test_group_admin_can_upload_jfif_group_image(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "JFIF image test", "user_ids": [self.member.pk]},
            format="json",
        )

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                response = self.client.patch(
                    f"/api/conversations/{created.data['id']}/information/",
                    {
                        "group_image": SimpleUploadedFile(
                            "group.jfif",
                            b"jpeg image content",
                            content_type="image/jpeg",
                        )
                    },
                    format="multipart",
                )

        self.assertEqual(response.status_code, 200, response.data)
        conversation = Conversation.objects.get(pk=created.data["id"])
        self.assertTrue(conversation.group_image.name.endswith(".jfif"))

    def test_group_image_upload_rejects_unsupported_extension_and_oversized_file(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Image validation test", "user_ids": [self.member.pk]},
            format="json",
        )
        conversation_id = created.data["id"]

        unsupported = self.client.patch(
            f"/api/conversations/{conversation_id}/information/",
            {
                "group_image": SimpleUploadedFile(
                    "group.gif",
                    b"gif",
                    content_type="image/gif",
                )
            },
            format="multipart",
        )
        self.assertEqual(unsupported.status_code, 400)
        self.assertEqual(
            unsupported.data["group_image"],
            ["Use a JPG, JPEG/JFIF, PNG, or WEBP image."],
        )

        oversized = self.client.patch(
            f"/api/conversations/{conversation_id}/information/",
            {
                "group_image": SimpleUploadedFile(
                    "group.jpg",
                    b"x" * (5 * 1024 * 1024 + 1),
                    content_type="image/jpeg",
                )
            },
            format="multipart",
        )
        self.assertEqual(oversized.status_code, 400)
        self.assertEqual(
            oversized.data["group_image"],
            ["Image must be 5 MB or smaller."],
        )

    def test_only_group_admin_can_delete_group_for_everyone(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Delete test", "user_ids": [self.member.pk]},
            format="json",
        )
        conversation_id = created.data["id"]
        Message.objects.create(
            conversation_id=conversation_id,
            sender=self.owner,
            receiver=self.owner,
            message="Group history",
        )
        member_client = APIClient()
        member_client.force_authenticate(self.member)

        denied = member_client.delete(f"/api/conversations/{conversation_id}/group/")
        self.assertEqual(denied.status_code, 403)
        self.assertTrue(Conversation.objects.filter(pk=conversation_id).exists())

        deleted = self.client.delete(f"/api/conversations/{conversation_id}/group/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Conversation.objects.filter(pk=conversation_id).exists())
        self.assertFalse(Message.objects.filter(conversation_id=conversation_id).exists())

    def test_group_management_requires_authentication(self):
        created = self.client.post(
            "/api/conversations/groups/create/",
            {"group_name": "Auth test", "user_ids": [self.member.pk]},
            format="json",
        )
        conversation_id = created.data["id"]
        anonymous_client = APIClient()

        requests = (
            anonymous_client.patch(
                f"/api/conversations/{conversation_id}/information/",
                {"group_bio": "Unauthenticated edit"},
                format="json",
            ),
            anonymous_client.post(
                f"/api/conversations/{conversation_id}/members/add/",
                {"user_ids": [self.new_member.pk]},
                format="json",
            ),
            anonymous_client.post(
                f"/api/conversations/{conversation_id}/members/{self.member.pk}/remove/"
            ),
            anonymous_client.delete(f"/api/conversations/{conversation_id}/group/"),
        )
        self.assertEqual([response.status_code for response in requests], [401, 401, 401, 401])

    def test_group_without_recorded_admin_fails_closed(self):
        conversation = Conversation.objects.create(is_group=True, group_name="Legacy group")
        conversation.participants.add(self.owner, self.member)

        response = self.client.patch(
            f"/api/conversations/{conversation.pk}/information/",
            {"group_bio": "Only a recorded admin can set this"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        conversation.refresh_from_db()
        self.assertIsNone(conversation.group_admin_id)
        self.assertEqual(conversation.group_bio, "")


class CallSignalingTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = User.objects.create_user(username="call-owner", password="test-pass-123")
        self.member = User.objects.create_user(username="call-member", password="test-pass-123")
        self.outsider = User.objects.create_user(username="call-outsider", password="test-pass-123")
        self.conversation = Conversation.objects.create(
            is_group=True,
            group_name="Call test",
            group_admin=self.owner,
        )
        self.conversation.participants.add(self.owner, self.member)
        self.owner_token = Token.objects.create(user=self.owner)
        self.member_token = Token.objects.create(user=self.member)
        self.outsider_token = Token.objects.create(user=self.outsider)

    async def test_group_call_invites_members_and_relays_only_between_call_participants(self):
        owner_socket = WebsocketCommunicator(
            application,
            f"/ws/notifications/?token={self.owner_token.key}",
        )
        member_socket = WebsocketCommunicator(
            application,
            f"/ws/notifications/?token={self.member_token.key}",
        )
        outsider_socket = WebsocketCommunicator(
            application,
            f"/ws/notifications/?token={self.outsider_token.key}",
        )
        owner_connected, _ = await owner_socket.connect()
        member_connected, _ = await member_socket.connect()
        outsider_connected, _ = await outsider_socket.connect()
        self.assertTrue(owner_connected)
        self.assertTrue(member_connected)
        self.assertTrue(outsider_connected)

        async def receive_type(socket, event_type):
            while True:
                message = await socket.receive_json_from(timeout=2)
                if message.get("type") == event_type:
                    return message

        call_id = "7c441e14-385e-4c18-b32e-d8aa8a8c14ee"
        await owner_socket.send_json_to({
            "type": "call_invite",
            "call_id": call_id,
            "conversation_id": self.conversation.pk,
            "media_type": "video",
        })
        invite = await receive_type(member_socket, "call_invite")
        self.assertEqual(invite["type"], "call_invite")
        self.assertEqual(invite["caller_id"], self.owner.pk)
        self.assertEqual(invite["media_type"], "video")

        call = await database_sync_to_async(CallSession.objects.get)(call_id=call_id)
        self.assertTrue(await database_sync_to_async(call.participants.filter(pk=self.owner.pk).exists)())

        await member_socket.send_json_to({"type": "call_join", "call_id": call_id})
        owner_joined = await receive_type(owner_socket, "call_participant_joined")
        self.assertEqual(owner_joined["type"], "call_participant_joined")
        self.assertEqual(owner_joined["user_id"], self.member.pk)
        roster = await receive_type(member_socket, "call_roster")
        self.assertEqual(roster["type"], "call_roster")
        self.assertEqual([item["id"] for item in roster["participants"]], [self.owner.pk])

        await member_socket.send_json_to({
            "type": "call_signal",
            "call_id": call_id,
            "target_user_id": self.owner.pk,
            "signal": {"candidate": {"candidate": "test-candidate"}},
        })
        relayed = await receive_type(owner_socket, "call_signal")
        self.assertEqual(relayed["type"], "call_signal")
        self.assertEqual(relayed["from_user_id"], self.member.pk)

        await outsider_socket.send_json_to({
            "type": "call_signal",
            "call_id": call_id,
            "target_user_id": self.owner.pk,
            "signal": {"candidate": {"candidate": "forbidden"}},
        })
        denied = await receive_type(outsider_socket, "error")
        self.assertEqual(denied["type"], "error")
        self.assertEqual(
            denied["detail"],
            "You cannot signal this call participant.",
        )

        await owner_socket.disconnect()
        await member_socket.disconnect()
        await outsider_socket.disconnect()
