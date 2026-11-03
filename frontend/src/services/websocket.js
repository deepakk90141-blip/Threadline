import { WS_BASE_URL } from "./api";

const MAX_RECONNECT_ATTEMPTS = 10;
const retryDelay = (attempt) => Math.min(1000 * attempt, 5000);

/**
 * Reconnecting WebSocket with token auth.
 * status: "connecting" | "connected" | "reconnecting" | "offline"
 */
class BaseSocket {
  constructor(path, { onMessage, onStatusChange }) {
    this.path = path;
    this.onMessage = onMessage || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.socket = null;
    this.attempts = 0;
    this.retryTimer = null;
    this.manuallyClosed = false;
  }

  connect() {
    if (this.manuallyClosed) return;
    clearTimeout(this.retryTimer);
    this._detach();

    const token = localStorage.getItem("authToken");
    if (!token) {
      this.onStatusChange("offline");
      return;
    }

    this.onStatusChange(this.attempts > 0 ? "reconnecting" : "connecting");
    const socket = new WebSocket(`${WS_BASE_URL}${this.path}?token=${encodeURIComponent(token)}`);
    this.socket = socket;

    // Every handler ignores events from a socket that has been replaced/closed.
    const isCurrent = () => this.socket === socket && !this.manuallyClosed;

    socket.onopen = () => {
      if (!isCurrent()) return;
      this.attempts = 0;
      this.onStatusChange("connected");
    };

    socket.onmessage = (event) => {
      if (!isCurrent()) return;
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (err) {
        console.error("Bad WebSocket message:", err);
      }
    };

    socket.onclose = (event) => {
      if (!isCurrent()) return;
      // 4001 = unauthorized, 4003 = forbidden: retrying will not help.
      if (event.code === 4001 || event.code === 4003) {
        this.onStatusChange("offline");
        return;
      }
      if (this.attempts < MAX_RECONNECT_ATTEMPTS) {
        this.attempts += 1;
        this.onStatusChange("reconnecting");
        this.retryTimer = setTimeout(() => this.connect(), retryDelay(this.attempts));
      } else {
        this.onStatusChange("offline");
      }
    };

    socket.onerror = () => {
      // onclose fires right after and handles the retry.
    };
  }

  /** Manual retry (e.g. user clicks the "Offline" pill). */
  retry() {
    if (this.manuallyClosed) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    this.attempts = 0;
    this.connect();
  }

  /** Returns true if the payload was handed to an open socket. */
  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  close() {
    this.manuallyClosed = true;
    clearTimeout(this.retryTimer);
    this._detach();
  }

  _detach() {
    if (this.socket) {
      const old = this.socket;
      this.socket = null;
      try {
        old.close();
      } catch {
        /* already closed */
      }
    }
  }
}

/** Per-conversation socket: messages, typing, read receipts. */
export class ChatSocket extends BaseSocket {
  constructor(conversationId, handlers) {
    super(`/ws/chat/${conversationId}/`, handlers);
  }

  sendMessage(text, replyToId = null) {
    return this.send({ type: "message", message: text, reply_to: replyToId });
  }

  sendTyping(isTyping) {
    return this.send({ type: "typing", is_typing: isTyping });
  }

  sendReadReceipt(messageIds) {
    if (!messageIds.length) return false;
    return this.send({ type: "read", message_ids: messageIds });
  }
}

/** Per-user socket for the whole session: presence + new-message alerts. */
export class NotificationSocket extends BaseSocket {
  constructor(handlers) {
    super("/ws/notifications/", handlers);
  }
}
