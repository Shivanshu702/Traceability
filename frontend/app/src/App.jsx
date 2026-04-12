import CreateTraysPage from "./pages/CreateTraysPage";
import { useState, useEffect } from "react";
import ScanPage       from "./pages/ScanPage";
import HistoryPage    from "./pages/HistoryPage";
import Dashboard      from "./pages/Dashboard";
import AlertDashboard from "./pages/AlertDashboard";
import LoginPage      from "./pages/LoginPage";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");

  // ── Restore session + handle ?scan= QR param ──────────────────────────────
  useEffect(() => {
    const token    = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const role     = localStorage.getItem("role");

    // Always capture ?scan= from URL first, regardless of login state
    const params = new URLSearchParams(window.location.search);
    const scanId = params.get("scan");

    if (scanId) {
      // Save it to localStorage so it survives the login redirect
      localStorage.setItem("pendingScan", scanId);
      // Clean the URL immediately
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (token && username) {
      setUser({ username, role: role || "operator" });

      // Already logged in — if there's a pending scan, go to scan page
      const pending = localStorage.getItem("pendingScan");
      if (pending) {
        setPage("scan");
      }
    }
    // If not logged in, pendingScan stays in localStorage until after login
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("username", userData.username);
    localStorage.setItem("role",     userData.role);
    setUser(userData);

    // After login, check if there's a pending QR scan
    const pending = localStorage.getItem("pendingScan");
    if (pending) {
      // Don't remove yet — ScanPage will read it and remove it
      setPage("scan");
    } else {
      setPage("dashboard");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    localStorage.removeItem("pendingScan");
    window.history.replaceState({}, "", window.location.pathname);
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
        <span className="hdr-sub" style={{
          background: isAdmin ? "rgba(226,75,74,.2)" : "transparent",
          color: "#F09595"
        }}>
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
        <button
          className={`nb ${page === "dashboard" ? "on" : ""}`}
          onClick={() => setPage("dashboard")}
        >
          📊 Dashboard
        </button>
        <button
          className={`nb ${page === "scan" ? "on" : ""}`}
          onClick={() => setPage("scan")}
        >
          📷 Scan
        </button>
        <button
          className={`nb ${page === "history" ? "on" : ""}`}
          onClick={() => setPage("history")}
        >
          📋 History
        </button>
        <button
          className={`nb ${page === "create" ? "on" : ""}`}
          onClick={() => setPage("create")}
        >
          ➕ Create Trays
        </button>
        {isAdmin && (
          <button
            className={`nb ${page === "alerts" ? "on" : ""}`}
            onClick={() => setPage("alerts")}
          >
            🚨 Alerts
          </button>
        )}
      </nav>

      {/* Pages */}
      <main className="main">
        {page === "dashboard" && <Dashboard />}
        {page === "scan"      && <ScanPage />}
        {page === "history"   && <HistoryPage />}
        {page === "create"    && <CreateTraysPage />}
        {page === "alerts"    && isAdmin && <AlertDashboard />}
      </main>
    </div>
  );
}