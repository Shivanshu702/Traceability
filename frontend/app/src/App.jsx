import { useState, useEffect } from "react";
import CreateTraysPage   from "./pages/CreateTraysPage";
import ScanPage          from "./pages/ScanPage";
import HistoryPage       from "./pages/HistoryPage";
import Dashboard         from "./pages/Dashboard";
import AlertDashboard    from "./pages/AlertDashboard";
import LoginPage         from "./pages/LoginPage";
import AdminPage         from "./pages/AdminPage";
import ManageTraysPage   from "./pages/ManageTraysPage";
import DevPage           from "./pages/DevPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OperatorReport    from "./pages/OperatorReportPage";
import "./App.css";

export default function App() {
  const [user,        setUser]        = useState(null);
  const [page,        setPage]        = useState("dashboard");
  const [resetToken,  setResetToken]  = useState(null);

  const params  = new URLSearchParams(window.location.search);
  const devMode = params.get("dev") === "1";

  if (devMode) return <DevPage />;

  // Check for password reset token in URL — show reset page before anything else
  if (resetToken !== false) {
    const urlToken = params.get("token");
    if (urlToken && resetToken === null) {
      setResetToken(urlToken);
    } else if (resetToken === null) {
      setResetToken(false); // no token in URL, proceed normally
    }
  }

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get("token");
    if (urlToken) {
      setResetToken(urlToken);
      return; // don't auto-login while showing reset page
    }
    setResetToken(false);

    const token     = localStorage.getItem("token");
    const username  = localStorage.getItem("username");
    const role      = localStorage.getItem("role");
    const tenant_id = localStorage.getItem("tenant_id") || "default";

    const scanId = new URLSearchParams(window.location.search).get("scan");
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

  // Show reset password page if token found in URL
  if (resetToken) {
    return (
      <ResetPasswordPage
        onDone={() => {
          setResetToken(false);
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const isAdmin = user.role === "admin";

  const navTabs = [
    { key: "dashboard", label: "📊 Dashboard" },
    { key: "scan",      label: "📷 Scan" },
    { key: "history",   label: "📋 History" },
    { key: "create",    label: "➕ Create Trays" },
    ...(isAdmin ? [
      { key: "manage",   label: "🗂 Manage Trays" },
      { key: "alerts",   label: "🚨 Alerts" },
      { key: "operators",label: "👷 Operator Report" },
      { key: "admin",    label: "⚙ Admin" },
    ] : []),
  ];

  return (
    <div className="app">
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

      <main className="main">
        {page === "dashboard"  && <Dashboard />}
        {page === "scan"       && <ScanPage />}
        {page === "history"    && <HistoryPage />}
        {page === "create"     && <CreateTraysPage />}
        {page === "manage"     && isAdmin && <ManageTraysPage />}
        {page === "alerts"     && isAdmin && <AlertDashboard />}
        {page === "operators"  && isAdmin && <OperatorReport />}
        {page === "admin"      && isAdmin && <AdminPage />}
      </main>
    </div>
  );
}