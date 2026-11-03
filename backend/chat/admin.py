from django.contrib import admin

from .models import Conversation, Message, Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "full_name", "mobile_number", "is_online", "last_seen"]
    search_fields = ["user__username", "full_name", "mobile_number"]


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "created_at", "updated_at"]
    filter_horizontal = ["participants"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "sender", "receiver", "message_type", "is_delivered", "is_read", "created_at"]
    list_filter = ["message_type", "is_delivered", "is_read"]
    search_fields = ["message", "sender__username", "receiver__username"]
