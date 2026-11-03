import React, { useEffect, useState } from "react";
import { FiBell, FiCamera, FiMic, FiTrash2, FiUserX } from "react-icons/fi";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import { chatThemes } from "../utils/chatThemes";

const DEFAULT_SETTINGS = {
  full_name: "",
  bio: "",
  mobile_number: "",
  profile_image: null,
  read_receipts: true,
  group_add_policy: "everyone",
  default_message_timer: "off",
  last_seen_visibility: "everyone",
  bio_visibility: "everyone",
  profile_photo_visibility: "everyone",
  theme: "light",
  default_chat_theme: "default",
  app_language: "en",
};

const COPY = {
  en: {
    profile: "Profile",
    account: "Account",
    privacy: "Privacy",
    theme: "Theme",
    permissions: "Permissions",
    permissionHelp: "Allow access through your browser's system permission prompt. These permissions are stored by your browser for this site.",
    voicePermission: "Microphone access",
    cameraPermission: "Camera access",
    notificationPermission: "Notifications",
    permissionGranted: "Allowed",
    permissionDenied: "Blocked",
    permissionPrompt: "Not requested",
    permissionUnavailable: "Unavailable",
    permissionChecking: "Checking...",
    allowPermission: "Allow",
    permissionAllowedNotice: "Permission allowed.",
    permissionSecureContext: "Camera, microphone, and notification permissions require HTTPS or localhost. Open this site over HTTPS on your phone.",
    permissionDeniedHelp: "Permission is blocked by your browser. Change it in this site's browser permissions, then refresh.",
    permissionNoDevice: "No compatible device was found.",
    permissionError: "Could not request this permission.",
    chatBackground: "Default chat background",
    chatBackgroundHelp: "This is used for chats without a custom background.",
    language: "App language",
    save: "Save changes",
    name: "Name",
    bio: "About",
    mobile: "Phone number",
    photo: "Change profile photo",
    removePhoto: "Remove photo",
    username: "Username",
    email: "Email",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    changePassword: "Change password",
    deleteAccount: "Delete account",
    deleteWarning: "This permanently deletes your account and chat history.",
    readReceipts: "Read receipts",
    groupPolicy: "Who can add me to groups",
    groupNotAvailable: "Group chats are not currently available. This preference is saved for future group support.",
    timer: "Default message timer",
    lastSeen: "Last seen",
    bioVisibility: "About visibility",
    photoVisibility: "Profile photo visibility",
    blocked: "Blocked contacts",
    nobody: "Nobody",
    everyone: "Everyone",
    contacts: "My contacts",
    accepted: "My accepted only",
    off: "Off",
    hours24: "24 hours",
    days7: "7 days",
    days90: "90 days",
    light: "Light",
    dark: "Dark",
    selectChatColor: "Select chat background",
    english: "English",
    hindi: "Hindi",
    unblock: "Unblock",
    noBlocked: "No blocked contacts.",
  },
  hi: {
    profile: "प्रोफ़ाइल",
    account: "खाता",
    privacy: "गोपनीयता",
    theme: "थीम",
    permissions: "अनुमतियाँ",
    permissionHelp: "ब्राउज़र के सिस्टम अनुमति अनुरोध से एक्सेस दें। ये अनुमतियाँ इस साइट के लिए आपके ब्राउज़र में सहेजी जाती हैं।",
    voicePermission: "माइक्रोफ़ोन एक्सेस",
    cameraPermission: "कैमरा एक्सेस",
    notificationPermission: "नोटिफ़िकेशन",
    permissionGranted: "अनुमति दी गई",
    permissionDenied: "ब्लॉक है",
    permissionPrompt: "अनुरोध नहीं किया",
    permissionUnavailable: "उपलब्ध नहीं",
    permissionChecking: "जाँच हो रही है...",
    allowPermission: "अनुमति दें",
    permissionAllowedNotice: "अनुमति मिल गई।",
    permissionSecureContext: "कैमरा, माइक्रोफ़ोन और नोटिफ़िकेशन अनुमतियों के लिए HTTPS या localhost ज़रूरी है। फ़ोन पर यह साइट HTTPS से खोलें।",
    permissionDeniedHelp: "ब्राउज़र ने अनुमति ब्लॉक की है। इस साइट की ब्राउज़र अनुमतियों में इसे बदलकर पेज रीफ़्रेश करें।",
    permissionNoDevice: "कोई संगत डिवाइस नहीं मिला।",
    permissionError: "इस अनुमति का अनुरोध नहीं हो सका।",
    chatBackground: "डिफ़ॉल्ट चैट बैकग्राउंड",
    chatBackgroundHelp: "यह उन चैट में लागू होगा जिनका अपना बैकग्राउंड नहीं चुना गया है।",
    language: "ऐप की भाषा",
    save: "बदलाव सहेजें",
    name: "नाम",
    bio: "परिचय",
    mobile: "फ़ोन नंबर",
    photo: "प्रोफ़ाइल फ़ोटो बदलें",
    removePhoto: "फ़ोटो हटाएँ",
    username: "यूज़रनेम",
    email: "ईमेल",
    currentPassword: "मौजूदा पासवर्ड",
    newPassword: "नया पासवर्ड",
    confirmPassword: "नए पासवर्ड की पुष्टि करें",
    changePassword: "पासवर्ड बदलें",
    deleteAccount: "खाता हटाएँ",
    deleteWarning: "इससे आपका खाता और चैट इतिहास हमेशा के लिए हट जाएगा।",
    readReceipts: "पढ़े जाने की पुष्टि",
    groupPolicy: "मुझे ग्रुप में कौन जोड़ सकता है",
    groupNotAvailable: "अभी ग्रुप चैट उपलब्ध नहीं हैं। यह सेटिंग भविष्य के ग्रुप फ़ीचर के लिए सहेजी जाएगी।",
    timer: "डिफ़ॉल्ट संदेश टाइमर",
    lastSeen: "आख़िरी बार देखा गया",
    bioVisibility: "परिचय की दृश्यता",
    photoVisibility: "प्रोफ़ाइल फ़ोटो की दृश्यता",
    blocked: "ब्लॉक किए गए संपर्क",
    nobody: "कोई नहीं",
    everyone: "सभी",
    contacts: "मेरे संपर्क",
    accepted: "केवल स्वीकृत संपर्क",
    off: "बंद",
    hours24: "24 घंटे",
    days7: "7 दिन",
    days90: "90 दिन",
    light: "हल्की",
    dark: "गहरी",
    selectChatColor: "चैट बैकग्राउंड चुनें",
    english: "अंग्रेज़ी",
    hindi: "हिंदी",
    unblock: "अनब्लॉक",
    noBlocked: "कोई ब्लॉक किया संपर्क नहीं।",
  },
};

function errorText(error) {
  const data = error?.response?.data;
  if (!data) return error?.message || "Could not save changes.";
  if (data.detail) return data.detail;
  return Object.entries(data)
    .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(" ") : messages}`)
    .join(" ");
}

export default function SettingsPanel({ onClose }) {
  const { user, updateUser, settings: authSettings, setSettings: setAuthSettings, clearUser } = useAuth();
  const [section, setSection] = useState("profile");
  const [settings, setSettings] = useState(authSettings || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [account, setAccount] = useState({
    username: user?.username || "",
    email: user?.email || "",
    mobile_number: user?.mobile_number || "",
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [blocked, setBlocked] = useState([]);
  const [permissions, setPermissions] = useState({
    microphone: "checking",
    camera: "checking",
    notifications: "checking",
  });
  const [requestingPermission, setRequestingPermission] = useState("");
  const language = settings.app_language || "en";
  const t = (key) => COPY[language][key] || key;

  useEffect(() => {
    let cancelled = false;
    authAPI.settings()
      .then((response) => {
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...response.data });
          setAuthSettings(response.data);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorText(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setAuthSettings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || "light";
    document.documentElement.lang = settings.app_language || "en";
  }, [settings.theme, settings.app_language]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (section !== "privacy") return;
    authAPI.blockedContacts()
      .then((response) => setBlocked(response.data))
      .catch((loadError) => setError(errorText(loadError)));
  }, [section]);

  const saveSettings = async (values, multipart = false) => {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await authAPI.updateSettings(values);
      const next = { ...settings, ...response.data };
      setSettings(next);
      setAuthSettings(next);
      if (multipart && removePhoto) setRemovePhoto(false);
      setNotice(t("save"));
      return next;
    } catch (saveError) {
      setError(errorText(saveError));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const data = new FormData();
    ["full_name", "bio", "mobile_number"].forEach((field) => data.append(field, settings[field] || ""));
    if (photoFile) data.append("profile_image", photoFile);
    if (removePhoto) data.append("remove_profile_image", "true");
    const next = await saveSettings(data, true);
    if (next) {
      setPhotoFile(null);
      try {
        const userResponse = await authAPI.me();
        updateUser(userResponse.data);
        setAccount((previous) => ({ ...previous, mobile_number: next.mobile_number }));
      } catch (refreshError) {
        setError(errorText(refreshError));
      }
    }
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    setNotice("");
    setError("");
    if (account.new_password && account.new_password !== account.confirm_password) {
      setError("New password confirmation does not match.");
      return;
    }
    const payload = {
      username: account.username,
      email: account.email,
      mobile_number: account.mobile_number,
    };
    if (account.new_password) {
      payload.current_password = account.current_password;
      payload.new_password = account.new_password;
    }
    setSaving(true);
    try {
      const response = await authAPI.updateAccount(payload);
      updateUser(response.data);
      const nextSettings = { ...settings, mobile_number: response.data.mobile_number };
      setSettings(nextSettings);
      setAuthSettings(nextSettings);
      setAccount((previous) => ({
        ...previous,
        username: response.data.username,
        email: response.data.email,
        mobile_number: response.data.mobile_number,
      }));
      setAccount((previous) => ({
        ...previous,
        current_password: "",
        new_password: "",
        confirm_password: "",
      }));
      setNotice(t("save"));
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm(t("deleteWarning"))) return;
    const password = window.prompt(t("currentPassword"));
    if (password === null) return;
    setSaving(true);
    setError("");
    try {
      await authAPI.deleteAccount(password);
      clearUser();
      onClose();
    } catch (deleteError) {
      setError(errorText(deleteError));
    } finally {
      setSaving(false);
    }
  };

  const changeSetting = (field, value) => {
    setSettings((previous) => ({ ...previous, [field]: value }));
    setNotice("");
    setError("");
  };

  const savePrivacy = (event) => {
    event.preventDefault();
    return saveSettings({
      read_receipts: settings.read_receipts,
      group_add_policy: settings.group_add_policy,
      default_message_timer: settings.default_message_timer,
      last_seen_visibility: settings.last_seen_visibility,
      bio_visibility: settings.bio_visibility,
      profile_photo_visibility: settings.profile_photo_visibility,
    });
  };

  const unblock = async (contact) => {
    setError("");
    try {
      await authAPI.unblockContact(contact.id);
      setBlocked((previous) => previous.filter((item) => item.id !== contact.id));
    } catch (unblockError) {
      setError(errorText(unblockError));
    }
  };

  const refreshPermissions = async () => {
    const next = {
      microphone: "unavailable",
      camera: "unavailable",
      notifications: "unavailable",
    };
    if (navigator.mediaDevices?.getUserMedia) {
      for (const name of ["microphone", "camera"]) {
        try {
          const descriptor = await navigator.permissions?.query({
            name: name === "microphone" ? "microphone" : "camera",
          });
          next[name] = descriptor?.state || "prompt";
        } catch {
          next[name] = null;
        }
      }
    }
    if ("Notification" in window) {
      next.notifications = Notification.permission === "default"
        ? "prompt"
        : Notification.permission;
    }
    setPermissions((previous) => ({
      ...next,
      microphone: next.microphone || previous.microphone || "prompt",
      camera: next.camera || previous.camera || "prompt",
    }));
  };

  useEffect(() => {
    if (section !== "permissions") return undefined;
    const update = async () => {
      await refreshPermissions();
    };
    update();
    const onFocus = () => update();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [section]);

  const requestPermission = async (kind) => {
    setRequestingPermission(kind);
    setError("");
    setNotice("");
    try {
      if (!window.isSecureContext) {
        setError(t("permissionSecureContext"));
        return;
      }
      if (kind === "notifications") {
        if (!("Notification" in window)) {
          setPermissions((previous) => ({ ...previous, notifications: "unavailable" }));
          setError(t("permissionError"));
          return;
        }
        const permission = await Notification.requestPermission();
        setPermissions((previous) => ({
          ...previous,
          notifications: permission === "default" ? "prompt" : permission,
        }));
        if (permission === "granted") setNotice(t("permissionAllowedNotice"));
        else if (permission === "denied") setError(t("permissionDeniedHelp"));
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissions((previous) => ({ ...previous, [kind]: "unavailable" }));
        setError(t("permissionError"));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "microphone" ? { audio: true } : { video: true }
      );
      stream.getTracks().forEach((track) => track.stop());
      setPermissions((previous) => ({ ...previous, [kind]: "granted" }));
      setNotice(t("permissionAllowedNotice"));
    } catch (permissionError) {
      if (permissionError?.name === "NotAllowedError" || permissionError?.name === "PermissionDeniedError") {
        setPermissions((previous) => ({ ...previous, [kind]: "denied" }));
        setError(t("permissionDeniedHelp"));
      } else if (permissionError?.name === "NotFoundError" || permissionError?.name === "DevicesNotFoundError") {
        setError(t("permissionNoDevice"));
      } else {
        setError(t("permissionError"));
      }
    } finally {
      await refreshPermissions();
      setRequestingPermission("");
    }
  };

  const visibilityOptions = [
    ["everyone", t("everyone")],
    ["my_contacts", t("contacts")],
    ["accepted_only", t("accepted")],
    ["nobody", t("nobody")],
  ];

  const selectField = (label, field, options) => (
    <label className="settings-field">
      <span>{label}</span>
      <select value={settings[field]} onChange={(event) => changeSetting(field, event.target.value)}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  const saveButton = (submit = true) => (
    <button className="settings-save-button" type={submit ? "submit" : "button"} disabled={saving}>
      {saving ? "..." : t("save")}
    </button>
  );

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {["profile", "account", "privacy", "permissions", "theme", "language"].map((item) => (
          <button
            className={`settings-nav-item ${section === item ? "settings-nav-item--active" : ""}`}
            key={item}
            onClick={() => {
              setSection(item);
              setError("");
              setNotice("");
            }}
          >
            {t(item)}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {loading ? (
          <p className="account-panel-empty">Loading settings...</p>
        ) : (
          <>
            {notice && <p className="settings-notice">{notice}</p>}
            {error && <p className="settings-error">{error}</p>}
            {section === "profile" && (
              <form className="settings-form" onSubmit={saveProfile}>
                <div className="settings-photo-control">
                  <Avatar
                    name={settings.full_name || user?.username}
                    src={photoPreview || (removePhoto ? null : settings.profile_image)}
                    size={76}
                  />
                  <label className="settings-photo-button">
                    <FiCamera /> {t("photo")}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        setPhotoFile(event.target.files?.[0] || null);
                        setRemovePhoto(false);
                      }}
                    />
                  </label>
                  {settings.profile_image && (
                    <button
                      className="settings-text-button"
                      type="button"
                      onClick={() => {
                        setPhotoFile(null);
                        setRemovePhoto(true);
                        changeSetting("profile_image", null);
                      }}
                    >
                      {t("removePhoto")}
                    </button>
                  )}
                </div>
                <label className="settings-field">
                  <span>{t("name")}</span>
                  <input value={settings.full_name} maxLength={150} onChange={(event) => changeSetting("full_name", event.target.value)} />
                </label>
                <label className="settings-field">
                  <span>{t("bio")}</span>
                  <textarea value={settings.bio} maxLength={300} rows={3} onChange={(event) => changeSetting("bio", event.target.value)} />
                </label>
                <label className="settings-field">
                  <span>{t("mobile")}</span>
                  <input value={settings.mobile_number} maxLength={20} onChange={(event) => changeSetting("mobile_number", event.target.value)} />
                </label>
                {saveButton()}
              </form>
            )}
            {section === "account" && (
              <form className="settings-form" onSubmit={saveAccount}>
                <label className="settings-field">
                  <span>{t("username")}</span>
                  <input value={account.username} onChange={(event) => setAccount({ ...account, username: event.target.value })} required />
                </label>
                <label className="settings-field">
                  <span>{t("email")}</span>
                  <input type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} />
                </label>
                <label className="settings-field">
                  <span>{t("mobile")}</span>
                  <input value={account.mobile_number} onChange={(event) => setAccount({ ...account, mobile_number: event.target.value })} />
                </label>
                <div className="settings-subheading">{t("changePassword")}</div>
                <label className="settings-field">
                  <span>{t("currentPassword")}</span>
                  <input type="password" autoComplete="current-password" value={account.current_password} onChange={(event) => setAccount({ ...account, current_password: event.target.value })} />
                </label>
                <label className="settings-field">
                  <span>{t("newPassword")}</span>
                  <input type="password" autoComplete="new-password" value={account.new_password} onChange={(event) => setAccount({ ...account, new_password: event.target.value })} />
                </label>
                <label className="settings-field">
                  <span>{t("confirmPassword")}</span>
                  <input type="password" autoComplete="new-password" value={account.confirm_password} onChange={(event) => setAccount({ ...account, confirm_password: event.target.value })} />
                </label>
                {saveButton()}
                <div className="settings-danger-zone">
                  <div>
                    <strong>{t("deleteAccount")}</strong>
                    <p>{t("deleteWarning")}</p>
                  </div>
                  <button type="button" className="settings-delete-button" onClick={deleteAccount} disabled={saving}>
                    <FiTrash2 /> {t("deleteAccount")}
                  </button>
                </div>
              </form>
            )}
            {section === "privacy" && (
              <form className="settings-form" onSubmit={savePrivacy}>
                <label className="settings-toggle">
                  <span>{t("readReceipts")}</span>
                  <input
                    type="checkbox"
                    checked={settings.read_receipts}
                    onChange={(event) => changeSetting("read_receipts", event.target.checked)}
                  />
                </label>
                {selectField(t("groupPolicy"), "group_add_policy", [
                  ["everyone", t("everyone")],
                  ["my_contacts", t("contacts")],
                  ["accepted_only", t("accepted")],
                ])}
                <p className="settings-help">{t("groupNotAvailable")}</p>
                {selectField(t("timer"), "default_message_timer", [
                  ["off", t("off")],
                  ["24h", t("hours24")],
                  ["7d", t("days7")],
                  ["90d", t("days90")],
                ])}
                {selectField(t("lastSeen"), "last_seen_visibility", visibilityOptions)}
                {selectField(t("bioVisibility"), "bio_visibility", visibilityOptions)}
                {selectField(t("photoVisibility"), "profile_photo_visibility", visibilityOptions)}
                {saveButton()}
                <div className="settings-blocked-list">
                  <h3>{t("blocked")}</h3>
                  {blocked.length === 0 && <p>{t("noBlocked")}</p>}
                  {blocked.map((contact) => (
                    <div className="settings-blocked-contact" key={contact.id}>
                      <Avatar name={contact.full_name || contact.username} src={contact.profile_image} size={34} />
                      <span>{contact.full_name || contact.username}</span>
                      <button type="button" onClick={() => unblock(contact)}><FiUserX /> {t("unblock")}</button>
                    </div>
                  ))}
                </div>
              </form>
            )}
            {section === "permissions" && (
              <section className="settings-form settings-permissions">
                <p className="settings-help">{t("permissionHelp")}</p>
                {[
                  ["microphone", "voicePermission", <FiMic key="microphone" />],
                  ["camera", "cameraPermission", <FiCamera key="camera" />],
                  ["notifications", "notificationPermission", <FiBell key="notifications" />],
                ].map(([kind, label, icon]) => {
                  const permissionState = permissions[kind];
                  const stateLabel = {
                    granted: t("permissionGranted"),
                    denied: t("permissionDenied"),
                    prompt: t("permissionPrompt"),
                    unavailable: t("permissionUnavailable"),
                    checking: t("permissionChecking"),
                  }[permissionState] || t("permissionPrompt");
                  const isGranted = permissionState === "granted";
                  const isDenied = permissionState === "denied";
                  return (
                    <div className="settings-permission-row" key={kind}>
                      <div className="settings-permission-icon">{icon}</div>
                      <div className="settings-permission-info">
                        <strong>{t(label)}</strong>
                        <span className={`settings-permission-state settings-permission-state--${permissionState}`}>
                          {stateLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="settings-permission-button"
                        disabled={isGranted || permissionState === "unavailable" || permissionState === "checking" || requestingPermission === kind || isDenied}
                        onClick={() => requestPermission(kind)}
                      >
                        {requestingPermission === kind ? t("permissionChecking") : isGranted ? t("permissionGranted") : isDenied ? t("permissionDenied") : t("allowPermission")}
                      </button>
                    </div>
                  );
                })}
                {["camera", "microphone", "notifications"].some((kind) => permissions[kind] === "denied") ? (
                  <p className="settings-help">{t("permissionDeniedHelp")}</p>
                ) : null}
                {!window.isSecureContext && (
                  <p className="settings-help settings-permission-warning">{t("permissionSecureContext")}</p>
                )}
              </section>
            )}
            {section === "theme" && (
              <form className="settings-form" onSubmit={(event) => {
                event.preventDefault();
                saveSettings({
                  theme: settings.theme,
                  default_chat_theme: settings.default_chat_theme,
                });
              }}>
                {selectField(t("theme"), "theme", [["light", t("light")], ["dark", t("dark")]])}
                <fieldset className="settings-chat-theme">
                  <legend>{t("chatBackground")}</legend>
                  <p className="settings-help">{t("chatBackgroundHelp")}</p>
                  <div className="chat-theme-options settings-chat-theme-options" role="radiogroup" aria-label={t("selectChatColor")}>
                    {chatThemes.map((chatTheme) => (
                      <button
                        key={chatTheme.name}
                        type="button"
                        role="radio"
                        aria-checked={settings.default_chat_theme === chatTheme.name}
                        aria-label={t(chatTheme.name === "default" ? "Default" : chatTheme.name)}
                        title={t(chatTheme.name === "default" ? "Default" : chatTheme.name)}
                        className={`chat-theme-swatch ${settings.default_chat_theme === chatTheme.name ? "chat-theme-swatch--selected" : ""}`}
                        style={{ backgroundColor: chatTheme.color }}
                        onClick={() => changeSetting("default_chat_theme", chatTheme.name)}
                      />
                    ))}
                  </div>
                  <span className="settings-chat-theme-selected">
                    {t(settings.default_chat_theme === "default" ? "Default" : settings.default_chat_theme)}
                  </span>
                </fieldset>
                {saveButton()}
              </form>
            )}
            {section === "language" && (
              <form className="settings-form" onSubmit={(event) => {
                event.preventDefault();
                saveSettings({ app_language: settings.app_language });
              }}>
                {selectField(t("language"), "app_language", [["en", t("english")], ["hi", t("hindi")]])}
                {saveButton()}
                <p className="settings-help">
                  {language === "hi"
                    ? "भाषा बदलने पर सेटिंग पैनल की भाषा बदलती है।"
                    : "Changing language updates the settings panel language."}
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
