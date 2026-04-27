import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

import CreateTraysPage from "./pages/CreateTraysPage";
import ScanPage        from "./pages/ScanPage";
import HistoryPage     from "./pages/HistoryPage";
import Dashboard       from "./pages/Dashboard";
import AlertDashboard  from "./pages/AlertDashboard";
import LoginPage       from "./pages/LoginPage";
import AdminPage       from "./pages/AdminPage";
import ManageTraysPage from "./pages/ManageTraysPage";
import DevPage         from "./pages/DevPage";

import { useTheme }           from "./context/ThemeContext";
import { useLang, LANGUAGES } from "./context/LangContext";

import "./App.css";

// ── Auth-required wrapper ──────────────────────────────────────────────────────
function RequireAuth({ user, children }) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

// ── Admin-only wrapper ─────────────────────────────────────────────────────────
function RequireAdmin({ user, children }) {
  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

// ── Inner app (has access to router + context hooks) ───────────────────────────
function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);

  // Theme: dark / light toggle
  const { theme, toggleTheme } = useTheme();

  // Language: current lang + setter + full list
  const { t, lang, setLang } = useLang();

  // Rehydrate session from localStorage display fields.
  // The JWT itself travels as an HttpOnly cookie — only non-sensitive
  // display fields (username, role, tenant_id) live in localStorage.
  useEffect(() => {
    const username  = localStorage.getItem("username");
    const role      = localStorage.getItem("role");
    const tenant_id = localStorage.getItem("tenant_id") || "default";
    if (username) {
      setUser({ username, role: role || "operator", tenant_id });
    }
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("username",  userData.username);
    localStorage.setItem("role",      userData.role);
    localStorage.setItem("tenant_id", userData.tenant_id || "default");
    setUser(userData);

    const from = location.state?.from?.pathname || "/";
    navigate(from, { replace: true });
  }

  async function logout() {
    await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:8001"}/logout`,
      { method: "POST", credentials: "include" },
    );
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    localStorage.removeItem("tenant_id");
    setUser(null);
    navigate("/login", { replace: true });
  }

  const isAdmin = user?.role === "admin";

  // ── Nav tabs ───────────────────────────────────────────────────────────────
  const navTabs = [
    { to: "/",        label: `📊 ${t("dashboard")}` },
    { to: "/scan",    label: `📷 ${t("scan")}`      },
    { to: "/history", label: `📋 ${t("history")}`   },
    { to: "/create",  label: `➕ ${t("createTrays")}` },
    ...(isAdmin ? [
      { to: "/manage", label: `🗂 ${t("manageTrays")}` },
      { to: "/alerts", label: `🚨 ${t("alerts")}`      },
      { to: "/admin",  label: `⚙ ${t("admin")}`        },
    ] : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {user && (
        <>
          <header className="hdr">
            {/* ── Brand ── */}
            <span className="hdr-title">⚙ Traceability System</span>
            <span className="hdr-sub">{user.username}</span>
            <span className="hdr-sub" style={{ color: "#9CA3AF", fontSize: 11 }}>
              {t("org")}: {user.tenant_id}
            </span>
            <span
              className="hdr-sub"
              style={{
                background: isAdmin ? "rgba(226,75,74,.2)" : "transparent",
                color: "#F09595",
              }}
            >
              {user.role}
            </span>

            {/* ── Controls ── */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>

              {/* Language selector */}
              <select
                value={lang}
                onChange={e => setLang(e.target.value)}
                title={t("language")}
                style={{
                  fontSize: 12,
                  padding: "3px 6px",
                  borderRadius: 6,
                  border: "1px solid var(--border, #374151)",
                  background: "var(--card-bg, #1F2937)",
                  color: "var(--text, #F9FAFB)",
                  cursor: "pointer",
                  maxWidth: 140,
                }}
              >
                {LANGUAGES.map(({ code, label, flag }) => (
                  <option key={code} value={code}>
                    {flag} {label}
                  </option>
                ))}
              </select>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? t("lightMode") : t("darkMode")}
                style={{
                  fontSize: 16,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border, #374151)",
                  background: "var(--card-bg, #1F2937)",
                  color: "var(--text, #F9FAFB)",
                  cursor: "pointer",
                  lineHeight: 1.4,
                }}
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>

              {/* Logout */}
              <button
                className="btn btn-red"
                style={{ padding: "5px 14px", fontSize: 12 }}
                onClick={logout}
              >
                {t("logout")}
              </button>
            </div>
          </header>

          <nav className="nav">
            {navTabs.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => `nb${isActive ? " on" : ""}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </>
      )}

      <main className="main">
        <Routes>
          {/* Developer panel – no login, guarded by DEV_KEY on backend */}
          <Route path="/dev" element={<DevPage />} />

          {/* Auth */}
          <Route
            path="/login"
            element={
              user
                ? <Navigate to="/" replace />
                : <LoginPage onLogin={handleLogin} />
            }
          />

          {/* Protected routes */}
          <Route path="/" element={
            <RequireAuth user={user}><Dashboard /></RequireAuth>
          } />
          <Route path="/scan" element={
            <RequireAuth user={user}><ScanPage /></RequireAuth>
          } />
          <Route path="/history" element={
            <RequireAuth user={user}><HistoryPage /></RequireAuth>
          } />
          <Route path="/create" element={
            <RequireAuth user={user}><CreateTraysPage /></RequireAuth>
          } />

          {/* Admin-only routes */}
          <Route path="/manage" element={
            <RequireAdmin user={user}><ManageTraysPage /></RequireAdmin>
          } />
          <Route path="/alerts" element={
            <RequireAdmin user={user}><AlertDashboard /></RequireAdmin>
          } />
          <Route path="/admin" element={
            <RequireAdmin user={user}><AdminPage /></RequireAdmin>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}