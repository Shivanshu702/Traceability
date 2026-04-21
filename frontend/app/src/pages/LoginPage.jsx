import { useState } from "react";
import { loginUser, registerUser } from "../api/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

export default function LoginPage({ onLogin }) {
  const [mode,      setMode]      = useState("login"); // "login" | "register" | "forgot"
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [tenantId,  setTenantId]  = useState("default");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  function switchMode(m) {
    setMode(m); setError(""); setSuccess(""); setPassword("");
  }

  async function handleLogin() {
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) { setError("Please enter username and password."); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${BASE}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password: pw, tenant_id: tenantId.trim() || "default" }),
      });
      const data = await res.json();
      if (!res.ok || data.detail) { setError("Invalid username or password."); return; }
      localStorage.setItem("token",     data.access_token);
      localStorage.setItem("username",  data.username || name);
      localStorage.setItem("role",      data.role || "operator");
      localStorage.setItem("tenant_id", data.tenant_id || tenantId || "default");
      onLogin({
        username:  data.username  || name,
        role:      data.role      || "operator",
        tenant_id: data.tenant_id || tenantId || "default",
      });
    } catch { setError("Cannot reach server. Check your connection."); }
    finally   { setLoading(false); }
  }

  async function handleRegister() {
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) { setError("Please enter username and password."); return; }
    setLoading(true); setError("");
    try {
      const data = await registerUser(name, pw, "operator", tenantId.trim() || "default");
      if (data.error) { setError(data.error); return; }
      setSuccess("Account created! You can now log in.");
      switchMode("login");
    } catch { setError("Cannot reach server."); }
    finally   { setLoading(false); }
  }

  // New email-based forgot password — just requests the token email
  async function handleForgotRequest() {
    const name = username.trim();
    if (!name) { setError("Enter your username."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const res  = await fetch(`${BASE}/forgot-password/request`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: name, tenant_id: tenantId.trim() || "default" }),
      });
      const data = await res.json();
      // Always show the same message (backend prevents user enumeration)
      setSuccess(data.message || "If that account exists, a password reset link has been sent to the registered email.");
    } catch { setError("Cannot reach server."); }
    finally   { setLoading(false); }
  }

  function handleKey(e) {
    if (e.key !== "Enter") return;
    if (mode === "login")    handleLogin();
    if (mode === "register") handleRegister();
    if (mode === "forgot")   handleForgotRequest();
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0F1A" }}>
      <div style={{ background: "#162032", border: "1px solid #1E2D42", borderRadius: 14, padding: 32, width: "100%", maxWidth: 420 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: "#E8EFF8", fontWeight: 700, marginBottom: 4 }}>
            {mode === "login"    && "Sign In"}
            {mode === "register" && "Create Account"}
            {mode === "forgot"   && "Reset Password"}
          </h2>
          <p style={{ fontSize: 12, color: "#6B7E95" }}>
            {mode === "forgot"
              ? "Enter your username and we'll send a reset link to your registered email."
              : "Traceability System"}
          </p>
        </div>

        <Field label="Organisation ID">
          <input style={inp} placeholder="default"
            value={tenantId} onChange={e => setTenantId(e.target.value)}
            onKeyDown={handleKey} />
        </Field>

        <Field label="Username">
          <input style={inp} placeholder="Enter username"
            value={username} autoComplete="username"
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKey} />
        </Field>

        {(mode === "login" || mode === "register") && (
          <Field label="Password">
            <input type="password" style={inp} placeholder="Enter password"
              value={password} autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey} />
          </Field>
        )}

        {/* Info box for forgot mode */}
        {mode === "forgot" && (
          <div style={{ marginBottom: 14, background: "rgba(55,138,221,.08)", border: "1px solid rgba(55,138,221,.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#85B7EB", lineHeight: 1.6 }}>
            A reset link will be emailed to the address associated with your account.
            The link expires in 15 minutes. Contact your administrator if you don't receive it.
          </div>
        )}

        {error   && <div style={errBox}>{error}</div>}
        {success && <div style={okBox}>{success}</div>}

        {/* Primary action */}
        {!success && (
          <button
            onClick={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotRequest}
            disabled={loading}
            style={{ width: "100%", padding: 14, marginTop: 18, background: "#185FA5", color: "#E6F1FB", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Please wait…"
              : mode === "login"    ? "Sign In"
              : mode === "register" ? "Create Account"
              : "Send reset link"}
          </button>
        )}

        {/* Mode switcher */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {mode !== "forgot" && (
            <p style={{ textAlign: "center", fontSize: 13, color: "#378ADD", cursor: "pointer", margin: 0 }}
              onClick={() => switchMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "No account? Create one" : "Already have an account? Sign in"}
            </p>
          )}
          {mode === "login" && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#6B7E95", cursor: "pointer", margin: 0 }}
              onClick={() => switchMode("forgot")}>
              Forgot password?
            </p>
          )}
          {mode !== "login" && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#6B7E95", cursor: "pointer", margin: 0 }}
              onClick={() => switchMode("login")}>
              ← Back to Sign In
            </p>
          )}
        </div>
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

const inp    = { width: "100%", padding: "10px 13px", background: "#111827", border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8", fontSize: 13, outline: "none", boxSizing: "border-box" };
const errBox = { marginTop: 14, background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)", borderRadius: 8, padding: 12, color: "#F09595", fontSize: 13 };
const okBox  = { marginTop: 14, background: "rgba(59,109,17,.2)", border: "1px solid rgba(59,109,17,.4)", borderRadius: 8, padding: 12, color: "#97C459", fontSize: 13 };