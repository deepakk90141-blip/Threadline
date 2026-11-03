import React, { createContext, useContext, useEffect, useState } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, if a token is already stored, verify it against the
  // backend so refreshing the page keeps the user logged in.
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setLoading(false);
      return;
    }

    authAPI
      .me()
      .then(async (res) => {
        setUser(res.data);
        const settingsRes = await authAPI.settings();
        setSettings(settingsRes.data);
      })
      .catch(() => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("currentUser");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const res = await authAPI.login({ username, password });
    localStorage.setItem("authToken", res.data.token);
    localStorage.setItem("currentUser", JSON.stringify(res.data.user));
    setUser(res.data.user);
    const settingsRes = await authAPI.settings();
    setSettings(settingsRes.data);
    return res.data.user;
  };

  const register = async (payload) => {
    const res = await authAPI.register(payload);
    localStorage.setItem("authToken", res.data.token);
    localStorage.setItem("currentUser", JSON.stringify(res.data.user));
    setUser(res.data.user);
    const settingsRes = await authAPI.settings();
    setSettings(settingsRes.data);
    return res.data.user;
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem("currentUser", JSON.stringify(nextUser));
  };

  const clearUser = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    setUser(null);
    setSettings(null);
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // Even if the request fails, clear local state so the user can log out.
    }
    clearUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        updateUser,
        settings,
        setSettings,
        loading,
        login,
        register,
        logout,
        clearUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
