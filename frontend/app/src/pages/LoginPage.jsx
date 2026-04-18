import { useState } from "react";
import { loginUser, registerUser } from "../api/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

export default function LoginPage({ onLogin }) {
  const [mode,       setMode]       = useState("login"); // "login" | "register" | "forgot"
  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [tenantId,   setTenantId]   = useState("default");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");

  // Forgot password fields
  const [resetKey,   setResetKey]   = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [newPwConf,  setNewPwConf]  = useState("");

  function switchMode(m) {
    setMode(m); setError(""); setSuccess("");
    setPassword(""); setResetKey(""); setNewPw(""); setNewPwConf("");
  }

  async function handleLogin() {
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) { setError("Please enter username and password."); return; }
    setLoading(true); setError("");
    try {
      const data = await loginUser(name, pw, tenantId.trim() || "default");
      if (data.error) { setError("Invalid username or password."); return; }
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

  async function handleForgotPassword() {
    const name   = username.trim();
    const tenant = tenantId.trim() || "default";
    if (!name)      { setError("Enter your username."); return; }
    if (!resetKey)  { setError("Enter the reset key provided by your administrator."); return; }
    if (newPw.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPw !== newPwConf) { setError("Passwords do not match."); return; }

    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`${BASE}/forgot-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          username:     name,
          tenant_id:    tenant,
          reset_key:    resetKey,
          new_password: newPw,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSuccess("Password updated successfully. You can now log in.");
      switchMode("login");
    } catch { setError("Cannot reach server."); }
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
      minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", background:"#0A0F1A",
    }}>
      <div style={{
        background:"#162032", border:"1px solid #1E2D42",
        borderRadius:14, padding:32, width:"100%", maxWidth:420,
      }}>
        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <h2 style={{ color:"#E8EFF8", fontWeight:700, marginBottom:4 }}>
            {mode === "login"    && "Sign In"}
            {mode === "register" && "Create Account"}
            {mode === "forgot"   && "Reset Password"}
          </h2>
          <p style={{ fontSize:12, color:"#6B7E95" }}>
            {mode === "forgot"
              ? "Enter your username and the reset key provided by your administrator."
              : "Traceability System"}
          </p>
        </div>

        {/* Organisation ID */}
        <Field label="Organisation ID">
          <input style={inp} placeholder="default"
            value={tenantId} onChange={e => setTenantId(e.target.value)}
            onKeyDown={handleKey} />
        </Field>

        {/* Username */}
        <Field label="Username">
          <input style={inp} placeholder="Enter username"
            value={username} autoComplete="username"
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKey} />
        </Field>

        {/* Password — login and register */}
        {(mode === "login" || mode === "register") && (
          <Field label="Password">
            <input type="password" style={inp} placeholder="Enter password"
              value={password} autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey} />
          </Field>
        )}

        {/* Forgot password fields */}
        {mode === "forgot" && (
          <>
            <Field label="Admin Reset Key">
              <input type="password" style={inp}
                placeholder="Provided by your system administrator"
                value={resetKey} onChange={e => setResetKey(e.target.value)}
                onKeyDown={handleKey} />
            </Field>
            <Field label="New Password">
              <input type="password" style={inp}
                placeholder="Min 6 characters"
                value={newPw} onChange={e => setNewPw(e.target.value)}
                onKeyDown={handleKey} />
            </Field>
            <Field label="Confirm New Password">
              <input type="password" style={{ ...inp, marginBottom:0 }}
                placeholder="Repeat new password"
                value={newPwConf} onChange={e => setNewPwConf(e.target.value)}
                onKeyDown={handleKey} />
            </Field>
          </>
        )}

        {/* Error / success */}
        {error && (
          <div style={{
            marginTop:14, background:"rgba(163,45,45,.2)",
            border:"1px solid rgba(163,45,45,.5)", borderRadius:8,
            padding:12, color:"#F09595", fontSize:13,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            marginTop:14, background:"rgba(59,109,17,.2)",
            border:"1px solid rgba(59,109,17,.4)", borderRadius:8,
            padding:12, color:"#97C459", fontSize:13,
          }}>
            {success}
          </div>
        )}

        {/* Primary action button */}
        <button
          onClick={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotPassword}
          disabled={loading}
          style={{
            width:"100%", padding:14, marginTop:18, background:"#185FA5",
            color:"#E6F1FB", border:"none", borderRadius:10,
            fontSize:15, fontWeight:700,
            cursor:loading ? "not-allowed" : "pointer",
            opacity:loading ? 0.6 : 1,
          }}>
          {loading ? "Please wait…"
            : mode === "login"    ? "Sign In"
            : mode === "register" ? "Create Account"
            : "Reset Password"}
        </button>

        {/* Mode switcher links */}
        <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
          {mode !== "forgot" && (
            <p
              style={{ textAlign:"center", fontSize:13, color:"#378ADD", cursor:"pointer", margin:0 }}
              onClick={() => switchMode(mode === "login" ? "register" : "login")}>
              {mode === "login"
                ? "No account? Create one"
                : "Already have an account? Sign in"}
            </p>
          )}

          {/* Forgot password link — only on login */}
          {mode === "login" && (
            <p
              style={{ textAlign:"center", fontSize:12, color:"#6B7E95", cursor:"pointer", margin:0 }}
              onClick={() => switchMode("forgot")}>
              Forgot password?
            </p>
          )}

          {/* Back to login — on forgot and register */}
          {mode !== "login" && (
            <p
              style={{ textAlign:"center", fontSize:12, color:"#6B7E95", cursor:"pointer", margin:0 }}
              onClick={() => switchMode("login")}>
              ← Back to Sign In
            </p>
          )}
        </div>

        {/* Forgot password info box */}
        {mode === "forgot" && (
          <div style={{
            marginTop:16, background:"rgba(55,138,221,.08)",
            border:"1px solid rgba(55,138,221,.2)", borderRadius:8,
            padding:"10px 14px", fontSize:11, color:"#85B7EB",
            lineHeight:1.6,
          }}>
            <strong>What is the Reset Key?</strong><br/>
            The <em>Admin Reset Key</em> is a secret code set by the system administrator
            in the server configuration (<code>ADMIN_RESET_KEY</code> environment variable).
            If you don't have it, contact your system administrator or developer.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, color:"#6B7E95", display:"block", marginBottom:5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inp = {
  width:"100%", padding:"10px 13px", background:"#111827",
  border:"1px solid #1E2D42", borderRadius:7, color:"#E8EFF8",
  fontSize:13, outline:"none", boxSizing:"border-box",
};