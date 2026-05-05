// C:\SHIVANSH\Traceability\frontend\app\src\pages\LoginPage.jsx //

import { useState } from "react";
import { loginUser, registerSendOtp, registerVerifyOtp, forgotPasswordRequest, forgotPasswordConfirm } from "../api/api";
import { useLang } from "../context/LangContext";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

export default function LoginPage({ onLogin, Controls }) {
  const { t } = useLang();
  const [mode,      setMode]      = useState("login");
  const [step,       setStep]       = useState(1);
  const [username,  setUsername]  = useState("");
  const [tenantId,   setTenantId]   = useState("default");
  const [password,  setPassword]  = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [email,      setEmail]      = useState("");
  const [otp,        setOtp]        = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [newPwConf,  setNewPwConf]  = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");

  // Forgot password fields
  // const [resetKey,  setResetKey]  = useState("");
  // const [newPw,     setNewPw]     = useState("");
  // const [newPwConf, setNewPwConf] = useState("");

  function switchMode(m) {
    setMode(m); setStep(1); setError(""); setSuccess("");
    setPassword(""); setConfirm(""); setEmail(""); setOtp("");
    setResetToken(""); setNewPw(""); setNewPwConf("");
  }

  // ------------------- Handlers for login, registration, and password reset ------------------ //
  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required."); return;
    }
    setLoading(true); setError("");
    try {
      const data = await loginUser(username.trim(), password, tenantId.trim() || "default");
      if (data.error || data.detail) { setError("Invalid username or password."); return; }
      localStorage.setItem("username",  data.username  || username);
      localStorage.setItem("role",      data.role      || "operator");
      localStorage.setItem("tenant_id", data.tenant_id || tenantId || "default");
      onLogin({ username: data.username || username, role: data.role || "operator", tenant_id: data.tenant_id || "default" });
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  // ── Register Step 1: send OTP ──────────────────────────────────────────────
  async function handleRegisterSendOtp() {
    if (!username.trim())       { setError("Username is required."); return; }
    if (!email.trim())          { setError("Email address is required."); return; }
    if (!password)              { setError("Password is required."); return; }
    if (password !== confirm)   { setError("Passwords do not match."); return; }
    if (password.length < 6)   { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const data = await registerSendOtp(username.trim(), email.trim(), password, confirm, tenantId.trim() || "default");
      if (data.error || data.detail) { setError(data.error || data.detail); return; }
      setSuccess(`OTP sent to ${email}. Check your inbox.`);
      setStep(2);
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  // ── Register Step 2: verify OTP ────────────────────────────────────────────
  async function handleRegisterVerifyOtp() {
    if (!otp.trim()) { setError("Enter the OTP from your email."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const data = await registerVerifyOtp(username.trim(), tenantId.trim() || "default", otp.trim());
      if (data.error || data.detail) { setError(data.error || data.detail); return; }
      setSuccess("Account created! You can now log in.");
      switchMode("login");
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  // ── Forgot Step 1: request reset email ────────────────────────────────────
  async function handleForgotRequest() {
    if (!username.trim()) { setError("Enter your username."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      await forgotPasswordRequest(username.trim(), tenantId.trim() || "default");
      setSuccess("If that account exists, a reset token has been emailed to your registered address.");
      setStep(2);
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  // ── Forgot Step 2: confirm with token ─────────────────────────────────────
  async function handleForgotConfirm() {
    if (!resetToken.trim())     { setError("Enter the reset token from your email."); return; }
    if (newPw.length < 6)       { setError("Password must be at least 6 characters."); return; }
    if (newPw !== newPwConf)    { setError("Passwords do not match."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const data = await forgotPasswordConfirm(resetToken.trim(), newPw);
      if (data.error || data.detail) { setError(data.error || data.detail); return; }
      setSuccess("Password updated! You can now log in.");
      switchMode("login");
    } catch { setError(t("cannotReachServer")); }
    finally   { setLoading(false); }
  }

  function handleKey(e) {
    if (e.key !== "Enter") return;
    if (mode === "login")    handleLogin();
    if (mode === "register" && step === 1) handleRegisterSendOtp();
    if (mode === "register" && step === 2) handleRegisterVerifyOtp();
    if (mode === "forgot"   && step === 1) handleForgotRequest();
    if (mode === "forgot"   && step === 2) handleForgotConfirm();
  }

  const inp = { className: "inp", onKeyDown: handleKey };

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
             mode === "register" ? (step === 1 ? t("createAcct") : "Verify Email")  :
                                   (step === 1 ? t("forgotPw")   : t("resetPw"))}
          </div>
          {/* Step indicator for multi-step flows */}
          {mode !== "login" && (
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
              {[1, 2].map(s => (
                <div key={s} style={{
                  width: 28, height: 4, borderRadius: 2,
                  background: step >= s ? "var(--accent, #185FA5)" : "var(--border)"
                }} />
              ))}
            </div>
          )}
        </div>

        {error   && <div className="err-box">{error}</div>}
        {success && <div className="ok-box">{success}</div>}

        {/* ── LOGIN ─────────────────────────────────────────────────────── */}
        {mode === "login" && (
          <>
            <div className="inp-group">
              <label className="inp-label">{t("username")}</label>
              <input {...inp} placeholder={t("username")} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="inp-group">
              <label className="inp-label">{t("orgId")}</label>
              <input {...inp} placeholder="default" value={tenantId} onChange={e => setTenantId(e.target.value)} />
            </div>
            <div className="inp-group">
              <label className="inp-label">{t("password")}</label>
              <input {...inp} type="password" placeholder={t("password")} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          </>
        )}

        {/* ── REGISTER Step 1 ───────────────────────────────────────────── */}
        {mode === "register" && step === 1 && (
          <>
            <div className="inp-group">
              <label className="inp-label">{t("username")}</label>
              <input {...inp} placeholder={t("username")} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="inp-group">
              <label className="inp-label">{t("orgId")}</label>
              <input {...inp} placeholder="default" value={tenantId} onChange={e => setTenantId(e.target.value)} />
            </div>
            <div className="inp-group">
              <label className="inp-label">{t("email")}</label>
              <input {...inp} type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="inp-group">
              <label className="inp-label">{t("password")}</label>
              <input {...inp} type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="inp-group">
              <label className="inp-label">Confirm Password</label>
              <input {...inp} type="password" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </>
        )}

        {/* ── REGISTER Step 2: OTP ──────────────────────────────────────── */}
        {mode === "register" && step === 2 && (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, textAlign: "center" }}>
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
            <div className="inp-group">
              <label className="inp-label">One-Time Code (OTP)</label>
              <input {...inp} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value)}
                style={{ letterSpacing: 8, fontSize: 22, textAlign: "center" }} maxLength={6} />
            </div>
          </>
        )}

        {/* ── FORGOT Step 1: request ─────────────────────────────────────── */}
        {mode === "forgot" && step === 1 && (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Enter your username and organisation. We'll email a reset token to your registered address.
            </p>
            <div className="inp-group">
              <label className="inp-label">{t("username")}</label>
              <input {...inp} placeholder={t("username")} value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="inp-group">
              <label className="inp-label">{t("orgId")}</label>
              <input {...inp} placeholder="default" value={tenantId} onChange={e => setTenantId(e.target.value)} />
            </div>
          </>
        )}

        {/* ── FORGOT Step 2: confirm ─────────────────────────────────────── */}
        {mode === "forgot" && step === 2 && (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Check your email for the reset token, then enter your new password below.
            </p>
            <div className="inp-group">
              <label className="inp-label">Reset Token (from email)</label>
              <input {...inp} placeholder="Paste token here" value={resetToken} onChange={e => setResetToken(e.target.value)} />
            </div>
            <div className="inp-group">
              <label className="inp-label">New Password</label>
              <input {...inp} type="password" placeholder="Min. 6 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div className="inp-group">
              <label className="inp-label">Confirm New Password</label>
              <input {...inp} type="password" placeholder="Repeat password" value={newPwConf} onChange={e => setNewPwConf(e.target.value)} />
            </div>
          </>
        )}

        {/* Primary action button */}
        <button className="btn btn-blue btn-lg" style={{ marginTop: 8 }} disabled={loading}
          onClick={
            mode === "login"                     ? handleLogin            :
            mode === "register" && step === 1    ? handleRegisterSendOtp  :
            mode === "register" && step === 2    ? handleRegisterVerifyOtp :
            mode === "forgot"   && step === 1    ? handleForgotRequest    :
                                                   handleForgotConfirm
          }>
          {loading ? t("loading") :
           mode === "login"                   ? t("signIn")          :
           mode === "register" && step === 1  ? "Send Verification Code" :
           mode === "register" && step === 2  ? "Verify & Create Account" :
           mode === "forgot"   && step === 1  ? "Send Reset Email"   :
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