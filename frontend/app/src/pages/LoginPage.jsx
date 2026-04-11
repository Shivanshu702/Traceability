import { useState } from "react";
import { loginUser, registerUser } from "../api/api";

export default function LoginPage({ onLogin }) {
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [isRegister,  setIsRegister]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  async function handleSubmit() {
    const name = username.trim();
    const pw   = password.trim();

    if (!name || !pw) {
      setError("Please enter username and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isRegister) {
        const data = await registerUser(name, pw);
        if (data.error) { setError(data.error); return; }
        setError("");
        alert("Account created! You can now log in.");
        setIsRegister(false);
        return;
      }

      const data = await loginUser(name, pw);

      if (data.error) {
        setError("Invalid username or password.");
        return;
      }

      // Store token + meta
      localStorage.setItem("token",    data.access_token);
      localStorage.setItem("username", data.username || name);
      localStorage.setItem("role",     data.role || "operator");

      // Pass full user object to App
      onLogin({ username: data.username || name, role: data.role || "operator" });

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
        borderRadius: 14, padding: 32, width: "100%", maxWidth: 380,
      }}>
        <h2 style={{ color: "#E8EFF8", marginBottom: 24, fontWeight: 700 }}>
          {isRegister ? "Create Account" : "Sign In"}
        </h2>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#6B7E95", display: "block", marginBottom: 5 }}>
            Username
          </label>
          <input
            style={inputStyle}
            placeholder="Enter username"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#6B7E95", display: "block", marginBottom: 5 }}>
            Password
          </label>
          <input
            type="password"
            style={inputStyle}
            placeholder="Enter password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        {error && (
          <div style={{
            background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)",
            borderRadius: 8, padding: 12, color: "#F09595", fontSize: 13, marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", padding: 14, background: "#185FA5",
            color: "#E6F1FB", border: "none", borderRadius: 10,
            fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Please wait…" : isRegister ? "Create Account" : "Sign In"}
        </button>

        <p
          style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#378ADD", cursor: "pointer" }}
          onClick={() => { setIsRegister(!isRegister); setError(""); }}
        >
          {isRegister ? "Already have an account? Sign in" : "No account? Create one"}
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 13px", background: "#111827",
  border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};