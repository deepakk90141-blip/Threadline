import React, { useEffect, useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import { userAPI } from "../services/api";
import { useChat } from "../context/ChatContext";
import Avatar from "./Avatar";

export default function UserSearch({ onStarted }) {
  const { startConversationWith } = useChat();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await userAPI.search(query.trim());
        setResults(res.data);
      } finally {
        setLoading(false);
      }
    }, 300); // debounce

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = async (user) => {
    setQuery("");
    setResults([]);
    try {
      await startConversationWith(user);
    } catch (err) {
      console.error("Could not start conversation:", err);
    }
  };

  return (
    <div className="user-search">
      <div className="user-search-input">
        <FiSearch size={16} />
        <input
          placeholder="Search users..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="icon-btn-sm" onClick={() => setQuery("")}>
            <FiX size={14} />
          </button>
        )}
      </div>

      {query.trim() && (
        <div className="user-search-results">
          {loading && <div className="user-search-empty">Searching...</div>}
          {!loading && results.length === 0 && <div className="user-search-empty">No users found.</div>}
          {!loading &&
            results.map((user) => (
              <button key={user.id} className="user-search-result" onClick={() => handleSelect(user)}>
                <Avatar name={user.full_name || user.username} src={user.profile_image} size={38} online={user.is_online} />
                <div className="user-search-result-text">
                  <span className="user-search-result-name">{user.full_name || user.username}</span>
                  <span className="user-search-result-username">@{user.username}</span>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
