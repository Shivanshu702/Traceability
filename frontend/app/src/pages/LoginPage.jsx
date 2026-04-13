import { useState } from "react";
import { loginUser, registerUser } from "../api/api";

export default function LoginPage({ onLogin }) {
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [tenantId,    setTenantId]    = useState("default");
  const [isRegister,  setIsRegister]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  async function handleSubmit() {
    const name   = username.trim();
    const pw     = password.trim();
    const tenant = tenantId.trim() || "default";

    if (!name || !pw) { setError("Please enter username and password."); return; }

    setLoading(true);
    setError("");

    try {
      if (isRegister) {
        const data = await registerUser(name, pw, "operator", tenant);
        if (data.error) { setError(data.error); return; }
        alert("Account created! You can now log in.");
        setIsRegister(false);
        return;
      }

      const data = await loginUser(name, pw, tenant);
      if (data.error) { setError("Invalid username or password."); return; }

      localStorage.setItem("token",     data.access_token);
      localStorage.setItem("username",  data.username || name);
      localStorage.setItem("role",      data.role || "operator");
      localStorage.setItem("tenant_id", data.tenant_id || tenant);

      onLogin({
        username:  data.username  || name,
        role:      data.role      || "operator",
        tenant_id: data.tenant_id || tenant,
      });
    } catch {
      setError("Cannot reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#0A0F1A",
    }}>
      <div style={{
        background: "#162032", border: "1px solid #1E2D42",
        borderRadius: 14, padding: 32, width: "100%", maxWidth: 400,
      }}>
        <h2 style={{ color: "#E8EFF8", marginBottom: 6, fontWeight: 700 }}>
          {isRegister ? "Create Account" : "Sign In"}
        </h2>
        <p style={{ fontSize: 12, color: "#6B7E95", marginBottom: 24 }}>
          Traceability System
        </p>

        <Field label="Organisation ID">
          <input
            style={inp}
            placeholder="default"
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
          />
        </Field>

        <Field label="Username">
          <input
            style={inp}
            placeholder="Enter username"
            value={username}
            autoComplete="username"
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            style={{ ...inp, marginBottom: 0 }}
            placeholder="Enter password"
            value={password}
            autoComplete="current-password"
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </Field>

        {error && (
          <div style={{
            marginTop: 14, background: "rgba(163,45,45,.2)",
            border: "1px solid rgba(163,45,45,.5)", borderRadius: 8,
            padding: 12, color: "#F09595", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", padding: 14, marginTop: 18, background: "#185FA5",
            color: "#E6F1FB", border: "none", borderRadius: 10,
            fontSize: 15, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Please wait…" : isRegister ? "Create Account" : "Sign In"}
        </button>

        <p
          style={{ marginTop: 16, textAlign: "center", fontSize: 13,
                   color: "#378ADD", cursor: "pointer" }}
          onClick={() => { setIsRegister(!isRegister); setError(""); }}
        >
          {isRegister ? "Already have an account? Sign in" : "No account? Create one"}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: "#6B7E95", display: "block", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", padding: "10px 13px", background: "#111827",
  border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};
