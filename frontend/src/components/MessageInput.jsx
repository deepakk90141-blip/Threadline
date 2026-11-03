import React, { useEffect, useRef, useState } from "react";
import { FiSend, FiX } from "react-icons/fi";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { translate } from "../utils/translate";

const TYPING_STOP_DELAY_MS = 1500;

export default function MessageInput({ disabled = false, replyingTo, onCancelReply }) {
  const { sendMessage, sendTyping } = useChat();
  const { settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const [text, setText] = useState("");
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) sendTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    if (disabled) return;
    setText(e.target.value);

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(false);
    }, TYPING_STOP_DELAY_MS);

    // Auto-grow the textarea.
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSend = () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    // If the socket isn't open the draft is kept so nothing is lost.
    if (!sendMessage(trimmed, replyingTo?.id || null)) return;
    setText("");
    onCancelReply?.();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    sendTyping(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input-bar">
      {replyingTo && (
        <div className="message-reply-composer">
          <div className="message-reply-composer-copy">
            <strong>{t("Replying to")} {replyingTo.sender_username}</strong>
            <span>
              {replyingTo.is_deleted_for_everyone
                ? t("This message was deleted")
                : replyingTo.message || t("Attachment")}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancelReply}
            aria-label={t("Cancel reply")}
            title={t("Cancel reply")}
          >
            <FiX />
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder={t("Type a message...")}
        value={text}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <button className="send-btn" onClick={handleSend} disabled={disabled || !text.trim()} title={t("Send")}>
        <FiSend size={18} />
      </button>
    </div>
  );
}
