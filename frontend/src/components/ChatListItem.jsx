import React, { useState } from "react";
import {
  FiArchive,
  FiCheckSquare,
  FiInfo,
  FiMessageCircle,
  FiMoreVertical,
  FiBellOff,
  FiPhone,
  FiSlash,
  FiStar,
  FiTrash2,
  FiUnlock,
  FiVideo,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import Avatar from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { translate } from "../utils/translate";
import ChatInformationDialog from "./ChatInformationDialog";

function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export default function ChatListItem({
  conversation,
  isActive,
  isOnline,
  lastSeen,
  onClick,
  onAction,
  selectionMode,
  selected,
  onToggleSelected,
  onEnableSelection,
}) {
  const { user, settings } = useAuth();
  const {
    removeGroupMember,
    addGroupMembers,
    updateGroupInformation,
    deleteGroupConversation,
    startCall,
  } = useChat();
  const t = (text) => translate(settings?.app_language, text);
  const [menuOpen, setMenuOpen] = useState(false);
  const [informationOpen, setInformationOpen] = useState(false);
  const [avatarActionsOpen, setAvatarActionsOpen] = useState(false);
  const [chatTheme, setChatTheme] = useState("default");
  const other = conversation.other_user;
  const lastMessage = conversation.last_message;
  const name = conversation.is_group
    ? conversation.group_name
    : other?.full_name || other?.username || "Unknown user";
  const itemClick = () => {
    if (selectionMode) onToggleSelected(conversation.id);
    else onClick();
  };

  const runAction = (action) => {
    if (["delete", "clear"].includes(action)) {
      const prompt = action === "delete"
        ? `Delete this chat with ${name} from your chat list?`
        : `Clear all messages in your chat with ${name}?`;
      if (!window.confirm(prompt)) return;
    }
    setMenuOpen(false);
    onAction(conversation, action);
  };

  const openInformation = (event) => {
    event?.stopPropagation();
    setAvatarActionsOpen(false);
    setMenuOpen(false);
    setChatTheme(
      localStorage.getItem(`chat-theme:${user.id}:${conversation.id}`)
        || settings?.default_chat_theme
        || "default"
    );
    setInformationOpen(true);
  };

  const changeTheme = (theme) => {
    setChatTheme(theme);
    localStorage.setItem(`chat-theme:${user.id}:${conversation.id}`, theme);
  };

  return (
    <>
      <div
        className={`chat-list-item ${isActive ? "chat-list-item--active" : ""} ${
          selected ? "chat-list-item--selected" : ""
        }`}
        onClick={itemClick}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            itemClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
      {selectionMode ? (
        <input
          className="chat-list-checkbox"
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(conversation.id)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${name}`}
        />
      ) : (
        <button
          type="button"
          className="chat-list-avatar-trigger"
          aria-label={t(`Open ${name} photo and actions`)}
          onClick={(event) => {
            event.stopPropagation();
            setAvatarActionsOpen(true);
          }}
        >
          <Avatar
            name={name}
            src={conversation.is_group ? conversation.group_image : other?.profile_image}
            size={48}
            online={conversation.is_group ? undefined : isOnline}
          />
        </button>
      )}
      <div className="chat-list-item-body">
        <div className="chat-list-item-row">
          <span className="chat-list-item-name">{name}</span>
          <span className="chat-list-item-time">{formatTime(lastMessage?.created_at)}</span>
        </div>
        <div className="chat-list-item-row">
          <span className="chat-list-item-preview">
            {conversation.is_blocked ? t("Blocked chat") : lastMessage ? t(lastMessage.message) : t("Say hello 👋")}
          </span>
          <span className="chat-list-item-indicators">
            {conversation.is_favorite && <FiStar className="chat-list-favorite" title={t("Favorite")} />}
            {conversation.is_pinned && <BsPinAngleFill title="Pinned" />}
            {conversation.is_muted && <FiBellOff title="Muted" />}
            {conversation.unread_count > 0 && (
              <span className="unread-badge">{conversation.unread_count}</span>
            )}
          </span>
        </div>
      </div>
      {!selectionMode && (
        <div className="chat-list-actions">
          <button
            className="chat-list-more"
            aria-label={`Options for ${name}`}
            aria-expanded={menuOpen}
            title="Chat options"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <FiMoreVertical size={18} />
          </button>
          {menuOpen && (
            <div
              className="chat-list-menu"
              role="menu"
              onClick={(event) => event.stopPropagation()}
            >
              <button className="chat-list-menu-item" role="menuitem" onClick={openInformation}>
                <FiInfo /> {t("Information")}
              </button>
              <button className="chat-list-menu-item" role="menuitem" onClick={() => runAction("delete")}>
                <FiTrash2 /> {t("Delete")}
              </button>
              {!conversation.is_group && (
                <button
                  className="chat-list-menu-item"
                  role="menuitem"
                  onClick={() => runAction(conversation.is_blocked_by_me ? "unblock" : "block")}
                >
                  {conversation.is_blocked_by_me ? <FiUnlock /> : <FiSlash />}
                  {t(conversation.is_blocked_by_me ? "Unblock" : "Block")}
                </button>
              )}
              <button className="chat-list-menu-item" role="menuitem" onClick={() => runAction("pin")}>
                {conversation.is_pinned ? <BsPinAngle /> : <BsPinAngleFill />}
                {t(conversation.is_pinned ? "Unpin" : "Pin")}
              </button>
              <button className="chat-list-menu-item" role="menuitem" onClick={() => runAction("mute")}>
                <FiBellOff /> {t(conversation.is_muted ? "Unmute" : "Mute")}
              </button>
              <button
                className="chat-list-menu-item"
                role="menuitem"
                onClick={() => runAction(conversation.is_archived ? "unarchive" : "archive")}
              >
                <FiArchive /> {t(conversation.is_archived ? "Unarchive chat" : "Archive chat")}
              </button>
              <button className="chat-list-menu-item" role="menuitem" onClick={() => runAction("mark_unread")}>
                <FiCheckSquare /> {t("Mark as unread")}
              </button>
              <button
                className="chat-list-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onEnableSelection(conversation.id);
                }}
              >
                <FiCheckSquare /> {t("Select multiple contacts")}
              </button>
              <button
                className="chat-list-menu-item chat-list-menu-item--danger"
                role="menuitem"
                onClick={() => runAction("clear")}
              >
                <FiXCircle /> {t("Clear chat")}
              </button>
            </div>
          )}
        </div>
      )}
      </div>
      {avatarActionsOpen && (
        <div
          className="message-modal-backdrop chat-avatar-actions-backdrop"
          onClick={() => setAvatarActionsOpen(false)}
        >
          <section
            className="chat-avatar-actions-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t(`${name} photo and actions`)}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-btn chat-avatar-actions-close"
              aria-label={t("Close")}
              title={t("Close")}
              onClick={() => setAvatarActionsOpen(false)}
            >
              <FiX />
            </button>
            <div className="chat-avatar-actions-photo">
              <Avatar
                name={name}
                src={conversation.is_group ? conversation.group_image : other?.profile_image}
                size={216}
              />
            </div>
            <h2>{name}</h2>
            {!conversation.is_group && other?.username && <p>@{other.username}</p>}
            <div className="chat-avatar-actions-buttons">
              <button
                type="button"
                className="chat-avatar-action"
                title={t("Start voice call")}
                aria-label={t("Start voice call")}
                onClick={() => {
                  if (startCall(conversation, "audio")) setAvatarActionsOpen(false);
                }}
              >
                <FiPhone />
                <span>{t("Voice")}</span>
              </button>
              <button
                type="button"
                className="chat-avatar-action"
                title={t("Start video call")}
                aria-label={t("Start video call")}
                onClick={() => {
                  if (startCall(conversation, "video")) setAvatarActionsOpen(false);
                }}
              >
                <FiVideo />
                <span>{t("Video")}</span>
              </button>
              <button
                type="button"
                className="chat-avatar-action"
                onClick={() => {
                  setAvatarActionsOpen(false);
                  itemClick();
                }}
              >
                <FiMessageCircle />
                <span>{t("Chat")}</span>
              </button>
              <button
                type="button"
                className="chat-avatar-action"
                onClick={openInformation}
              >
                <FiInfo />
                <span>{t("Information")}</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {informationOpen && (
        <ChatInformationDialog
          conversation={{
            ...conversation,
            other_user: conversation.is_group
              ? conversation.other_user
              : {
                  ...conversation.other_user,
                  is_online: isOnline ?? conversation.other_user?.is_online,
                  last_seen: lastSeen ?? conversation.other_user?.last_seen,
                },
          }}
          chatTheme={chatTheme}
          onThemeChange={changeTheme}
          onRemoveMember={removeGroupMember}
          onAddMembers={addGroupMembers}
          onUpdateGroupInformation={updateGroupInformation}
          onDeleteGroup={deleteGroupConversation}
          onToggleMute={() => onAction(conversation, "mute")}
          onClose={() => setInformationOpen(false)}
        />
      )}
    </>
  );
}
