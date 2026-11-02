
// C:\SHIVANSH\Traceability\frontend\app\src\App.jsx //

import { invalidatePipeline } from "./hooks/usePipeline";
import { getMe } from "./api/api";
import { useIntegrationContext, DEFAULT  } from "./context/IntegrationContext";
import { SMT_NAV, SMT_ROUTE } from "./routes/integrationRoutes";
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

import OperatorReportPage  from "./pages/OperatorReportPage";
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

// ── Feature wrapper: admin always passes; others need the feature in their role ──
const can = (user, feature) => !!user && (user.role === "admin" || (user.permissions || []).includes(feature));

function RequireFeature({ user, feature, children }) {
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!can(user, feature)) return <Navigate to={firstAllowedPath(user)} replace />;
  return children;
}

function firstAllowedPath(user) {
  const order = [["dashboard", "/"], ["scan", "/scan"], ["history", "/history"], ["create_trays", "/create"], ["alerts", "/alerts"]];
  const hit = order.find(([f]) => can(user, f));
  return hit ? hit[1] : "/login";
}

// ── Admin-only wrapper ─────────────────────────────────────────────────────────
function RequireAdmin({ user, children }) {
  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

// ── QR deep link ───────────────────────────────────────────────────────────────
// Printed QR codes encode  <FRONTEND_URL>?scan=<TRAY_ID>. Capture the id at module
// load, before the router (or the login redirect) rewrites the URL, and clean it.
(function captureScanDeepLink() {
  try {
    const id = new URLSearchParams(window.location.search).get("scan");
    if (id && id.trim()) {
      localStorage.setItem("pendingScan", id.trim().toUpperCase());
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch { /* storage unavailable — ignore */ }
})();

// ── Inner app ──────────────────────────────────────────────────────────────────
function AppShell() {
  const { refreshConfig, setConfig } = useIntegrationContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);

  const { theme, toggleTheme } = useTheme();
  const { t, lang, setLang }   = useLang();

  // Rehydrate session — JWT lives in HttpOnly cookie, display fields in localStorage
  useEffect(() => {
    const username  = localStorage.getItem("username");
    const role      = localStorage.getItem("role");
    const tenant_id = localStorage.getItem("tenant_id") || "default";
    if (username) {
      let permissions = [];
      try { permissions = JSON.parse(localStorage.getItem("permissions") || "[]"); } catch { /* ignore */ }
      setUser({ username, role: role || "operator", tenant_id, permissions });
      // Refresh role + permissions from the server (an admin may have changed them).
      getMe().then(me => {
        localStorage.setItem("role", me.role);
        localStorage.setItem("permissions", JSON.stringify(me.permissions || []));
        setUser(u => u && ({ ...u, role: me.role, permissions: me.permissions || [] }));
      }).catch(() => { /* 401 is handled by the api layer */ });
    }
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("username",  userData.username);
    localStorage.setItem("role",      userData.role);
    localStorage.setItem("tenant_id", userData.tenant_id || "default");
    localStorage.setItem("permissions", JSON.stringify(userData.permissions || []));
    if (userData.token) {
      localStorage.setItem("token", userData.token);
    }
    invalidatePipeline();
    refreshConfig();
    setUser(userData);
    if (!userData.permissions) {            // e.g. after registration: ask the server
      getMe().then(me => {
        localStorage.setItem("permissions", JSON.stringify(me.permissions || []));
        setUser(u => u && ({ ...u, role: me.role, permissions: me.permissions || [] }));
      }).catch(() => {});
    }
    const from = localStorage.getItem("pendingScan")
      ? "/scan"                                   // continue the QR scan that started the login
      : (location.state?.from?.pathname || "/");
    navigate(from, { replace: true });
  }

  // Already signed in and a QR deep link is waiting → open the scan page.
  useEffect(() => {
    if (user && localStorage.getItem("pendingScan") && location.pathname !== "/scan") {
      navigate("/scan", { replace: true });
    }
  }, [user, location.pathname]);

  async function logout() {
    await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:8001"}/logout`,
      { method: "POST", credentials: "include" },
    );
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    localStorage.removeItem("tenant_id");
    localStorage.removeItem("permissions");
    localStorage.removeItem("token");
    invalidatePipeline();
    setConfig(DEFAULT); 
    setUser(null);
    navigate("/login", { replace: true });
  }

  const isAdmin = user?.role === "admin";

  // FIX: Removed /pipeline-editor from nav tabs — Pipeline Config lives inside
  // the Admin panel (Admin → Pipeline Config tab). Having it as a top-level nav
  // tab caused it to appear twice. OperatorReport kept as admin-only nav item
  // since it is a standalone report page, not embedded in Admin.
  const navTabs = [
    ...(can(user, "dashboard")    ? [{ to: "/",        label: `📊 ${t("dashboard")}` }]   : []),
    ...(can(user, "scan")         ? [{ to: "/scan",    label: `📷 ${t("scan")}` }]        : []),
    ...(can(user, "history")      ? [{ to: "/history", label: `📋 ${t("history")}` }]     : []),
    ...(can(user, "create_trays") ? [{ to: "/create",  label: `➕ ${t("createTrays")}` }] : []),
    ...(can(user, "alerts")       ? [{ to: "/alerts",  label: `🚨 ${t("alerts")}` }]      : []),
    ...(isAdmin ? [
      { to: "/manage",          label: `🗂 ${t("manageTrays")}` },
      { to: "/admin",           label: `⚙ ${t("admin")}`        },
      { to: "/operator-report", label: `📊 ${t("operatorReport")}`     },
      { to: "/smt",             label: SMT_NAV.label },
      // /pipeline-editor intentionally removed — accessible via Admin → Pipeline Config
    ] : []),
  ];

  // FIX Bug 11: LoginControls — passed to LoginPage so theme/lang toggles work
  // before login. Defined inside AppShell to close over theme/lang state.
  function LoginControls() {
    return (
      <>
        <select
          className="lang-select"
          value={lang}
          onChange={e => setLang(e.target.value)}
          title={t("language")}
        >
          {LANGUAGES.map(({ code, label, flag }) => (
            <option key={code} value={code}>{flag} {label}</option>
          ))}
        </select>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? t("lightMode") : t("darkMode")}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </>
    );
  }

  return (
    <div className="app">
      {user && (
        <>
          <header className="hdr">
            <span className="hdr-title">⚙ Traceability System</span>
            <span className="hdr-sub">{user.username}</span>
            <span className="hdr-sub" style={{ fontSize: 11 }}>
              {t("org")}: {user.tenant_id}
            </span>
            <span
              className="hdr-sub"
              style={{
                background: isAdmin ? "rgba(226,75,74,.2)" : "transparent",
                color: "var(--err-text)",
              }}
            >
              {user.role}
            </span>

            <div className="hdr-controls">
              <select
                className="lang-select"
                value={lang}
                onChange={e => setLang(e.target.value)}
                title={t("language")}
              >
                {LANGUAGES.map(({ code, label, flag }) => (
                  <option key={code} value={code}>
                    {flag} {label}
                  </option>
                ))}
              </select>

              <button
                className="theme-toggle"
                onClick={toggleTheme}
                title={theme === "dark" ? t("lightMode") : t("darkMode")}
              >
                {theme === "dark" ? "☀️" : "🌙"}
                {theme === "dark" ? t("lightMode") : t("darkMode")}
              </button>

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
          {/* FIX Bug 8: /dev requires admin — was fully public */}
          <Route path="/dev" element={<DevPage />} />
            

          <Route
            path="/login"
            element={
              user
                ? <Navigate to="/" replace />
                : <LoginPage onLogin={handleLogin} Controls={LoginControls} />
            }
          />

          <Route path="/" element={
            <RequireFeature user={user} feature="dashboard"><Dashboard /></RequireFeature>
          } />
          <Route path="/scan" element={
            <RequireFeature user={user} feature="scan"><ScanPage /></RequireFeature>
          } />
          <Route path="/history" element={
            <RequireFeature user={user} feature="history"><HistoryPage /></RequireFeature>
          } />
          <Route path="/create" element={
            <RequireFeature user={user} feature="create_trays"><CreateTraysPage /></RequireFeature>
          } />
          <Route path="/operator-report" element={
            <RequireAdmin user={user}><OperatorReportPage /></RequireAdmin>
          } />
          {/* FIX: /pipeline-editor route removed — Pipeline Config is embedded
              in AdminPage under the Pipeline Config tab. The standalone
              PipelineConfigEditor page caused the same UI to appear twice. */}
          <Route path="/manage" element={
            <RequireAdmin user={user}><ManageTraysPage /></RequireAdmin>
          } />
          <Route path="/alerts" element={
            <RequireFeature user={user} feature="alerts"><AlertDashboard /></RequireFeature>
          } />
          <Route path="/admin" element={
            <RequireAdmin user={user}><AdminPage /></RequireAdmin>
          } />
          {/* ── SMT Analytics route — added ──────────────────────────────── */}
          <Route path="/smt" element={
            <RequireAdmin user={user}><SMT_ROUTE.component /></RequireAdmin>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

