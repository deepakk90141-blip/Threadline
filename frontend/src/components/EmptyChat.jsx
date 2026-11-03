import React from "react";
import { FiMessageCircle } from "react-icons/fi";

export default function EmptyChat() {
  return (
    <div className="empty-chat">
      <FiMessageCircle size={64} />
      <h2>Your messages</h2>
      <p>Select a conversation, or search for someone to start a new one.</p>
    </div>
  );
}
