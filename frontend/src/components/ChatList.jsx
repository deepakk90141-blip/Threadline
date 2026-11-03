import React, { useState } from "react";
import { FiArchive, FiUsers, FiX } from "react-icons/fi";
import UserSearch from "./UserSearch";
import ChatListItem from "./ChatListItem";
import GroupCreateDialog from "./GroupCreateDialog";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { translate } from "../utils/translate";

export default function ChatList({ onSelectConversation }) {
  const { settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const {
    conversations,
    activeConversation,
    openConversation,
    onlineStatus,
    performConversationAction,
    chatError,
    setChatError,
  } = useChat();
  const [showArchived, setShowArchived] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const visibleConversations = conversations.filter(
    (conversation) => Boolean(conversation.is_archived) === showArchived
  );

  const handleClick = (conversation) => {
    if (selectionMode) {
      toggleSelected(conversation.id);
      return;
    }
    onSelectConversation?.();
    openConversation(conversation);
  };

  const toggleSelected = (conversationId) => {
    setSelectedIds((selected) =>
      selected.includes(conversationId)
        ? selected.filter((id) => id !== conversationId)
        : [...selected, conversationId]
    );
  };

  const enableSelection = (conversationId) => {
    setSelectionMode(true);
    setSelectedIds([conversationId]);
  };

  const handleBulkAction = async (action) => {
    if (!selectedIds.length) return;
    if (["delete", "clear"].includes(action)) {
      const text = action === "delete"
        ? `Delete ${selectedIds.length} selected chats from your list?`
        : `Clear messages in ${selectedIds.length} selected chats?`;
      if (!window.confirm(text)) return;
    }
    const success = await performConversationAction(selectedIds, action);
    if (success) {
      setSelectedIds([]);
      setSelectionMode(false);
    }
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  return (
    <div className="chat-list">
      <UserSearch onStarted={onSelectConversation} />
      {chatError && (
        <div className="chat-error chat-list-error">
          <span>{chatError}</span>
          <button onClick={() => setChatError("")}>{t("Dismiss")}</button>
        </div>
      )}
      <div className="chat-list-controls">
        <button
          className={`chat-list-tab ${showArchived ? "chat-list-tab--active" : ""}`}
          onClick={() => {
            setShowArchived(false);
            cancelSelection();
          }}
        >
          {t("Chats")}
        </button>
        <button
          className={`chat-list-tab ${showArchived ? "chat-list-tab--active" : ""}`}
          onClick={() => {
            setShowArchived(true);
            cancelSelection();
          }}
        >
          <FiArchive size={14} /> {t("Archived")}
        </button>
        {!showArchived && !selectionMode && (
          <button
            className="chat-list-new-group"
            onClick={() => setShowGroupDialog(true)}
            title={t("Create group")}
          >
            <FiUsers size={15} /> {t("New group")}
          </button>
        )}
      </div>
      {selectionMode && (
        <div className="chat-selection-toolbar">
          <span>{selectedIds.length} {t("selected")}</span>
          <button
            onClick={() => handleBulkAction(showArchived ? "unarchive" : "archive")}
            title={showArchived ? "Unarchive selected chats" : "Archive selected chats"}
          >
            <FiArchive /> {t(showArchived ? "Unarchive" : "Archive")}
          </button>
          <button onClick={() => handleBulkAction("mute")} title="Mute selected chats">
            {t("Mute")}
          </button>
          <button onClick={() => handleBulkAction("clear")} title="Clear selected chats">
            {t("Clear")}
          </button>
          <button onClick={() => handleBulkAction("delete")} title="Delete selected chats">
            {t("Delete")}
          </button>
          <button className="chat-selection-cancel" onClick={cancelSelection} title="Cancel selection">
            <FiX />
          </button>
        </div>
      )}
      <div className="chat-list-scroll">
        {visibleConversations.length === 0 && (
          <div className="chat-list-empty">
            {showArchived
              ? t("No archived chats.")
              : conversations.length === 0
                ? t("No conversations yet. Search for someone above to say hello.")
                : t("No chats to show.")}
          </div>
        )}
        {visibleConversations.map((conversation) => {
          const isActive = activeConversation?.id === conversation.id;
          const liveOnline = onlineStatus[conversation.other_user?.id]?.is_online;
          return (
            <ChatListItem
              key={conversation.id}
              // the chat you're looking at can't have unread messages
              conversation={isActive ? { ...conversation, unread_count: 0 } : conversation}
              isActive={isActive}
              isOnline={liveOnline ?? conversation.other_user?.is_online}
              lastSeen={onlineStatus[conversation.other_user?.id]?.last_seen ?? conversation.other_user?.last_seen}
              onClick={() => handleClick(conversation)}
              onAction={(item, action) => performConversationAction([item.id], action)}
              selectionMode={selectionMode}
              selected={selectedIds.includes(conversation.id)}
              onToggleSelected={toggleSelected}
              onEnableSelection={enableSelection}
            />
          );
        })}
      </div>
      {showGroupDialog && (
        <GroupCreateDialog
          onClose={() => setShowGroupDialog(false)}
          onCreated={() => {
            setShowGroupDialog(false);
            onSelectConversation?.();
          }}
        />
      )}
    </div>
  );
}
