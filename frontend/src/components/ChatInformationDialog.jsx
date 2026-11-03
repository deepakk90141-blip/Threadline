import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FiBell,
  FiBellOff,
  FiCheck,
  FiEdit2,
  FiMoreVertical,
  FiPlus,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { userAPI } from "../services/api";
import { translate } from "../utils/translate";
import { chatThemes } from "../utils/chatThemes";
import Avatar from "./Avatar";

function formatLastSeen(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return isToday ? `last seen today at ${time}` : `last seen ${date.toLocaleDateString()} at ${time}`;
}

export default function ChatInformationDialog({
  conversation,
  chatTheme,
  onThemeChange,
  onRemoveMember,
  onAddMembers,
  onUpdateGroupInformation,
  onDeleteGroup,
  onToggleMute,
  onClose,
}) {
  const { user, settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const [openMemberMenuId, setOpenMemberMenuId] = useState(null);
  const [memberActionError, setMemberActionError] = useState("");
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [groupName, setGroupName] = useState(conversation.group_name || "");
  const [groupBio, setGroupBio] = useState(conversation.group_bio || "");
  const [savingBio, setSavingBio] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [groupImageFile, setGroupImageFile] = useState(null);
  const [groupImagePreview, setGroupImagePreview] = useState(conversation.group_image || "");
  const [savingGroupImage, setSavingGroupImage] = useState(false);
  const fileInputRef = useRef(null);
  const other = conversation.other_user;
  const groupAdminId = Number(conversation.group_admin_id);
  const isGroupAdmin = conversation.is_group && groupAdminId === Number(user.id);
  const displayName = conversation.is_group
    ? conversation.group_name
    : other?.full_name || other?.username || t("Unknown user");
  const participants = conversation.participants || [];
  const orderedParticipants = [...participants].sort((first, second) => {
    const firstIsAdmin = Number(first.id) === groupAdminId;
    const secondIsAdmin = Number(second.id) === groupAdminId;
    return Number(secondIsAdmin) - Number(firstIsAdmin);
  });
  const visibleMembers = showAllMembers ? orderedParticipants : orderedParticipants.slice(0, 5);
  const filteredUsers = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLocaleLowerCase();
    const participantIds = new Set(participants.map((member) => member.id));
    return availableUsers
      .filter((member) => !participantIds.has(member.id))
      .filter((member) =>
        !normalizedQuery ||
        `${member.full_name || ""} ${member.username}`.toLocaleLowerCase().includes(normalizedQuery)
      );
  }, [availableUsers, memberQuery, participants]);

  useEffect(() => {
    setGroupBio(conversation.group_bio || "");
  }, [conversation.group_bio]);

  useEffect(() => {
    setGroupName(conversation.group_name || "");
  }, [conversation.group_name]);

  useEffect(() => {
    setGroupImagePreview(conversation.group_image || "");
    setGroupImageFile(null);
  }, [conversation.group_image]);

  useEffect(() => {
    if (!addingMembers) return undefined;
    let isCurrent = true;
    setLoadingUsers(true);
    userAPI.list()
      .then((response) => {
        if (isCurrent) setAvailableUsers(response.data);
      })
      .catch((error) => {
        if (isCurrent) {
          setMemberActionError(error?.response?.data?.detail || t("Could not load members."));
        }
      })
      .finally(() => {
        if (isCurrent) setLoadingUsers(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [addingMembers]);

  const removeMember = async (member) => {
    const memberName = member.full_name || member.username;
    if (!window.confirm(t(`Remove ${memberName} from this group?`))) return;
    setMemberActionError("");
    setOpenMemberMenuId(null);
    const removed = await onRemoveMember?.(conversation.id, member.id);
    if (!removed) setMemberActionError(t("Could not remove group member."));
  };

  const saveGroupBio = async () => {
    if (savingBio) return;
    setSavingBio(true);
    setMemberActionError("");
    const saved = await onUpdateGroupInformation?.(conversation.id, { group_bio: groupBio.trim() });
    setSavingBio(false);
    if (saved === true) setEditingBio(false);
    else setMemberActionError(typeof saved === "string" ? saved : t("Could not update group description."));
  };

  const saveGroupName = async () => {
    if (savingName) return;
    setSavingName(true);
    setMemberActionError("");
    const saved = await onUpdateGroupInformation?.(conversation.id, { group_name: groupName.trim() });
    setSavingName(false);
    if (saved === true) setEditingName(false);
    else setMemberActionError(typeof saved === "string" ? saved : t("Could not update group name."));
  };

  const deleteGroup = async () => {
    if (deletingGroup || !window.confirm(t("Delete this group and its message history for everyone?"))) return;
    setDeletingGroup(true);
    setMemberActionError("");
    const deleted = await onDeleteGroup?.(conversation.id);
    setDeletingGroup(false);
    if (deleted) onClose();
    else setMemberActionError(t("Could not delete group."));
  };

  const addSelectedMembers = async () => {
    if (!selectedUserIds.length || savingMembers) return;
    setSavingMembers(true);
    setMemberActionError("");
    const added = await onAddMembers?.(conversation.id, selectedUserIds);
    setSavingMembers(false);
    if (added) {
      setAddingMembers(false);
      setSelectedUserIds([]);
      setMemberQuery("");
    } else {
      setMemberActionError(t("Could not add group members."));
    }
  };

  const handleGroupImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "jfif", "png", "webp"].includes(extension)) {
      event.target.value = "";
      setMemberActionError(t("Use a JPG, JPEG/JFIF, PNG, or WEBP image."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = "";
      setMemberActionError(t("Image must be 5 MB or smaller."));
      return;
    }
    setGroupImageFile(file);
    setGroupImagePreview(URL.createObjectURL(file));
    setMemberActionError("");
  };

  const saveGroupImage = async () => {
    if (!groupImageFile || savingGroupImage) return;
    setSavingGroupImage(true);
    setMemberActionError("");

    const payload = new FormData();
    payload.append("group_image", groupImageFile);
    const saved = await onUpdateGroupInformation?.(conversation.id, payload);

    setSavingGroupImage(false);
    if (saved === true) {
      setGroupImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setGroupImagePreview(conversation.group_image || "");
      setMemberActionError(typeof saved === "string" ? saved : t("Could not update group photo."));
    }
  };

  return (
    <div className="message-modal-backdrop" onClick={onClose}>
      <section
        className="chat-information-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`chat-information-title-${conversation.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="group-create-header">
          <h2 id={`chat-information-title-${conversation.id}`}>{t("Information")}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            title={t("Close")}
            aria-label={t("Close")}
          >
            <FiX />
          </button>
        </header>

        {conversation.is_group ? (
          <>
            <div className="chat-information-profile chat-information-group-profile">
              <div className="chat-information-group-logo" aria-label={t("Group image")}>
                {groupImagePreview ? (
                  <img
                    src={groupImagePreview}
                    alt={displayName}
                    className="chat-information-group-logo-image"
                  />
                ) : (
                  <FiUsers />
                )}
                {isGroupAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.jfif"
                      hidden
                      onChange={handleGroupImageSelect}
                    />
                    <button
                      type="button"
                      className="chat-information-image-button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t("Change photo")}
                    </button>
                  </>
                )}
              </div>
              {groupImageFile && (
                <div className="chat-information-add-actions chat-information-image-actions">
                  <button type="button" className="message-info-close" onClick={() => {
                    setGroupImageFile(null);
                    setGroupImagePreview(conversation.group_image || "");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}>
                    {t("Cancel")}
                  </button>
                  <button type="button" className="group-create-submit" disabled={savingGroupImage} onClick={saveGroupImage}>
                    {savingGroupImage ? t("Saving...") : t("Save photo")}
                  </button>
                </div>
              )}
              {editingName ? (
                <div className="chat-information-add-panel">
                  <label className="group-create-label" htmlFor={`group-name-${conversation.id}`}>
                    {t("Group name")}
                  </label>
                  <input
                    id={`group-name-${conversation.id}`}
                    className="group-create-name"
                    value={groupName}
                    maxLength={100}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <div className="chat-information-add-actions">
                    <button
                      type="button"
                      className="message-info-close"
                      onClick={() => {
                        setGroupName(conversation.group_name || "");
                        setEditingName(false);
                      }}
                    >
                      {t("Cancel")}
                    </button>
                    <button
                      type="button"
                      className="group-create-submit"
                      disabled={!groupName.trim() || savingName}
                      onClick={saveGroupName}
                    >
                      {savingName ? t("Saving...") : t("Save")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="chat-information-section-heading">
                  <h3>{displayName}</h3>
                  {isGroupAdmin && (
                    <button
                      type="button"
                      className="chat-information-text-button"
                      onClick={() => setEditingName(true)}
                    >
                      <FiEdit2 /> {t("Edit")}
                    </button>
                  )}
                </div>
              )}
              <div className="chat-information-member-count">
                <span>{participants.length} {t("members")}</span>
                {isGroupAdmin && (
                  <button
                    type="button"
                    className="chat-information-add-button"
                    onClick={() => {
                      setMemberActionError("");
                      setAddingMembers((open) => !open);
                    }}
                    aria-expanded={addingMembers}
                  >
                    <FiPlus /> {t("Add member")}
                  </button>
                )}
              </div>
            </div>

            {addingMembers && (
              <section className="chat-information-add-panel" aria-label={t("Add members")}>
                <label className="group-create-label" htmlFor={`add-group-members-${conversation.id}`}>
                  {t("Add members")}
                </label>
                <input
                  id={`add-group-members-${conversation.id}`}
                  className="group-create-name"
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder={t("Search users...")}
                />
                <div className="group-member-list">
                  {loadingUsers ? (
                    <p className="forward-empty">{t("Loading members...")}</p>
                  ) : filteredUsers.length ? (
                    filteredUsers.map((member) => {
                      const selected = selectedUserIds.includes(member.id);
                      const name = member.full_name || member.username;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={`group-member-option${selected ? " group-member-option--selected" : ""}`}
                          onClick={() =>
                            setSelectedUserIds((ids) =>
                              selected ? ids.filter((id) => id !== member.id) : [...ids, member.id]
                            )
                          }
                          aria-pressed={selected}
                        >
                          <Avatar name={name} src={member.profile_image} size={36} />
                          <span className="group-member-name">{name}</span>
                          <span className="group-member-check">{selected && <FiCheck />}</span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="forward-empty">{t("No other members found.")}</p>
                  )}
                </div>
                <div className="chat-information-add-actions">
                  <button type="button" className="message-info-close" onClick={() => setAddingMembers(false)}>
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    className="group-create-submit"
                    disabled={!selectedUserIds.length || savingMembers}
                    onClick={addSelectedMembers}
                  >
                    {savingMembers ? t("Adding...") : t("Add")}
                  </button>
                </div>
              </section>
            )}

            <section className="chat-information-section chat-information-about">
              <div className="chat-information-section-heading">
                <h4>{t("About the group")}</h4>
                {isGroupAdmin && !editingBio && (
                  <button
                    type="button"
                    className="chat-information-text-button"
                    onClick={() => setEditingBio(true)}
                  >
                    <FiEdit2 /> {t("Edit")}
                  </button>
                )}
              </div>
              {editingBio ? (
                <>
                  <textarea
                    className="chat-information-bio-input"
                    value={groupBio}
                    maxLength={300}
                    onChange={(event) => setGroupBio(event.target.value)}
                    aria-label={t("About the group")}
                  />
                  <div className="chat-information-add-actions">
                    <span className="chat-information-char-count">{groupBio.length}/300</span>
                    <button type="button" className="message-info-close" onClick={() => {
                      setGroupBio(conversation.group_bio || "");
                      setEditingBio(false);
                    }}>
                      {t("Cancel")}
                    </button>
                    <button
                      type="button"
                      className="group-create-submit"
                      disabled={savingBio}
                      onClick={saveGroupBio}
                    >
                      {savingBio ? t("Saving...") : t("Save")}
                    </button>
                  </div>
                </>
              ) : (
                <p>{conversation.group_bio || t("No group description yet.")}</p>
              )}
            </section>

            <button
              type="button"
              className="chat-information-mute"
              onClick={() => onToggleMute?.(conversation.id)}
            >
              {conversation.is_muted ? <FiBellOff /> : <FiBell />}
              <span>{t(conversation.is_muted ? "Unmute notification" : "Mute notification")}</span>
            </button>
            {isGroupAdmin && (
              <button
                type="button"
                className="chat-information-mute chat-list-menu-item--danger"
                onClick={deleteGroup}
                disabled={deletingGroup}
              >
                <FiTrash2 />
                <span>{deletingGroup ? t("Deleting...") : t("Delete group for everyone")}</span>
              </button>
            )}

            <section className="chat-information-section chat-information-members">
              <div className="chat-information-section-heading">
                <h4>{t("Members")}</h4>
                <span className="chat-information-count">{participants.length}</span>
              </div>
              <div className="chat-information-member-box">
                {visibleMembers.map((member) => (
                  <div className="chat-information-member" key={member.id}>
                    <Avatar
                      name={member.full_name || member.username}
                      src={member.profile_image}
                      size={40}
                      online={member.is_online}
                    />
                    <div className="chat-information-member-details">
                      <div className="chat-information-member-title">
                        <strong>{member.full_name || member.username}</strong>
                      </div>
                      <p>
                        {Number(member.id) === Number(user.id)
                          ? t("You")
                          : member.is_online
                            ? t("Online")
                            : member.last_seen
                              ? formatLastSeen(member.last_seen)
                              : t("Last seen hidden")}
                      </p>
                    </div>
                    {Number(member.id) === groupAdminId && (
                      <span className="chat-admin-badge">
                        {t("Admin")}{Number(member.id) === Number(user.id) ? ` (${t("You")})` : ""}
                      </span>
                    )}
                    <div className="chat-information-member-actions">
                      <button
                        className="chat-information-member-more"
                        aria-label={t("Member options")}
                        aria-expanded={openMemberMenuId === member.id}
                        title={t("Member options")}
                        onClick={() =>
                          setOpenMemberMenuId((openId) => openId === member.id ? null : member.id)
                        }
                      >
                        <FiMoreVertical />
                      </button>
                      {openMemberMenuId === member.id && (
                        <div className="chat-information-member-menu" role="menu">
                          {isGroupAdmin && Number(member.id) !== Number(user.id) ? (
                            <button
                              className="chat-list-menu-item chat-list-menu-item--danger"
                              role="menuitem"
                              onClick={() => removeMember(member)}
                            >
                              <FiTrash2 /> {t("Remove from group")}
                            </button>
                          ) : (
                            <span className="chat-information-admin-note">
                              {isGroupAdmin ? t("You are the group admin.") : t("Only the group admin can manage members.")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {participants.length > 5 && (
                <div className="chat-information-see-all">
                  <button
                    type="button"
                    className="chat-information-text-button"
                    onClick={() => setShowAllMembers((show) => !show)}
                  >
                    {t(showAllMembers ? "Show fewer members" : "See all members")}
                  </button>
                </div>
              )}
            </section>

            <section className="chat-information-section chat-information-theme">
              <button
                type="button"
                className="chat-information-theme-button"
                onClick={() => setShowThemes((show) => !show)}
                aria-expanded={showThemes}
              >
                {t("Chat theme")}
                <span>{showThemes ? "−" : "+"}</span>
              </button>
              {showThemes && (
                <div className="chat-theme-options" role="group" aria-label={t("Chat theme")}>
                  {chatThemes.map((theme) => (
                    <button
                      key={theme.name}
                      className={`chat-theme-swatch ${chatTheme === theme.name ? "chat-theme-swatch--selected" : ""}`}
                      style={{ backgroundColor: theme.color }}
                      aria-label={t(theme.name === "default" ? "Default" : theme.name)}
                      title={t(theme.name === "default" ? "Default" : theme.name)}
                      onClick={() => onThemeChange(theme.name)}
                    />
                  ))}
                </div>
              )}
            </section>
            {memberActionError && <p className="group-create-error" role="alert">{memberActionError}</p>}
          </>
        ) : (
          <>
            <div className="chat-information-profile">
              <Avatar name={displayName} src={other?.profile_image} size={88} />
              <h3>{displayName}</h3>
              <p>@{other?.username}</p>
            </div>
            <div className="chat-information-details">
              <section className="chat-information-section">
                <h4>{t("About")}</h4>
                <p>{other?.bio || t("No bio shared.")}</p>
              </section>
              <section className="chat-information-section">
                <h4>{t("Activity")}</h4>
                <p>
                  {other?.is_online
                    ? t("Online")
                    : other?.last_seen
                      ? formatLastSeen(other.last_seen)
                      : t("Last seen hidden")}
                </p>
              </section>
            </div>
            <section className="chat-information-section chat-information-theme">
              <button
                type="button"
                className="chat-information-theme-button"
                onClick={() => setShowThemes((show) => !show)}
                aria-expanded={showThemes}
              >
                {t("Chat theme")}
                <span>{showThemes ? "−" : "+"}</span>
              </button>
              {showThemes && (
                <div className="chat-theme-options" role="group" aria-label={t("Chat theme")}>
                  {chatThemes.map((theme) => (
                    <button
                      key={theme.name}
                      className={`chat-theme-swatch ${chatTheme === theme.name ? "chat-theme-swatch--selected" : ""}`}
                      style={{ backgroundColor: theme.color }}
                      aria-label={t(theme.name === "default" ? "Default" : theme.name)}
                      title={t(theme.name === "default" ? "Default" : theme.name)}
                      onClick={() => onThemeChange(theme.name)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
