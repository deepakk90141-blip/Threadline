import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { conversationAPI, messageAPI } from "../services/api";
import { ChatSocket, NotificationSocket } from "../services/websocket";
import { useAuth } from "./AuthContext";

const ChatContext = createContext(null);

function describeError(err) {
  const responseData = err?.response?.data;
  if (responseData?.detail) return responseData.detail;
  if (responseData && typeof responseData === "object") {
    const validationMessage = Object.values(responseData)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .find((value) => typeof value === "string");
    if (validationMessage) return validationMessage;
  }
  if (err?.response?.status === 404) return "Conversation not found.";
  if (err?.response?.status === 403) return "You don't have access to this conversation.";
  if (err?.code === "ERR_NETWORK") return "Cannot reach the server. Is the backend running?";
  return err?.message || "Something went wrong.";
}

const byId = (a, b) => a.id - b.id;

export function ChatProvider({ children }) {
  const { user, settings } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineStatus, setOnlineStatus] = useState({});
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callEvent, setCallEvent] = useState(null);

  const socketRef = useRef(null);
  const notificationSocketRef = useRef(null);
  const activeIdRef = useRef(null);
  const activeCallRef = useRef(activeCall);
  const incomingCallRef = useRef(incomingCall);
  const openSeqRef = useRef(0); // invalidates stale async work when the user switches chats
  const userRef = useRef(user);
  userRef.current = user;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  activeCallRef.current = activeCall;
  incomingCallRef.current = incomingCall;

  // ------------------------------------------------------------------
  // Conversation list
  // ------------------------------------------------------------------
  const loadConversations = useCallback(async () => {
    try {
      const res = await conversationAPI.list();
      setConversations(res.data);
      const active = res.data.find((conversation) => conversation.id === activeIdRef.current);
      if (active) setActiveConversation(active);
    } catch (err) {
      console.error("Could not load conversations:", describeError(err));
    }
  }, []);

  useEffect(() => {
    if (user) loadConversations();
  }, [user, loadConversations]);

  // ------------------------------------------------------------------
  // Active conversation
  // ------------------------------------------------------------------
  const closeConversation = useCallback(() => {
    openSeqRef.current += 1;
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    activeIdRef.current = null;
    setActiveConversation(null);
    setMessages([]);
    setTypingUsers({});
    setChatError("");
    setLoadingMessages(false);
    setConnectionStatus("offline");
  }, []);

  const fetchMessages = useCallback(async (conversationId, seq, { replace }) => {
    const res = await conversationAPI.messages(conversationId);
    if (seq !== openSeqRef.current) return;
    setMessages((prev) => {
      if (replace) return res.data;
      // Merge: a live message may have arrived while history was loading.
      const map = new Map(res.data.map((m) => [m.id, m]));
      prev.forEach((m) => map.set(m.id, { ...map.get(m.id), ...m }));
      return [...map.values()].sort(byId);
    });
  }, []);

  const handleSocketEvent = useCallback(
    (data, socket) => {
      const me = userRef.current;
      switch (data.type) {
        case "message":
          setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
          setTypingUsers((prev) => ({ ...prev, [data.sender]: false }));
          // The chat is open, so an incoming message is read immediately.
          if (
            (data.is_group ? data.sender !== me.id : data.receiver === me.id) &&
            settingsRef.current?.read_receipts !== false
          ) {
            socket.sendReadReceipt([data.id]);
          }
          break;
        case "typing":
          if (data.user_id !== me.id) {
            setTypingUsers((prev) => ({ ...prev, [data.user_id]: data.is_typing }));
          }
          break;
        case "read":
          setMessages((prev) =>
            prev.map((m) => (data.message_ids.includes(m.id) ? { ...m, is_read: true, is_delivered: true } : m))
          );
          if (data.reader_id === me.id) loadConversations(); // our unread badge changed
          break;
        case "delivered":
          setMessages((prev) =>
            prev.map((m) => (data.message_ids.includes(m.id) ? { ...m, is_delivered: true } : m))
          );
          break;
        case "message_deleted":
          setMessages((prev) => prev.filter((m) => m.id !== data.message_id));
          break;
        case "message_updated":
          setMessages((prev) =>
            prev.map((m) => (m.id === data.id ? { ...m, ...data } : m))
          );
          break;
        case "group_member_removed":
          if (data.user_id === me.id && data.conversation_id === activeIdRef.current) {
            closeConversation();
            loadConversations();
          } else {
            loadConversations();
          }
          break;
        case "group_updated":
          loadConversations();
          break;
        case "error":
          setChatError(data.detail);
          break;
        default:
          break;
      }
    },
    [closeConversation, loadConversations]
  );

  useEffect(() => {
    const expirations = messages
      .map((message) => message.expires_at && new Date(message.expires_at).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));
    if (!expirations.length) return undefined;

    const timeout = window.setTimeout(async () => {
      const now = Date.now();
      setMessages((prev) =>
        prev.filter((message) => !message.expires_at || new Date(message.expires_at).getTime() > now)
      );
      try {
        await messageAPI.cleanupExpired();
      } catch (err) {
        setChatError(describeError(err));
      }
    }, Math.max(0, Math.min(...expirations) - Date.now()));

    return () => window.clearTimeout(timeout);
  }, [messages]);

  const openConversation = useCallback(
    async (conversation) => {
      const seq = ++openSeqRef.current;

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      activeIdRef.current = conversation.id;
      setActiveConversation(conversation);
      setMessages([]);
      setTypingUsers({});
      setChatError("");
      setLoadingMessages(true);

      // Open the socket immediately (in parallel with the history request)
      // so no message can slip through the gap between the two.
      let needsResync = false;
      const socket = new ChatSocket(conversation.id, {
        onStatusChange: (status) => {
          if (seq !== openSeqRef.current) return;
          setConnectionStatus(status);
          if (status === "reconnecting") needsResync = true;
          if (status === "connected") {
            setChatError("");
            if (needsResync) {
              // We may have missed messages while disconnected.
              needsResync = false;
              fetchMessages(conversation.id, seq, { replace: true }).catch(() => {});
            }
          }
        },
        onMessage: (data) => {
          if (seq === openSeqRef.current) handleSocketEvent(data, socket);
        },
      });
      socketRef.current = socket;
      socket.connect();

      try {
        await fetchMessages(conversation.id, seq, { replace: false });
        if (seq === openSeqRef.current) loadConversations(); // unread badge is now cleared
      } catch (err) {
        if (seq === openSeqRef.current) setChatError(describeError(err));
      } finally {
        if (seq === openSeqRef.current) setLoadingMessages(false);
      }
    },
    [fetchMessages, handleSocketEvent, loadConversations]
  );

  const startConversationWith = useCallback(
    async (otherUser) => {
      const res = await conversationAPI.create(otherUser.id);
      await openConversation(res.data);
      loadConversations();
      return res.data;
    },
    [openConversation, loadConversations]
  );

  const startGroupConversation = useCallback(
    async (groupName, userIds) => {
      const res = await conversationAPI.createGroup(groupName, userIds);
      await openConversation(res.data);
      await loadConversations();
      return res.data;
    },
    [openConversation, loadConversations]
  );

  const removeGroupMember = useCallback(
    async (conversationId, userId) => {
      try {
        await conversationAPI.removeGroupMember(conversationId, userId);
        if (activeIdRef.current === conversationId) {
          const response = await conversationAPI.list();
          const refreshed = response.data.find((conversation) => conversation.id === conversationId);
          if (refreshed) setActiveConversation(refreshed);
        }
        await loadConversations();
        return true;
      } catch (err) {
        setChatError(describeError(err));
        return false;
      }
    },
    [loadConversations]
  );

  const addGroupMembers = useCallback(
    async (conversationId, userIds) => {
      try {
        await conversationAPI.addGroupMembers(conversationId, userIds);
        await loadConversations();
        return true;
      } catch (err) {
        setChatError(describeError(err));
        return false;
      }
    },
    [loadConversations]
  );

  const updateGroupInformation = useCallback(
    async (conversationId, information) => {
      try {
        await conversationAPI.updateGroupInformation(conversationId, information);
        await loadConversations();
        return true;
      } catch (err) {
        const errorMessage = describeError(err);
        setChatError(errorMessage);
        return errorMessage;
      }
    },
    [loadConversations]
  );

  const deleteGroupConversation = useCallback(
    async (conversationId) => {
      try {
        await conversationAPI.deleteGroup(conversationId);
        setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
        if (activeIdRef.current === conversationId) closeConversation();
        return true;
      } catch (err) {
        setChatError(describeError(err));
        return false;
      }
    },
    [closeConversation]
  );

  const sendMessage = useCallback((text, replyToId = null) => {
    const ok = socketRef.current ? socketRef.current.sendMessage(text, replyToId) : false;
    if (!ok) setChatError("Not connected yet. Your message was not sent.");
    return ok;
  }, []);

  const sendTyping = useCallback((isTyping) => {
    if (socketRef.current) socketRef.current.sendTyping(isTyping);
  }, []);

  const retryConnection = useCallback(() => {
    if (socketRef.current) socketRef.current.retry();
  }, []);

  const deleteMessageForMe = useCallback(
    async (messageId) => {
      try {
        await messageAPI.deleteForMe(messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        loadConversations();
      } catch (err) {
        setChatError(describeError(err));
      }
    },
    [loadConversations]
  );

  const deleteMessageForEveryone = useCallback(
    async (messageId) => {
      try {
        const res = await messageAPI.deleteForEveryone(messageId);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? res.data : m)));
        loadConversations();
      } catch (err) {
        setChatError(describeError(err));
      }
    },
    [loadConversations]
  );

  const toggleMessageStar = useCallback(async (messageId) => {
    try {
      const res = await messageAPI.toggleStar(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.data : m)));
    } catch (err) {
      setChatError(describeError(err));
    }
  }, []);

  const forwardMessage = useCallback(
    async (messageId, userId) => {
      try {
        await messageAPI.forward(messageId, userId);
        await loadConversations();
        return true;
      } catch (err) {
        setChatError(describeError(err));
        return false;
      }
    },
    [loadConversations]
  );

  const deleteConversation = useCallback(
    async (conversationId) => {
      try {
        await conversationAPI.delete(conversationId);
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeIdRef.current === conversationId) closeConversation();
      } catch (err) {
        setChatError(describeError(err));
      }
    },
    [closeConversation]
  );

  const performConversationAction = useCallback(
    async (conversationIds, action) => {
      try {
        await conversationAPI.action(conversationIds, action);
        if (action === "clear" && conversationIds.includes(activeIdRef.current)) {
          setMessages([]);
        }
        if (
          ["delete", "archive"].includes(action) &&
          conversationIds.includes(activeIdRef.current)
        ) {
          closeConversation();
        }
        await loadConversations();
        if (["block", "unblock"].includes(action) && activeIdRef.current) {
          const res = await conversationAPI.list();
          const active = res.data.find((conversation) => conversation.id === activeIdRef.current);
          if (active) setActiveConversation(active);
        }
        return true;
      } catch (err) {
        setChatError(describeError(err));
        return false;
      }
    },
    [closeConversation, loadConversations]
  );

  const startCall = useCallback((conversation, mediaType) => {
    if (!["audio", "video"].includes(mediaType)) return false;
    if (activeCallRef.current || incomingCallRef.current) {
      setChatError("You are already in a call.");
      return false;
    }
    const notificationSocket = notificationSocketRef.current;
    const callId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      type: "call_invite",
      call_id: callId,
      conversation_id: conversation.id,
      media_type: mediaType,
      ...(conversation.is_group ? {} : { target_user_id: conversation.other_user?.id }),
    };
    if (!notificationSocket?.send(payload)) {
      setChatError("Cannot start a call while disconnected from the server.");
      return false;
    }
    setActiveCall({
      id: callId,
      conversationId: conversation.id,
      conversationName: conversation.is_group
        ? conversation.group_name
        : conversation.other_user?.full_name || conversation.other_user?.username,
      isGroup: conversation.is_group,
      mediaType,
      initiatorId: userRef.current.id,
      status: "calling",
      participants: [{ id: userRef.current.id, username: userRef.current.username }],
    });
    return true;
  }, []);

  const answerCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return false;
    if (!notificationSocketRef.current?.send({
      type: "call_join",
      call_id: call.call_id,
    })) {
      setChatError("Cannot answer the call while disconnected from the server.");
      return false;
    }
    setActiveCall({
      id: call.call_id,
      conversationId: call.conversation_id,
      conversationName: call.conversation_name,
      isGroup: call.is_group,
      mediaType: call.media_type,
      initiatorId: call.caller_id,
      status: "connecting",
      participants: [{ id: call.caller_id, username: call.caller_name }],
    });
    setIncomingCall(null);
    return true;
  }, []);

  const declineCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    notificationSocketRef.current?.send({
      type: "call_decline",
      call_id: call.call_id,
    });
    setIncomingCall(null);
  }, []);

  const dismissIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const sendCallSignal = useCallback((payload) => {
    const sent = notificationSocketRef.current?.send(payload) || false;
    if (!sent) setChatError("The call connection was lost. Please try again.");
    return sent;
  }, []);

  const endCall = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    notificationSocketRef.current?.send({
      type: call.initiatorId === userRef.current.id ? "call_end" : "call_leave",
      call_id: call.id,
    });
    setActiveCall(null);
  }, []);

  const updateActiveCall = useCallback((updater) => {
    setActiveCall((current) => {
      if (!current) return current;
      const next = typeof updater === "function" ? updater(current) : updater;
      activeCallRef.current = next;
      return next;
    });
  }, []);

  // ------------------------------------------------------------------
  // Per-user notification socket: presence, new messages in ANY chat
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user) return undefined;

    let wasDisconnected = false;
    const socket = new NotificationSocket({
      onStatusChange: (status) => {
        if (status === "reconnecting") wasDisconnected = true;
        if (status === "connected" && wasDisconnected) {
          wasDisconnected = false;
          loadConversations(); // catch up on whatever happened while offline
        }
      },
      onMessage: (data) => {
        switch (data.type) {
          case "new_message":
          case "refresh":
            loadConversations();
            break;
          case "presence":
            setOnlineStatus((prev) => ({
              ...prev,
              [data.user_id]: { is_online: data.is_online, last_seen: data.last_seen },
            }));
            break;
          case "conversation_deleted":
            setConversations((prev) => prev.filter((c) => c.id !== data.conversation_id));
            if (activeIdRef.current === data.conversation_id) closeConversation();
            break;
          case "call_invite":
            if (activeCallRef.current || incomingCallRef.current) {
              socket.send({ type: "call_decline", call_id: data.call_id });
              break;
            }
            setIncomingCall(data);
            break;
          case "call_roster":
          case "call_participant_joined":
          case "call_participant_left":
          case "call_signal":
          case "call_declined":
          case "call_ended":
            setCallEvent({ ...data, receivedAt: Date.now() });
            break;
          case "error":
            setChatError(data.detail || "Call signaling failed.");
            break;
          default:
            break;
        }
      },
    });
    notificationSocketRef.current = socket;
    socket.connect();
    return () => {
      notificationSocketRef.current = null;
      socket.close();
    };
  }, [user?.id, loadConversations, closeConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the chat socket when the provider unmounts (logout).
  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        loadingMessages,
        chatError,
        setChatError,
        connectionStatus,
        typingUsers,
        onlineStatus,
        loadConversations,
        openConversation,
        closeConversation,
        startConversationWith,
        startGroupConversation,
        removeGroupMember,
        addGroupMembers,
        updateGroupInformation,
        deleteGroupConversation,
        sendMessage,
        sendTyping,
        retryConnection,
        deleteMessageForMe,
        deleteMessageForEveryone,
        toggleMessageStar,
        forwardMessage,
        deleteConversation,
        performConversationAction,
        activeCall,
        incomingCall,
        callEvent,
        startCall,
        answerCall,
        declineCall,
        dismissIncomingCall,
        sendCallSignal,
        endCall,
        updateActiveCall,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
