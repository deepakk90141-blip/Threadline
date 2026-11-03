from django.urls import path

from . import views

urlpatterns = [
    # Auth
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.CurrentUserView.as_view(), name="current-user"),
    path("settings/", views.ProfileSettingsView.as_view(), name="profile-settings"),
    path("account/", views.AccountSettingsView.as_view(), name="account-settings"),
    path("contacts/blocked/", views.BlockedContactsView.as_view(), name="blocked-contacts"),
    path("contacts/blocked/<int:pk>/", views.BlockedContactsView.as_view(), name="blocked-contact-delete"),
    # Users
    path("users/", views.UserListView.as_view(), name="user-list"),
    path("users/search/", views.UserSearchView.as_view(), name="user-search"),
    # Conversations
    path("conversations/", views.ConversationListView.as_view(), name="conversation-list"),
    path("conversations/create/", views.ConversationCreateView.as_view(), name="conversation-create"),
    path("conversations/groups/create/", views.GroupConversationCreateView.as_view(), name="group-conversation-create"),
    path(
        "conversations/<int:conversation_id>/members/<int:user_id>/remove/",
        views.GroupMemberRemoveView.as_view(),
        name="group-member-remove",
    ),
    path(
        "conversations/<int:conversation_id>/members/add/",
        views.GroupMemberAddView.as_view(),
        name="group-member-add",
    ),
    path(
        "conversations/<int:conversation_id>/group/",
        views.GroupConversationDeleteView.as_view(),
        name="group-conversation-delete",
    ),
    path(
        "conversations/<int:conversation_id>/information/",
        views.GroupInformationView.as_view(),
        name="group-information",
    ),
    path("conversations/actions/", views.ConversationActionView.as_view(), name="conversation-actions"),
    path("conversations/<int:conversation_id>/messages/", views.ConversationMessagesView.as_view(), name="conversation-messages"),
    path("conversations/<int:pk>/delete/", views.ConversationDeleteView.as_view(), name="conversation-delete"),
    # Messages
    path("messages/", views.MessageCreateView.as_view(), name="message-create"),
    path("messages/collection/", views.MessageCollectionView.as_view(), name="message-collection"),
    path("messages/expire/", views.ExpiredMessagesView.as_view(), name="expire-messages"),
    path("messages/<int:pk>/action/", views.MessageActionView.as_view(), name="message-action"),
]
