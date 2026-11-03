import React, { useEffect, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiBell,
  FiCheckSquare,
  FiInfo,
  FiMoreVertical,
  FiSearch,
  FiStar,
  FiTrash2,
  FiWifi,
  FiWifiOff,
  FiX,
} from "react-icons/fi";
import { userAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { translate } from "../utils/translate";
import { chatThemes } from "../utils/chatThemes";
import { useChat } from "../context/ChatContext";
import Avatar from "./Avatar";
import ChatInformationDialog from "./ChatInformationDialog";
import Message from "./Message";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";

function formatLastSeen(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return isToday ? `last seen today at ${time}` : `last seen ${date.toLocaleDateString()} at ${time}`;
}

const STATUS_LABEL = {
  connecting: "Connecting...",
  connected: "Connected",
  reconnecting: "Reconnecting...",
  offline: "Offline",
};

export default function ChatWindow({ onBack }) {
  const { user, settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const {
    activeConversation,
    messages,
    loadingMessages,
    chatError,
    setChatError,
    connectionStatus,
    typingUsers,
    onlineStatus,
    retryConnection,
    deleteMessageForMe,
    deleteMessageForEveryone,
    toggleMessageStar,
    forwardMessage,
    closeConversation,
    performConversationAction,
    removeGroupMember,
    addGroupMembers,
    updateGroupInformation,
    deleteGroupConversation,
  } = useChat();

  const bottomRef = useRef(null);
  const searchInputRef = useRef(null);
  const previousCount = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [chatTheme, setChatTheme] = useState("default");
  const [informationOpen, setInformationOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [viewedContact, setViewedContact] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwardUsers, setForwardUsers] = useState([]);
  const [loadingForwardUsers, setLoadingForwardUsers] = useState(false);
  const [forwardingUserId, setForwardingUserId] = useState(null);

  const other = activeConversation?.other_user;
  const otherIsTyping = activeConversation?.is_group
    ? activeConversation.participants?.some(
        (participant) => participant.id !== user.id && typingUsers[participant.id]
      )
    : Boolean(typingUsers[other?.id]);

  // Auto-scroll to the newest message (instantly on first load, smoothly after).
  useEffect(() => {
    const behavior = previousCount.current === 0 ? "auto" : "smooth";
    bottomRef.current?.scrollIntoView({ behavior });
    previousCount.current = messages.length;
  }, [messages.length, otherIsTyping]);

  useEffect(() => {
    previousCount.current = 0;
    setSearchOpen(false);
    setSearchQuery("");
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setDeleteMenuOpen(false);
    setMenuOpen(false);
    setThemePickerOpen(false);
    setInformationOpen(false);
    setReplyingTo(null);
    setViewedContact(null);
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation || !user) return;
    const storedTheme = localStorage.getItem(`chat-theme:${user.id}:${activeConversation.id}`);
    setChatTheme(storedTheme || settings?.default_chat_theme || "default");
  }, [activeConversation?.id, user?.id, settings?.default_chat_theme]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  if (!activeConversation) return null;

  const liveStatus = onlineStatus[other?.id];
  const isOnline = liveStatus?.is_online ?? other?.is_online;
  const lastSeen = liveStatus?.last_seen ?? other?.last_seen;
  const displayName = activeConversation.is_group
    ? activeConversation.group_name
    : other?.full_name || other?.username;
  const openGroupContact = (memberId) => {
    const member = activeConversation.participants?.find(
      (participant) => Number(participant.id) === Number(memberId)
    );
    if (member) setViewedContact(member);
  };

  const handleDeleteForEveryone = (id) => {
    if (window.confirm(t("Delete this message for everyone?"))) deleteMessageForEveryone(id);
  };

  const handleForward = async (message) => {
    setForwardingMessage(message);
    setLoadingForwardUsers(true);
    try {
      const res = await userAPI.list();
      setForwardUsers(res.data);
    } catch (error) {
      setChatError(error?.response?.data?.detail || t("Could not load chat members."));
      setForwardingMessage(null);
    } finally {
      setLoadingForwardUsers(false);
    }
  };

  const handleForwardToUser = async (targetUser) => {
    if (!forwardingMessage) return;
    setForwardingUserId(targetUser.id);
    const sent = await forwardMessage(forwardingMessage.id, targetUser.id);
    setForwardingUserId(null);
    if (sent) setForwardingMessage(null);
  };

  const runConversationAction = async (action) => {
    setMenuOpen(false);
    setThemePickerOpen(false);
    if (action === "clear" && !window.confirm(t("Clear all messages in this chat?"))) return;
    await performConversationAction([activeConversation.id], action);
  };

  const chooseChatTheme = (theme) => {
    setChatTheme(theme);
    localStorage.setItem(`chat-theme:${user.id}:${activeConversation.id}`, theme);
    setMenuOpen(false);
    setThemePickerOpen(false);
  };

  const toggleMessageSelection = (messageId) => {
    setSelectedMessageIds((selected) =>
      selected.includes(messageId)
        ? selected.filter((id) => id !== messageId)
        : [...selected, messageId]
    );
  };

  const deleteSelectedMessages = async (action) => {
    if (!selectedMessageIds.length) return;
    const selectedMessages = messages.filter((message) => selectedMessageIds.includes(message.id));
    if (
      action === "delete_for_everyone" &&
      (selectedMessages.length !== selectedMessageIds.length ||
        selectedMessages.some((message) => message.sender !== user.id))
    ) {
      setDeleteMenuOpen(false);
      return;
    }
    const confirmation =
      action === "delete_for_everyone"
        ? "Delete selected messages for everyone?"
        : "Delete selected messages for me?";
    if (!window.confirm(t(confirmation))) return;
    await Promise.all(
      selectedMessages.map((message) =>
        action === "delete_for_everyone" && message.sender === user.id
          ? deleteMessageForEveryone(message.id)
          : deleteMessageForMe(message.id)
      )
    );
    setSelectedMessageIds([]);
    setSelectionMode(false);
    setDeleteMenuOpen(false);
  };

  const pillClickable = connectionStatus === "offline";
  const query = searchQuery.trim().toLocaleLowerCase();
  const displayedMessages = query
    ? messages.filter((message) => message.message?.toLocaleLowerCase().includes(query))
    : messages;
  return (
    <div className="chat-window">
      <header className="chat-window-header">
        <button className="icon-btn back-btn" onClick={onBack} title={t("Back")}>
          <FiArrowLeft size={20} />
        </button>
        <Avatar
          name={displayName}
          src={activeConversation.is_group ? activeConversation.group_image : other?.profile_image}
          size={40}
          online={activeConversation.is_group ? undefined : isOnline}
        />
        <div className="chat-window-header-info">
          <span className="chat-window-header-name">{displayName}</span>
          <span className="chat-window-header-status">
            {otherIsTyping ? t("typing...") : isOnline ? t("Online") : formatLastSeen(lastSeen)}
          </span>
        </div>
        <button
          className={`connection-pill connection-pill--${connectionStatus} ${pillClickable ? "connection-pill--clickable" : ""}`}
          onClick={pillClickable ? retryConnection : undefined}
          title={pillClickable ? "Click to retry" : undefined}
        >
          {connectionStatus === "connected" ? <FiWifi size={13} /> : <FiWifiOff size={13} />}
          <span>{t(STATUS_LABEL[connectionStatus])}</span>
        </button>
        <div className="chat-header-actions">
          {selectionMode ? (
            <>
              <span className="selected-message-count">
                {selectedMessageIds.length} {t("selected")}
              </span>
              <button
                className="icon-btn"
                onClick={() => setDeleteMenuOpen((open) => !open)}
                disabled={!selectedMessageIds.length}
                title={t("Delete selected messages")}
                aria-label={t("Delete selected messages")}
                aria-expanded={deleteMenuOpen}
              >
                <FiTrash2 size={18} />
              </button>
              {deleteMenuOpen && (
                <div className="chat-header-menu chat-delete-menu" role="menu">
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    onClick={() => deleteSelectedMessages("delete_for_me")}
                  >
                    <FiTrash2 /> {t("Delete for me")}
                  </button>
                  {selectedMessageIds.length > 0 &&
                    messages.filter((message) => selectedMessageIds.includes(message.id)).length ===
                      selectedMessageIds.length &&
                    messages
                      .filter((message) => selectedMessageIds.includes(message.id))
                      .every((message) => message.sender === user.id) && (
                      <button
                        className="chat-list-menu-item chat-list-menu-item--danger"
                        role="menuitem"
                        onClick={() => deleteSelectedMessages("delete_for_everyone")}
                      >
                        <FiTrash2 /> {t("Delete for everyone")}
                      </button>
                    )}
                </div>
              )}
              <button
                className="icon-btn"
                onClick={() => {
                  setDeleteMenuOpen(false);
                  setSelectionMode(false);
                  setSelectedMessageIds([]);
                }}
                title={t("Cancel selection")}
              >
                <FiX size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                className="chat-header-more"
                aria-label={t("Chat options")}
                aria-expanded={menuOpen}
                title={t("Chat options")}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <FiMoreVertical size={20} />
              </button>
              {menuOpen && (
                <div className="chat-header-menu" role="menu">
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setInformationOpen(true);
                    }}
                  >
                    <FiInfo /> {t("Information")}
                  </button>
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSearchOpen((open) => !open);
                      setSearchQuery("");
                    }}
                  >
                    <FiSearch /> {t("Search")}
                  </button>
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSelectionMode(true);
                    }}
                  >
                    <FiCheckSquare /> {t("Select message")}
                  </button>
                  <button className="chat-list-menu-item" role="menuitem" onClick={() => runConversationAction("mute")}>
                    <FiBell /> {t(activeConversation.is_muted ? "Unmute notification" : "Mute notification")}
                  </button>
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    aria-expanded={themePickerOpen}
                    onClick={() => setThemePickerOpen((open) => !open)}
                  >
                    <span className="chat-theme-menu-icon" /> {t("Chat theme")}
                  </button>
                  {themePickerOpen && (
                    <div className="chat-theme-options" role="group" aria-label={t("Chat theme")}>
                      {chatThemes.map((theme) => (
                        <button
                          key={theme.name}
                          className={`chat-theme-swatch ${chatTheme === theme.name ? "chat-theme-swatch--selected" : ""}`}
                          style={{ backgroundColor: theme.color }}
                          aria-label={t(theme.name === "default" ? "Default" : theme.name)}
                          title={t(theme.name === "default" ? "Default" : theme.name)}
                          onClick={() => chooseChatTheme(theme.name)}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    onClick={() => runConversationAction("favorite")}
                  >
                    <FiStar /> {t(activeConversation.is_favorite ? "Remove from favorites" : "Add to favorite")}
                  </button>
                  <button
                    className="chat-list-menu-item chat-list-menu-item--danger"
                    role="menuitem"
                    onClick={() => runConversationAction("clear")}
                  >
                    <FiTrash2 /> {t("Clear chat")}
                  </button>
                  <button
                    className="chat-list-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      closeConversation();
                    }}
                  >
                    <FiX /> {t("Close chat")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="chat-message-search">
          <FiSearch size={17} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("Search in chat")}
            aria-label={t("Search in chat")}
          />
          <button
            className="icon-btn"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            title={t("Close search")}
          >
            <FiX size={18} />
          </button>
        </div>
      )}

      {chatError && (
        <div className="chat-error">
          <span>{chatError}</span>
          <button onClick={() => setChatError("")}>{t("Dismiss error")}</button>
        </div>
      )}

      {informationOpen && (
        <ChatInformationDialog
          conversation={{
            ...activeConversation,
            other_user: other ? { ...other, is_online: isOnline, last_seen: lastSeen } : other,
          }}
          chatTheme={chatTheme}
          onThemeChange={chooseChatTheme}
          onRemoveMember={removeGroupMember}
          onAddMembers={addGroupMembers}
          onUpdateGroupInformation={updateGroupInformation}
          onDeleteGroup={deleteGroupConversation}
          onToggleMute={() => runConversationAction("mute")}
          onClose={() => setInformationOpen(false)}
        />
      )}

      {activeConversation.is_blocked && (
        <div className="chat-blocked-notice">
          {t("This chat is blocked. Unblock the contact from the chat options to send messages.")}
        </div>
      )}

      <div
        className={`chat-window-messages${chatTheme !== "default" ? ` chat-window-messages--${chatTheme}` : ""}`}
        style={chatTheme === "default" ? undefined : { "--chat-theme-bg": chatThemes.find((theme) => theme.name === chatTheme)?.color }}
      >
        {loadingMessages && <div className="chat-loading">{t("Loading messages...")}</div>}
        {!loadingMessages && messages.length === 0 && (
          <div className="chat-loading">{t("No messages yet. Say hello 👋")}</div>
        )}
        {!loadingMessages && searchQuery && displayedMessages.length === 0 && (
          <div className="chat-loading">{t("No messages match your search.")}</div>
        )}
        {displayedMessages.map((message) => (
          <Message
            key={message.id}
            message={message}
            isOwn={message.sender === user.id}
            isAdminMessage={
              activeConversation.is_group &&
              Number(message.sender) === Number(activeConversation.group_admin_id)
            }
            senderName={activeConversation.is_group && message.sender !== user.id ? message.sender_username : ""}
            onDeleteForMe={deleteMessageForMe}
            onDeleteForEveryone={handleDeleteForEveryone}
            onStar={toggleMessageStar}
            onForward={handleForward}
            onReply={setReplyingTo}
            onSenderClick={
              activeConversation.is_group && Number(message.sender) !== Number(user.id)
                ? openGroupContact
                : undefined
            }
            selectable={selectionMode}
            selected={selectedMessageIds.includes(message.id)}
            onToggleSelected={() => toggleMessageSelection(message.id)}
          />
        ))}
        {otherIsTyping && <TypingIndicator name={displayName} />}
        <div ref={bottomRef} />
      </div>

      {forwardingMessage && (
        <div className="message-modal-backdrop" onClick={() => setForwardingMessage(null)}>
          <section
            className="forward-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forward-message-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="forward-message-title">{t("Forward message")}</h2>
            <p className="forward-message-preview">{t(forwardingMessage.message || "Attachment")}</p>
            {loadingForwardUsers ? (
              <p className="forward-empty">{t("Loading members...")}</p>
            ) : forwardUsers.length === 0 ? (
              <p className="forward-empty">{t("No other members found.")}</p>
            ) : (
              <div className="forward-user-list">
                {forwardUsers.map((member) => (
                  <button
                    className="forward-user"
                    key={member.id}
                    disabled={forwardingUserId !== null}
                    onClick={() => handleForwardToUser(member)}
                  >
                    <Avatar name={member.full_name || member.username} src={member.profile_image} size={36} />
                    <span>{member.full_name || member.username}</span>
                    {forwardingUserId === member.id && <span className="forward-sending">{t("Sending...")}</span>}
                  </button>
                ))}
              </div>
            )}
            <button className="message-info-close" onClick={() => setForwardingMessage(null)}>
              {t("Cancel")}
            </button>
          </section>
        </div>
      )}

      {/* key: a fresh input (empty draft) for every conversation */}
      <MessageInput
        key={activeConversation.id}
        disabled={activeConversation.is_blocked}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
      {viewedContact && (
        <section
          className="group-contact-page"
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-contact-page-title"
        >
          <header className="group-contact-page-header">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setViewedContact(null)}
              aria-label={t("Back to group")}
              title={t("Back to group")}
            >
              <FiArrowLeft />
            </button>
            <h2 id="group-contact-page-title">{t("Contact information")}</h2>
          </header>
          <div className="group-contact-page-content">
            <section className="group-contact-card">
              <Avatar
                name={viewedContact.full_name || viewedContact.username}
                src={viewedContact.profile_image}
                size={104}
                online={viewedContact.is_online}
              />
              <h1>{viewedContact.full_name || viewedContact.username}</h1>
              <p className="group-contact-username">@{viewedContact.username}</p>
              {Number(viewedContact.id) === Number(activeConversation.group_admin_id) && (
                <span className="chat-admin-badge">{t("Admin")}</span>
              )}
            </section>
            <section className="group-contact-details">
              <article>
                <h3>{t("About")}</h3>
                <p>{viewedContact.bio || t("No bio shared.")}</p>
              </article>
              <article>
                <h3>{t("Activity")}</h3>
                <p>
                  {viewedContact.is_online
                    ? t("Online")
                    : viewedContact.last_seen
                      ? formatLastSeen(viewedContact.last_seen)
                      : t("Last seen hidden")}
                </p>
              </article>
            </section>
            <button
              type="button"
              className="group-contact-back-button"
              onClick={() => setViewedContact(null)}
            >
              <FiArrowLeft /> {t("Back to group")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
