const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

// ── Token helpers ──────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem("token") || "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization:  "Bearer " + getToken(),
  };
}

// ── Generic request ────────────────────────────────────────────────────────────
async function req(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    window.location.reload();
    return {};
  }
  return res.json();
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export async function loginUser(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function registerUser(username, password, role = "operator") {
  const res = await fetch(`${BASE}/register`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password, role }),
  });
  return res.json();
}

// ── Pipeline ───────────────────────────────────────────────────────────────────
export const getPipeline = () => req("GET", "/pipeline");

// ── Trays ──────────────────────────────────────────────────────────────────────
export const getAllTrays  = (params = {}) =>
  req("GET", "/trays?" + new URLSearchParams(params));

export const getTray     = (id) => req("GET", `/tray/${id}`);

export const createTrays = (trays) => req("POST", "/trays/create", { trays });

export const deleteTray  = (id) => req("DELETE", `/tray/${id}`);

// ── Scan ───────────────────────────────────────────────────────────────────────
export const scanTray    = (id, operator, next_stage_override = undefined) =>
  req("POST", "/scan", { id, operator, next_stage_override });

export const bulkScan    = (ids, operator, next_stage_override = undefined) =>
  req("POST", "/scan/bulk", { ids, operator, next_stage_override });

// ── History & logs ─────────────────────────────────────────────────────────────
export const getHistory  = (trayId) => req("GET", `/history/${trayId}`);

export const getScanLog  = (limit = 200) =>
  req("GET", `/scan-log?limit=${limit}`);

// ── Stats / alerts / analytics ─────────────────────────────────────────────────
export const getStats     = () => req("GET", "/stats");
export const getAlerts    = () => req("GET", "/alerts");
export const getStageLoad = () => req("GET", "/stage-load");
export const getAnalytics = () => req("GET", "/analytics");

// ── Audit log (admin) ──────────────────────────────────────────────────────────
export const getAuditLog  = (limit = 100) =>
  req("GET", `/audit-log?limit=${limit}`);