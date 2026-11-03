import React from "react";

export default function TypingIndicator({ name }) {
  return (
    <div className="typing-indicator">
      <div className="typing-dots">
        <span />
        <span />
        <span />
      </div>
      <span className="typing-label">{name} is typing...</span>
    </div>
  );
}
