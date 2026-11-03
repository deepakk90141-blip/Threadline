import React, { useEffect, useMemo, useState } from "react";
import { FiCheck, FiSearch, FiX } from "react-icons/fi";
import { userAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { translate } from "../utils/translate";
import Avatar from "./Avatar";

export default function GroupCreateDialog({ onClose, onCreated }) {
  const { user, settings } = useAuth();
  const { startGroupConversation, setChatError } = useChat();
  const t = (text) => translate(settings?.app_language, text);
  const [members, setMembers] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    userAPI.list()
      .then((response) => {
        if (isCurrent) setMembers(response.data.filter((member) => member.id !== user.id));
      })
      .catch((requestError) => {
        if (isCurrent) {
          setError(requestError?.response?.data?.detail || t("Could not load members."));
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [user.id]);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return members;
    return members.filter((member) =>
      `${member.full_name} ${member.username}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [members, query]);

  const toggleMember = (memberId) => {
    setSelectedIds((selected) =>
      selected.includes(memberId)
        ? selected.filter((id) => id !== memberId)
        : [...selected, memberId]
    );
  };

  const createGroup = async (event) => {
    event.preventDefault();
    if (!groupName.trim() || selectedIds.length === 0 || creating) return;
    setCreating(true);
    setError("");
    try {
      await startGroupConversation(groupName.trim(), selectedIds);
      onCreated();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || t("Could not create group."));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="message-modal-backdrop" onClick={onClose}>
      <section
        className="group-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="group-create-header">
          <h2 id="group-create-title">{t("Create group")}</h2>
          <button className="icon-btn" onClick={onClose} title={t("Close")}>
            <FiX />
          </button>
        </header>
        <form onSubmit={createGroup}>
          <label className="group-create-label" htmlFor="group-name">{t("Group name")}</label>
          <input
            id="group-name"
            className="group-create-name"
            value={groupName}
            maxLength={100}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder={t("Enter group name")}
            required
          />
          <label className="group-create-label" htmlFor="group-member-search">
            {t("Add members")} ({selectedIds.length} {t("selected")})
          </label>
          <div className="group-member-search">
            <FiSearch />
            <input
              id="group-member-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search users...")}
            />
          </div>
          <div className="group-member-list">
            {loading ? (
              <p className="forward-empty">{t("Loading members...")}</p>
            ) : filteredMembers.length ? (
              filteredMembers.map((member) => {
                const checked = selectedIds.includes(member.id);
                const name = member.full_name || member.username;
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={`group-member-option${checked ? " group-member-option--selected" : ""}`}
                    onClick={() => toggleMember(member.id)}
                    aria-pressed={checked}
                  >
                    <Avatar name={name} src={member.profile_image} size={38} />
                    <span className="group-member-name">{name}</span>
                    <span className="group-member-check">{checked && <FiCheck />}</span>
                  </button>
                );
              })
            ) : (
              <p className="forward-empty">{t("No users found.")}</p>
            )}
          </div>
          {error && <p className="group-create-error" role="alert">{error}</p>}
          <div className="group-create-footer">
            <button type="button" className="message-info-close" onClick={onClose}>{t("Cancel")}</button>
            <button
              type="submit"
              className="group-create-submit"
              disabled={!groupName.trim() || selectedIds.length === 0 || creating}
            >
              {creating ? t("Creating...") : t("Create")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
