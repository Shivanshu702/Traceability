

import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useState } from "react";

import CreateTraysPage from "./pages/CreateTraysPage";
import ScanPage        from "./pages/ScanPage";
import HistoryPage     from "./pages/HistoryPage";
import Dashboard       from "./pages/Dashboard";
import AlertDashboard  from "./pages/AlertDashboard";
import LoginPage       from "./pages/LoginPage";
import AdminPage       from "./pages/AdminPage";
import ManageTraysPage from "./pages/ManageTraysPage";
import DevPage         from "./pages/DevPage";
import "./App.css";

// ── Auth-required wrapper ─────────────────────────────────────────────────────
function RequireAuth({ user, children }) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

// ── Admin-only wrapper ────────────────────────────────────────────────────────
function RequireAdmin({ user, children }) {
  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

// ── Inner app (has access to router hooks) ────────────────────────────────────
function AppShell() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [user, setUser] = useState(null);

  // Rehydrate session from cookie-backed user info stored in sessionStorage.
  // Note: the JWT itself travels as an HttpOnly cookie (see auth fix) —
  // only non-sensitive display fields (username, role, tenant_id) live here.
  useEffect(() => {
    const username  = sessionStorage.getItem("username");
    const role      = sessionStorage.getItem("role");
    const tenant_id = sessionStorage.getItem("tenant_id") || "default";
    if (username) {
      setUser({ username, role: role || "operator", tenant_id });
    }
  }, []);

  function handleLogin(userData) {
    // Persist display-only fields so a hard reload restores the shell UI.
    sessionStorage.setItem("username",  userData.username);
    sessionStorage.setItem("role",      userData.role);
    sessionStorage.setItem("tenant_id", userData.tenant_id || "default");
    setUser(userData);

    // If the user was redirected to /login from a protected route, send them back.
    const from = location.state?.from?.pathname || "/";
    navigate(from, { replace: true });
  }

  async function logout() {
    // Tell the backend to clear the HttpOnly cookie.
    await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:8001"}/logout`,
      { method: "POST", credentials: "include" },
    );
    sessionStorage.clear();
    setUser(null);
    navigate("/login", { replace: true });
  }

  const isAdmin = user?.role === "admin";

  // ── Nav tabs ──────────────────────────────────────────────────────────────
  const navTabs = [
    { to: "/",        label: "📊 Dashboard" },
    { to: "/scan",    label: "📷 Scan"      },
    { to: "/history", label: "📋 History"   },
    { to: "/create",  label: "➕ Create Trays" },
    ...(isAdmin ? [
      { to: "/manage", label: "🗂 Manage Trays" },
      { to: "/alerts", label: "🚨 Alerts"       },
      { to: "/admin",  label: "⚙ Admin"         },
    ] : []),
  ];

  // ── Routes ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {user && (
        <>
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
            {navTabs.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}           /* exact match for root only */
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

// ── Root export (provides the router context) ─────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}