import React, { useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiLogOut,
  FiMessageCircle,
  FiMoreVertical,
  FiSettings,
  FiShare2,
  FiStar,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { messageAPI } from "../services/api";
import { translate } from "../utils/translate";
import Avatar from "./Avatar";
import SettingsPanel from "./SettingsPanel";

function formatTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Navbar() {
  const { user, logout, settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const { conversations, openConversation } = useChat();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme || "light";
    document.documentElement.lang = settings?.app_language || "en";
  }, [settings?.theme, settings?.app_language]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const openCollection = async (kind) => {
    setPanel(kind);
    setMenuOpen(false);
    setPanelError("");
    setItems([]);
    setLoadingItems(true);
    try {
      const response = await messageAPI.collection(kind);
      setItems(response.data);
    } catch (error) {
      setPanelError(error?.response?.data?.detail || "Could not load messages.");
    } finally {
      setLoadingItems(false);
    }
  };

  const shareId = async () => {
    const shareText = `Find me on Threadline: ${user?.username}`;
    setShareStatus("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Threadline ID", text: shareText });
        setShareStatus("Shared your ID.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(user?.username || "");
        setShareStatus("Your ID was copied.");
      } else {
        window.prompt("Copy your Threadline ID:", user?.username || "");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setShareStatus("Could not share your ID. Please try again.");
      }
    }
  };

  const openMessageConversation = (item) => {
    const conversation = conversations.find((chat) => chat.id === item.conversation);
    if (!conversation) {
      setPanelError("This chat is no longer available.");
      return;
    }
    openConversation(conversation);
    setPanel("");
  };

  const panelTitle = panel === "starred" ? t("Starred messages") : t("Shared media");

  return (
    <>
      <header className="navbar">
        <div className="navbar-brand">
          <FiMessageCircle size={22} />
          <span>Threadline</span>
        </div>
        <div className="navbar-user">
          <Avatar name={user?.full_name || user?.username} src={user?.profile_image} size={32} />
          <span className="navbar-username">{user?.full_name || user?.username}</span>
          <div className="navbar-menu-wrapper" ref={menuRef}>
            <button
              className="icon-btn navbar-menu-trigger"
              onClick={() => setMenuOpen((open) => !open)}
              title={t("More options")}
              aria-label={t("Account options")}
              aria-expanded={menuOpen}
            >
              <FiMoreVertical size={20} />
            </button>
            {menuOpen && (
              <div className="navbar-menu" role="menu">
                <button
                  className="navbar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setPanel("settings");
                    setMenuOpen(false);
                    setShareStatus("");
                  }}
                >
                  <FiSettings /> {t("Settings")}
                </button>
                <button className="navbar-menu-item" role="menuitem" onClick={() => openCollection("shared")}>
                  <FiUsers /> {t("Shared")}
                </button>
                <button className="navbar-menu-item" role="menuitem" onClick={() => openCollection("starred")}>
                  <FiStar /> {t("Starred")}
                </button>
                <button className="navbar-menu-item" role="menuitem" onClick={shareId}>
                  <FiShare2 /> {t("Share ID")}
                </button>
                {shareStatus && <div className="navbar-share-status">{shareStatus}</div>}
                <button
                  className="navbar-menu-item navbar-menu-item--logout"
                  role="menuitem"
                  onClick={logout}
                >
                  <FiLogOut /> {t("Log out")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {panel && (
        <div className="account-panel-backdrop" onClick={() => setPanel("")}>
          <section
            className={`account-panel ${panel === "settings" ? "account-panel--settings" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-panel-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="account-panel-header">
              <h2 id="account-panel-title">
                {panel === "settings" ? t("Settings") : panelTitle}
              </h2>
              <button className="icon-btn account-panel-close" onClick={() => setPanel("")} title={t("Close")}>
                <FiX />
              </button>
            </div>

            {panel === "settings" ? (
              <SettingsPanel onClose={() => setPanel("")} />
            ) : (
              <div className="account-message-list">
                {loadingItems && <p className="account-panel-empty">{t("Loading")}</p>}
                {!loadingItems && panelError && <p className="account-panel-error">{t(panelError)}</p>}
                {!loadingItems && !panelError && items.length === 0 && (
                  <p className="account-panel-empty">
                    {panel === "starred" ? t("No starred messages yet.") : t("No shared files yet.")}
                  </p>
                )}
                {!loadingItems && items.map((item) => {
                  const conversation = conversations.find((chat) => chat.id === item.conversation);
                  const contactName = conversation?.other_user?.full_name
                    || conversation?.other_user?.username
                    || "Chat";
                  return (
                    <article className="account-message-item" key={item.id}>
                      <div className="account-message-details">
                        <strong>{contactName}</strong>
                        <span>{t(item.message || "Attachment")}</span>
                        <time>{formatTime(item.created_at)}</time>
                        {item.attachment && (
                          <a href={item.attachment} target="_blank" rel="noreferrer">
                            {t("Open shared file")}
                          </a>
                        )}
                      </div>
                      <button
                        className="account-open-chat"
                        onClick={() => openMessageConversation(item)}
                        title="Open chat"
                      >
                        <FiCheck />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
