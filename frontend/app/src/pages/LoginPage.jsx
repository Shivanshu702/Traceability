

import { useState } from "react";
import { loginUser, registerUser } from "../api/api";
import { useLang } from "../context/LangContext";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

/**
 * LoginPage
 * Props:
 *   onLogin   — callback after successful auth
 *   Controls  — optional component rendering the theme/lang toggles (from App)
 */
export default function LoginPage({ onLogin, Controls }) {
  const { t } = useLang();
  const [mode,      setMode]      = useState("login");
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [tenantId,  setTenantId]  = useState("default");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  // Forgot password fields
  const [resetKey,  setResetKey]  = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [newPwConf, setNewPwConf] = useState("");

  function switchMode(m) {
    setMode(m); setError(""); setSuccess("");
    setPassword(""); setResetKey(""); setNewPw(""); setNewPwConf("");
  }

  async function handleLogin() {
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) { setError(t("username") + " / " + t("password") + " required."); return; }
    setLoading(true); setError("");
    try {
      const data = await loginUser(name, pw, tenantId.trim() || "default");
      if (data.error || data.detail) { setError("Invalid username or password."); return; }
      localStorage.setItem("token",     data.access_token);
      localStorage.setItem("username",  data.username || name);
      localStorage.setItem("role",      data.role || "operator");
      localStorage.setItem("tenant_id", data.tenant_id || tenantId || "default");
      onLogin({
        username:  data.username  || name,
        role:      data.role      || "operator",
        tenant_id: data.tenant_id || tenantId || "default",
      });
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  async function handleRegister() {
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) { setError(t("username") + " / " + t("password") + " required."); return; }
    setLoading(true); setError("");
    try {
      const data = await registerUser(name, pw, "operator", tenantId.trim() || "default");
      if (data.error || data.detail) { setError(data.error || data.detail); return; }
      setSuccess("Account created! You can now log in.");
      switchMode("login");
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  async function handleForgotPassword() {
    const name   = username.trim();
    const tenant = tenantId.trim() || "default";
    if (!name)            { setError("Enter your username."); return; }
    if (!resetKey)        { setError("Enter the reset token."); return; }
    if (newPw.length < 6) { setError("New password must be ≥ 6 characters."); return; }
    if (newPw !== newPwConf) { setError("Passwords do not match."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`${BASE}/reset-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: resetKey, new_password: newPw }),
      });
      const data = await res.json();
      if (data.error || data.detail) { setError(data.error || data.detail); return; }
      setSuccess("Password updated successfully. You can now log in.");
      switchMode("login");
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  function handleKey(e) {
    if (e.key !== "Enter") return;
    if (mode === "login")    handleLogin();
    if (mode === "register") handleRegister();
    if (mode === "forgot")   handleForgotPassword();
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      transition: "background .2s",
    }}>
      {/* Theme + language controls — top-right of login screen */}
      {Controls && (
        <div style={{ position: "fixed", top: 16, right: 20, display: "flex", gap: 8, zIndex: 100 }}>
          <Controls />
        </div>
      )}

      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "32px 28px",
        width: "100%",
        maxWidth: 360,
        boxShadow: "var(--shadow)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>⚙</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            Traceability System
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {mode === "login"    ? t("signIn")  :
             mode === "register" ? t("createAcct") :
                                   t("resetPw")}
          </div>
        </div>

        {error   && <div className="err-box">{error}</div>}
        {success && <div className="ok-box">{success}</div>}

        {/* Username */}
        <div className="inp-group">
          <label className="inp-label">{t("username")}</label>
          <input
            className="inp"
            placeholder={t("username")}
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="username"
          />
        </div>

        {/* Organisation ID */}
        <div className="inp-group">
          <label className="inp-label">{t("orgId")}</label>
          <input
            className="inp"
            placeholder="default"
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        {/* Password (not shown in forgot mode) */}
        {mode !== "forgot" && (
          <div className="inp-group">
            <label className="inp-label">{t("password")}</label>
            <input
              className="inp"
              type="password"
              placeholder={t("password")}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
        )}

        {/* Forgot password extra fields */}
        {mode === "forgot" && (
          <>
            <div className="inp-group">
              <label className="inp-label">Reset Token</label>
              <input className="inp" placeholder="Token from email" value={resetKey}
                onChange={e => setResetKey(e.target.value)} onKeyDown={handleKey} />
            </div>
            <div className="inp-group">
              <label className="inp-label">New Password</label>
              <input className="inp" type="password" placeholder="Min. 6 characters" value={newPw}
                onChange={e => setNewPw(e.target.value)} onKeyDown={handleKey} />
            </div>
            <div className="inp-group">
              <label className="inp-label">Confirm Password</label>
              <input className="inp" type="password" placeholder="Repeat password" value={newPwConf}
                onChange={e => setNewPwConf(e.target.value)} onKeyDown={handleKey} />
            </div>
          </>
        )}

        {/* Primary action button */}
        <button
          className="btn btn-blue btn-lg"
          style={{ marginTop: 8 }}
          disabled={loading}
          onClick={
            mode === "login"    ? handleLogin    :
            mode === "register" ? handleRegister :
                                  handleForgotPassword
          }
        >
          {loading ? t("loading") :
           mode === "login"    ? t("signIn")    :
           mode === "register" ? t("createAcct") :
                                 t("resetPw")}
        </button>

        {/* Mode switcher links */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {mode !== "login" && (
            <button className="btn" style={{ fontSize: 12 }} onClick={() => switchMode("login")}>
              ← {t("login")}
            </button>
          )}
          {mode !== "register" && (
            <button className="btn" style={{ fontSize: 12 }} onClick={() => switchMode("register")}>
              {t("register")}
            </button>
          )}
          {mode !== "forgot" && (
            <button className="btn" style={{ fontSize: 12 }} onClick={() => switchMode("forgot")}>
              {t("forgotPw")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}