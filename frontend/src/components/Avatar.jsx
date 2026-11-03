import React from "react";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFromString(str) {
  const colors = ["#1f6f5c", "#e2725b", "#4a5d8a", "#c48f3c", "#7a5ca8", "#2f8f8f"];
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ name, src, size = 44, online }) {
  return (
    <div className="avatar-wrapper" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name} className="avatar-img" style={{ width: size, height: size }} />
      ) : (
        <div
          className="avatar-fallback"
          style={{ width: size, height: size, background: colorFromString(name), fontSize: size * 0.4 }}
        >
          {getInitials(name)}
        </div>
      )}
      {typeof online === "boolean" && <span className={`avatar-status ${online ? "avatar-status--online" : ""}`} />}
    </div>
  );
}
