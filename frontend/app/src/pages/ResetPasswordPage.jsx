import { useState, useEffect } from "react";
import { useLang } from "../context/LangContext";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

export default function ResetPasswordPage({ onDone }) {
  const { t } = useLang();
  const [token,   setToken]   = useState("");
  const [newPw,   setNewPw]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("token");
    if (tok) setToken(tok);
  }, []);

  async function handleSubmit() {
    if (!token)           { setError("No reset token found. Please use the link from your email."); return; }
    if (newPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPw !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${BASE}/forgot-password/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok || data.detail) {
        setError(data.detail || data.message || "Reset failed. The link may have expired.");
        return;
      }
      setSuccess(true);
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      setError(t("cannotReachServer"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <h2 style={{ color:"var(--text)", fontWeight:700, marginBottom:8 }}>Password updated</h2>
            <p style={{ fontSize:13, color:"var(--muted)" }}>You can now sign in with your new password.</p>
          </div>
          <button onClick={onDone} style={btnPrimary}>Go to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom:24 }}>
          <h2 style={{ color:"var(--text)", fontWeight:700, marginBottom:4 }}>Set new password</h2>
          <p style={{ fontSize:12, color:"var(--muted)" }}>
            Enter your new password below. This link expires after 15 minutes.
          </p>
        </div>

        {!token && (
          <div style={infoBox}>
            ⚠ No token detected. Please click the link in your reset email rather than navigating here directly.
          </div>
        )}

        <Field label="New password">
          <input type="password" style={inp} placeholder="Min 6 characters"
            value={newPw} onChange={e => setNewPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </Field>

        <Field label="Confirm new password">
          <input type="password" style={{ ...inp, marginBottom:0 }} placeholder="Repeat new password"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </Field>

        {error && <div style={errBox}>{error}</div>}

        <button onClick={handleSubmit} disabled={loading || !token}
          style={{ ...btnPrimary, marginTop:18, opacity:(loading || !token) ? 0.6 : 1 }}>
          {loading ? "Updating…" : "Update password"}
        </button>

        <p onClick={onDone}
          style={{ textAlign:"center", fontSize:12, color:"var(--muted)", cursor:"pointer", marginTop:16 }}>
          ← Back to Sign In
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, color:"var(--muted)", display:"block", marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

// ── Styles — all CSS variables so they respond to theme toggle ────────────────
const wrap       = { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" };
const card       = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:32, width:"100%", maxWidth:420 };
const inp        = { width:"100%", padding:"10px 13px", background:"var(--inp-bg)", border:"1px solid var(--border)", borderRadius:7, color:"var(--text)", fontSize:13, outline:"none", boxSizing:"border-box" };
const btnPrimary = { width:"100%", padding:14, background:"var(--accent-dk)", color:"#E6F1FB", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer" };
const errBox     = { marginTop:14, background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)", borderRadius:8, padding:12, color:"#F09595", fontSize:13 };
const infoBox    = { marginBottom:14, background:"rgba(186,117,23,.1)", border:"1px solid rgba(186,117,23,.3)", borderRadius:8, padding:12, color:"#FAC775", fontSize:12 };