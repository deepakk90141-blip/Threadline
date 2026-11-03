import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiMessageCircle } from "react-icons/fi";
import { authErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(form.username, form.password);
      navigate("/");
    } catch (err) {
      setError(authErrorMessage(err, "Login failed. Please check your details and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <FiMessageCircle size={28} />
          <span>Threadline</span>
        </div>
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Log in to keep the conversation going.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input name="username" value={form.username} onChange={handleChange} autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
