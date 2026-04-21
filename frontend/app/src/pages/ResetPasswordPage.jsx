import { useState, useEffect } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

export default function ResetPasswordPage({ onDone }) {
  const [token,    setToken]    = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  async function handleSubmit() {
    if (!token)          { setError("No reset token found. Please use the link from your email."); return; }
    if (newPw.length < 6){ setError("Password must be at least 6 characters."); return; }
    if (newPw !== confirm){ setError("Passwords do not match."); return; }

    setLoading(true); setError("");
    try {
      const res  = await fetch(`${BASE}/forgot-password/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok || data.detail) {
        setError(data.detail || data.message || "Reset failed. The link may have expired.");
        return;
      }
      setSuccess(true);
      // Clear token from URL
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      setError("Cannot reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h2 style={{ color: "#E8EFF8", fontWeight: 700, marginBottom: 8 }}>Password updated</h2>
            <p style={{ fontSize: 13, color: "#6B7E95" }}>You can now sign in with your new password.</p>
          </div>
          <button onClick={onDone} style={btnPrimary}>Go to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: "#E8EFF8", fontWeight: 700, marginBottom: 4 }}>Set new password</h2>
          <p style={{ fontSize: 12, color: "#6B7E95" }}>
            Enter your new password below. This link expires after 15 minutes.
          </p>
        </div>

        {!token && (
          <div style={infoBox}>
            ⚠ No token detected. Please click the link in your reset email rather than navigating here directly.
          </div>
        )}

        <Field label="New password">
          <input
            type="password" style={inp}
            placeholder="Min 6 characters"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password" style={{ ...inp, marginBottom: 0 }}
            placeholder="Repeat new password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </Field>

        {error && <div style={errBox}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || !token}
          style={{ ...btnPrimary, marginTop: 18, opacity: (loading || !token) ? 0.6 : 1 }}
        >
          {loading ? "Updating…" : "Update password"}
        </button>

        <p
          style={{ textAlign: "center", fontSize: 12, color: "#6B7E95", cursor: "pointer", marginTop: 16 }}
          onClick={onDone}
        >
          ← Back to Sign In
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: "#6B7E95", display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const wrap       = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0F1A" };
const card       = { background: "#162032", border: "1px solid #1E2D42", borderRadius: 14, padding: 32, width: "100%", maxWidth: 420 };
const inp        = { width: "100%", padding: "10px 13px", background: "#111827", border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8", fontSize: 13, outline: "none", boxSizing: "border-box" };
const btnPrimary = { width: "100%", padding: 14, background: "#185FA5", color: "#E6F1FB", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" };
const errBox     = { marginTop: 14, background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)", borderRadius: 8, padding: 12, color: "#F09595", fontSize: 13 };
const infoBox    = { marginBottom: 14, background: "rgba(186,117,23,.1)", border: "1px solid rgba(186,117,23,.3)", borderRadius: 8, padding: 12, color: "#FAC775", fontSize: 12 };