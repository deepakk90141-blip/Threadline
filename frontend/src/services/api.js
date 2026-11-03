import axios from "axios";

// Backend host: VITE_BACKEND_HOST if set, otherwise the host the page was
// opened from (so it also works when you open the app from your phone).
const pageHost = window.location.hostname;
const isLoopbackPage = ["localhost", "127.0.0.1"].includes(pageHost);
const devTunnelBackendHost = pageHost.replace(
  /^(.+)-5173(\..*\.devtunnels\.ms)$/i,
  "$1-8000$2"
);
const defaultHost = isLoopbackPage
  ? "127.0.0.1:8000"
  : devTunnelBackendHost !== pageHost
    ? devTunnelBackendHost
    : `${pageHost}:8000`;
const configuredBackendHost = import.meta.env.VITE_BACKEND_HOST?.trim();
const configuredLoopbackHost = /^(localhost|127(?:\.\d{1,3}){3})(:\d+)?$/i.test(configuredBackendHost || "");
const BACKEND_HOST =
  configuredBackendHost && !(configuredLoopbackHost && !isLoopbackPage)
    ? configuredBackendHost
    : defaultHost;
const secure = window.location.protocol === "https:";
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const configuredApiUrl = configuredApiBaseUrl ? new URL(configuredApiBaseUrl) : null;

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.toString().replace(/\/+$/, "")
  : `${secure ? "https" : "http"}://${BACKEND_HOST}/api`;
export const WS_BASE_URL = configuredApiUrl
  ? `${configuredApiUrl.protocol === "https:" ? "wss" : "ws"}://${configuredApiUrl.host}`
  : `${secure ? "wss" : "ws"}://${BACKEND_HOST}`;

const api = axios.create({
  baseURL: API_BASE_URL,
});

export function authErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      const message = Array.isArray(value) ? value[0] : value;
      if (typeof message === "string" && message) return message;
    }
  }
  if (error.response) return fallback;
  return `Cannot reach the server at ${API_BASE_URL}. Make sure the backend is running and reachable. For Dev Tunnels, expose backend port 8000 over HTTPS too; on Wi-Fi, run Django with 0.0.0.0:8000 and open the app using your PC's Wi-Fi IP.`;
}

// Attach the auth token (if we have one) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

// If the token is rejected, clean up and bounce to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only treat 401 as "session expired" when we actually had a token
    // (a wrong password on the login form is also a 401).
    if (error.response?.status === 401 && localStorage.getItem("authToken")) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("currentUser");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post("/register/", data),
  login: (data) => api.post("/login/", data),
  logout: () => api.post("/logout/"),
  me: () => api.get("/me/"),
  settings: () => api.get("/settings/"),
  updateSettings: (data) => api.patch("/settings/", data),
  updateAccount: (data) => api.patch("/account/", data),
  deleteAccount: (password) => api.delete("/account/", { data: { password } }),
  blockedContacts: () => api.get("/contacts/blocked/"),
  unblockContact: (userId) => api.delete(`/contacts/blocked/${userId}/`),
};

export const userAPI = {
  list: () => api.get("/users/"),
  search: (query) => api.get(`/users/search/?q=${encodeURIComponent(query)}`),
};

export const conversationAPI = {
  list: () => api.get("/conversations/"),
  create: (userId) => api.post("/conversations/create/", { user_id: userId }),
  createGroup: (groupName, userIds) =>
    api.post("/conversations/groups/create/", { group_name: groupName, user_ids: userIds }),
  removeGroupMember: (conversationId, userId) =>
    api.post(`/conversations/${conversationId}/members/${userId}/remove/`),
  addGroupMembers: (conversationId, userIds) =>
    api.post(`/conversations/${conversationId}/members/add/`, { user_ids: userIds }),
  updateGroupInformation: (conversationId, information) =>
    api.patch(`/conversations/${conversationId}/information/`, information),
  deleteGroup: (conversationId) => api.delete(`/conversations/${conversationId}/group/`),
  messages: (conversationId) => api.get(`/conversations/${conversationId}/messages/`),
  delete: (conversationId) => api.delete(`/conversations/${conversationId}/delete/`),
  action: (conversationIds, action) =>
    api.post("/conversations/actions/", { conversation_ids: conversationIds, action }),
};

export const messageAPI = {
  collection: (kind) => api.get(`/messages/collection/?kind=${encodeURIComponent(kind)}`),
  cleanupExpired: () => api.post("/messages/expire/"),
  action: (messageId, data) => api.post(`/messages/${messageId}/action/`, data),
  deleteForMe: (messageId) => api.post(`/messages/${messageId}/action/`, { action: "delete_for_me" }),
  toggleStar: (messageId) => api.post(`/messages/${messageId}/action/`, { action: "toggle_star" }),
  deleteForEveryone: (messageId) =>
    api.post(`/messages/${messageId}/action/`, { action: "delete_for_everyone" }),
  forward: (messageId, userId) =>
    api.post(`/messages/${messageId}/action/`, { action: "forward", user_id: userId }),
};

export default api;
