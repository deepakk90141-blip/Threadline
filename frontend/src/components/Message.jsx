import React, { useState } from "react";
import {
  FiCheck,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiInfo,
  FiMoreVertical,
  FiShare2,
  FiStar,
  FiTrash2,
} from "react-icons/fi";
import { BsCheckAll } from "react-icons/bs";
import { useAuth } from "../context/AuthContext";
import { translate } from "../utils/translate";

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Message({
  message,
  isOwn,
  isAdminMessage = false,
  senderName,
  onDeleteForMe,
  onDeleteForEveryone,
  onStar,
  onForward,
  onReply,
  onSenderClick,
  selectable = false,
  selected = false,
  onToggleSelected,
}) {
  const { settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOptionsOpen, setDeleteOptionsOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const deleted = message.is_deleted_for_everyone;

  const shareMessage = async () => {
    const text = message.message || t("Shared message");
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Shared message",
          text,
          ...(message.attachment ? { url: message.attachment } : {}),
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          message.attachment ? `${text}\n${message.attachment}` : text
        );
      } else {
        window.prompt("Copy this message to share:", text);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Could not share the message:", error);
      }
    }
    setMenuOpen(false);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setDeleteOptionsOpen(false);
  };

  return (
    <>
      <div className={`message-row ${isOwn ? "message-row--own" : ""} ${selected ? "message-row--selected" : ""}`}>
        {selectable && (
          <input
            className="message-select-checkbox"
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={t(selected ? "Deselect message" : "Select message")}
          />
        )}
        <div
          className={`message-bubble ${isOwn ? "message-bubble--own" : "message-bubble--other"} ${
            deleted ? "message-bubble--deleted" : ""
          } ${isAdminMessage && !deleted ? "message-bubble--admin" : ""}`}
        >
          <div className="message-actions">
            {message.is_starred && <FiStar className="message-starred" size={14} fill="currentColor" />}
            {!deleted && (
              <>
                <button
                  className="message-more"
                  onClick={() => {
                    setMenuOpen((open) => !open);
                    setDeleteOptionsOpen(false);
                  }}
                  aria-label="Message actions"
                  aria-expanded={menuOpen}
                  title="Message actions"
                >
                  <FiMoreVertical size={16} />
                </button>
                {menuOpen && (
                  <div className="message-menu" role="menu">
                    <button
                      className="message-menu-item"
                      role="menuitem"
                      onClick={() => {
                        onReply(message);
                        closeMenu();
                      }}
                    >
                      <FiCornerUpLeft size={15} /> {t("Reply")}
                    </button>
                    <button
                      className="message-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShowInfo(true);
                        closeMenu();
                      }}
                    >
                      <FiInfo size={15} /> {t("Information")}
                    </button>
                    <button
                      className="message-menu-item"
                      role="menuitem"
                      onClick={() => {
                        onStar(message.id);
                        closeMenu();
                      }}
                    >
                      <FiStar size={15} /> {message.is_starred ? t("Unstar") : t("Star")}
                    </button>
                    <button
                      className="message-menu-item"
                      role="menuitem"
                      onClick={() => {
                        onForward(message);
                        closeMenu();
                      }}
                    >
                      <FiCornerUpRight size={15} /> {t("Forward")}
                    </button>
                    <button className="message-menu-item" role="menuitem" onClick={shareMessage}>
                      <FiShare2 size={15} /> {t("Share")}
                    </button>
                    <button
                      className="message-menu-item"
                      role="menuitem"
                      onClick={() => setDeleteOptionsOpen((open) => !open)}
                      aria-expanded={deleteOptionsOpen}
                    >
                      <FiTrash2 size={15} /> {t("Delete")}
                    </button>
                    {deleteOptionsOpen && (
                      <div className="message-delete-options">
                        <button
                          className="message-menu-item"
                          role="menuitem"
                          onClick={() => {
                            onDeleteForMe(message.id);
                            closeMenu();
                          }}
                        >
                          {t("Delete for me")}
                        </button>
                        {isOwn && (
                          <button
                            className="message-menu-item message-menu-item--danger"
                            role="menuitem"
                            onClick={() => {
                              onDeleteForEveryone(message.id);
                              closeMenu();
                            }}
                          >
                            {t("Delete for everyone")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {(senderName || isAdminMessage) && !deleted && (
            <div className="message-sender-line">
              {senderName && (
                <button
                  type="button"
                  className="message-sender-name"
                  onClick={() => onSenderClick?.(message.sender)}
                  disabled={!onSenderClick}
                  title={onSenderClick ? t("View contact information") : undefined}
                >
                  {senderName}
                </button>
              )}
              {isAdminMessage && <span className="message-admin-badge">{t("Admin")}</span>}
            </div>
          )}
          {message.is_forwarded && !deleted && <span className="message-forwarded">{t("Forwarded")}</span>}
          {message.reply_preview && !deleted && (
            <div className="message-reply-preview">
              <strong>{message.reply_preview.sender_username}</strong>
              <span>
                {message.reply_preview.is_deleted_for_everyone
                  ? t("This message was deleted")
                  : message.reply_preview.message || t("Attachment")}
              </span>
            </div>
          )}
          <p className={`message-text ${deleted ? "message-text--deleted" : ""}`}>{t(message.message)}</p>
          {message.attachment && !deleted && (
            <a className="message-attachment" href={message.attachment} target="_blank" rel="noreferrer">
              {t("Open attachment")}
            </a>
          )}
          <div className="message-meta">
            <span className="message-time">{formatTime(message.created_at)}</span>
            {isOwn && (
              <span className={`message-status ${message.is_read ? "message-status--read" : ""}`}>
                {message.is_delivered || message.is_read ? <BsCheckAll size={16} /> : <FiCheck size={16} />}
              </span>
            )}
          </div>
        </div>
      </div>
      {showInfo && (
        <div className="message-modal-backdrop" onClick={() => setShowInfo(false)}>
          <section
            className="message-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`message-info-${message.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`message-info-${message.id}`}>{t("Message information")}</h2>
            <p className="message-info-content">{t(message.message || "Attachment")}</p>
            <dl>
              <div>
                <dt>{t("Sent")}</dt>
                <dd>{formatDateTime(message.created_at)}</dd>
              </div>
              {isOwn && (
                <div>
                  <dt>{t("Delivery")}</dt>
                  <dd>{t(message.is_read ? "Read" : message.is_delivered ? "Delivered" : "Sent")}</dd>
                </div>
              )}
              {message.is_starred && (
                <div>
                  <dt>{t("Saved")}</dt>
                  <dd>{t("Starred")}</dd>
                </div>
              )}
            </dl>
            <button className="message-info-close" onClick={() => setShowInfo(false)}>
              {t("Close")}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
