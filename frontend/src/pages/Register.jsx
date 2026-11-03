import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiMessageCircle } from "react-icons/fi";
import { authErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    full_name: "",
    mobile_number: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(authErrorMessage(err, "Registration failed. Please check your details and try again."));
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
        <h1>Create your account</h1>
        <p className="auth-subtitle">A couple of details and you're in.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input name="username" value={form.username} onChange={handleChange} autoComplete="username" required />
          </label>
          <label>
            Full name
            <input name="full_name" value={form.full_name} onChange={handleChange} autoComplete="name" />
          </label>
          <label>
            Email
            <input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" required />
          </label>
          <label>
            Mobile number
            <input name="mobile_number" value={form.mobile_number} onChange={handleChange} autoComplete="tel" />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
