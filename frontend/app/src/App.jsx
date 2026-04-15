import { useState, useEffect } from "react";
import CreateTraysPage  from "./pages/CreateTraysPage";
import ScanPage         from "./pages/ScanPage";
import HistoryPage      from "./pages/HistoryPage";
import Dashboard        from "./pages/Dashboard";
import AlertDashboard   from "./pages/AlertDashboard";
import LoginPage        from "./pages/LoginPage";
import AdminPage        from "./pages/AdminPage";
import ManageTraysPage  from "./pages/ManageTraysPage";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");

  useEffect(() => {
    const token     = localStorage.getItem("token");
    const username  = localStorage.getItem("username");
    const role      = localStorage.getItem("role");
    const tenant_id = localStorage.getItem("tenant_id") || "default";

    const params = new URLSearchParams(window.location.search);
    const scanId = params.get("scan");

    if (scanId) {
      localStorage.setItem("pendingScan", scanId);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (token && username) {
      setUser({ username, role: role || "operator", tenant_id });
      const pending = localStorage.getItem("pendingScan");
      if (pending) setPage("scan");
    }
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("username",  userData.username);
    localStorage.setItem("role",      userData.role);
    localStorage.setItem("tenant_id", userData.tenant_id || "default");
    setUser(userData);
    const pending = localStorage.getItem("pendingScan");
    setPage(pending ? "scan" : "dashboard");
  }

  function logout() {
    ["token", "username", "role", "tenant_id", "pendingScan"].forEach(k =>
      localStorage.removeItem(k)
    );
    window.history.replaceState({}, "", window.location.pathname);
    setUser(null);
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const isAdmin = user.role === "admin";

  // Nav tabs — Manage Trays is admin-only
  const navTabs = [
    { key: "dashboard", label: "📊 Dashboard" },
    { key: "scan",      label: "📷 Scan" },
    { key: "history",   label: "📋 History" },
    { key: "create",    label: "➕ Create Trays" },
    ...(isAdmin ? [
      { key: "manage",  label: "🗂 Manage Trays" },
      { key: "alerts",  label: "🚨 Alerts" },
      { key: "admin",   label: "⚙ Admin" },
    ] : []),
  ];

  return (
    <div className="app">
      {/* Header */}
      <header className="hdr">
        <span className="hdr-title">⚙ Traceability System</span>
        <span className="hdr-sub">{user.username}</span>
        <span className="hdr-sub" style={{ color: "#9CA3AF", fontSize: 11 }}>
          org: {user.tenant_id}
        </span>
        <span className="hdr-sub" style={{
          background: isAdmin ? "rgba(226,75,74,.2)" : "transparent",
          color: "#F09595",
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
        {navTabs.map(({ key, label }) => (
          <button
            key={key}
            className={`nb ${page === key ? "on" : ""}`}
            onClick={() => setPage(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Pages */}
      <main className="main">
        {page === "dashboard" && <Dashboard />}
        {page === "scan"      && <ScanPage />}
        {page === "history"   && <HistoryPage />}
        {page === "create"    && <CreateTraysPage />}
        {page === "manage"    && isAdmin && <ManageTraysPage />}
        {page === "alerts"    && isAdmin && <AlertDashboard />}
        {page === "admin"     && isAdmin && <AdminPage />}
      </main>
    </div>
  );
}