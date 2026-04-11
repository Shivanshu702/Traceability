import { useState, useEffect } from "react";
import ScanPage      from "./pages/ScanPage";
import HistoryPage   from "./pages/HistoryPage";
import Dashboard     from "./pages/Dashboard";
import AlertDashboard from "./pages/AlertDashboard";
import LoginPage     from "./pages/LoginPage";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);   // { username, role }
  const [page, setPage] = useState("dashboard");

  // ── Restore session on refresh ─────────────────────────────────────────────
  useEffect(() => {
    const token    = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const role     = localStorage.getItem("role");
    if (token && username) {
      setUser({ username, role: role || "operator" });
    }
  }, []);

  function handleLogin(userData) {
    // userData = { username, role } passed up from LoginPage
    localStorage.setItem("username", userData.username);
    localStorage.setItem("role",     userData.role);
    setUser(userData);
    setPage("dashboard");
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="app">
      {/* Header */}
      <header className="hdr">
        <span className="hdr-title">⚙ Traceability System</span>
        <span className="hdr-sub">{user.username}</span>
        <span className="hdr-sub" style={{ background: isAdmin ? "rgba(226,75,74,.2)", color: "#F09595" }}>
          {user.role}
        </span>
        <button
          className="btn btn-red"
          style={{ marginLeft: "auto", padding: "5px 14px", fontSize: 12 }}
          onClick={logout}
        >
          Logout
        </button>
      </header>

      {/* Nav */}
      <nav className="nav">
        <button className={`nb ${page === "dashboard"  ? "on" : ""}`} onClick={() => setPage("dashboard")}>
          📊 Dashboard
        </button>
        <button className={`nb ${page === "scan"       ? "on" : ""}`} onClick={() => setPage("scan")}>
          📷 Scan
        </button>
        <button className={`nb ${page === "history"    ? "on" : ""}`} onClick={() => setPage("history")}>
          📋 History
        </button>
        {isAdmin && (
          <button className={`nb ${page === "alerts" ? "on" : ""}`} onClick={() => setPage("alerts")}>
            🚨 Alerts
          </button>
        )}
      </nav>

      {/* Pages */}
      <main className="main">
        {page === "dashboard" && <Dashboard />}
        {page === "scan"      && <ScanPage  />}
        {page === "history"   && <HistoryPage />}
        {page === "alerts"    && isAdmin && <AlertDashboard />}
      </main>
    </div>
  );
}