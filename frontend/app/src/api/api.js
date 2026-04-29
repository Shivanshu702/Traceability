
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";


async function req(method, path, body) {
  const opts = {
    method,
    credentials: "include",                          // send the HttpOnly cookie cross-origin
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {

    ["role", "username", "tenant_id"].forEach(k => localStorage.removeItem(k));
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    return null;
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function loginUser(username, password, tenant_id = "default") {
  const res = await fetch(`${BASE}/login`, {
    method:      "POST",
    credentials: "include",                          // backend sets the cookie here
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify({ username, password, tenant_id }),
  });
  return res.json();
}

export async function logoutUser() {
  await fetch(`${BASE}/logout`, {
    method:      "POST",
    credentials: "include",                          // backend clears the cookie
  });
  ["role", "username", "tenant_id"].forEach(k => localStorage.removeItem(k));
}

export async function registerUser(username, password, role = "operator", tenant_id = "default") {
  const res = await fetch(`${BASE}/register`, {
    method:      "POST",
    credentials: "include",
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify({ username, password, role, tenant_id }),
  });
  return res.json();
}

export async function forgotPasswordRequest(username, tenant_id = "default") {
  const res = await fetch(`${BASE}/forgot-password/request`, {
    method:      "POST",
    credentials: "include",
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify({ username, tenant_id }),
  });
  return res.json();
}

export async function forgotPasswordConfirm(token, new_password) {
  const res = await fetch(`${BASE}/forgot-password/confirm`, {
    method:      "POST",
    credentials: "include",
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify({ token, new_password }),
  });
  return res.json();
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
export const getPipeline             = ()       => req("GET",  "/pipeline");
export const getAdminPipelineConfig  = ()       => req("GET",  "/admin/pipeline-config");
export const saveAdminPipelineConfig = (config) => req("PUT",  "/admin/pipeline-config", config);
export const resetPipelineConfig     = ()       => req("POST", "/admin/pipeline-config/reset");

// ── Trays ─────────────────────────────────────────────────────────────────────
export async function getAllTrays(params = {}) {
  const data = await req("GET", "/trays?" + new URLSearchParams(params));
  return Array.isArray(data) ? data : (data?.trays ?? []);
}

export const getTray         = (id)    => req("GET",    `/tray/${id}`);
export const createTrays     = (trays) => req("POST",   "/trays/create", { trays });
export const deleteTray      = (id)    => req("DELETE", `/tray/${id}`);
export const bulkDeleteTrays = (ids)   => req("POST",   "/trays/bulk-delete", { ids });

// ── Scan ──────────────────────────────────────────────────────────────────────
export const scanTray = (id, operator, next_stage_override) =>
  req("POST", "/scan", { id, operator, next_stage_override });
export const bulkScan = (ids, operator, next_stage_override) =>
  req("POST", "/scan/bulk", { ids, operator, next_stage_override });

// ── History & logs ────────────────────────────────────────────────────────────
export const getHistory = (trayId) => req("GET", `/history/${trayId}`);

export async function getScanLog(limit = 200) {
  const data = await req("GET", `/scan-log?limit=${limit}`);
  return Array.isArray(data) ? data : (data?.events ?? []);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats     = (project = null) =>
  req("GET", project ? `/stats?project=${encodeURIComponent(project)}` : "/stats");
export const getAlerts    = () => req("GET", "/alerts");
export const getStageLoad = () => req("GET", "/stage-load");
export const getAnalytics = () => req("GET", "/analytics");

// ── Operator + weekly analytics ───────────────────────────────────────────────
export const getOperatorStats = () => req("GET", "/analytics/operators");
export const getWeeklyStats   = () => req("GET", "/analytics/weekly");

// ── Audit log ─────────────────────────────────────────────────────────────────
export const getAuditLog = (limit = 100) => req("GET", `/audit-log?limit=${limit}`);

// ── User management (admin) ───────────────────────────────────────────────────
export const listUsers          = ()                         => req("GET",    "/admin/users");
export const adminCreateUser    = (username, password, role) => req("POST",   "/admin/users", { username, password, role });
export const changeUserRole     = (username, role)           => req("PUT",    `/admin/users/${username}/role`, { role });
export const adminResetPassword = (username, password)       => req("PUT",    `/admin/users/${username}/password`, { password });
export const deleteUser         = (username)                 => req("DELETE", `/admin/users/${username}`);

// ── Role config (admin) ───────────────────────────────────────────────────────
export const getFeatures = ()              => req("GET",    "/admin/features");
export const listRoles   = ()              => req("GET",    "/admin/roles");
export const createRole  = (payload)       => req("POST",   "/admin/roles", payload);
export const updateRole  = (name, payload) => req("PUT",    `/admin/roles/${name}`, payload);
export const deleteRole  = (name)          => req("DELETE", `/admin/roles/${name}`);

// ── Email settings (admin) ────────────────────────────────────────────────────
export const getEmailSettings  = ()         => req("GET",  "/admin/email-settings");
export const saveEmailSettings = (settings) => req("PUT",  "/admin/email-settings", settings);
export const sendTestEmail     = ()         => req("POST", "/admin/test-email");

// ── Export ────────────────────────────────────────────────────────────────────
export function downloadTraysCSV(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  _dl(`/export/trays${qs ? "?" + qs : ""}`, "trays.csv");
}
export function downloadScanLogCSV() { _dl("/export/scan-log", "scan_log.csv"); }
export function downloadReportXLSX() { _dl("/export/report",   "production_report.xlsx"); }

async function _dl(path, filename) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) { alert("Export failed"); return; }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}