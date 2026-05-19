// C:\SHIVANSH\Traceability\frontend\app\src\api\integrations.js

const BASE = "https://traceability-backend-37dm.onrender.com";

async function _iapi(path, opts = {}) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok) {
    let detail = "Request failed";
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ── Integration config ────────────────────────────────────────────────────────
export const getIntegrationsConfig   = ()       => _iapi("/api/integrations/config");
export const saveIntegrationsConfig  = (config) => _iapi("/api/integrations/config", {
  method: "POST", body: JSON.stringify(config),
});

// ── Connection tests ──────────────────────────────────────────────────────────
export const testCogiscanConnection  = ()       => _iapi("/api/integrations/cogiscan/test", { method: "POST" });
export const testWatsConnection      = ()       => _iapi("/api/integrations/wats/test",     { method: "POST" });

// ── Manual sync triggers ──────────────────────────────────────────────────────
export const syncWatsNow             = ()       => _iapi("/api/integrations/wats/sync",     { method: "POST" });
export const syncCogiscanNow         = ()       => _iapi("/api/integrations/cogiscan/sync", { method: "POST" });

// ── SMT analytics ─────────────────────────────────────────────────────────────
export const getYieldAnalytics  = (days = 14) => _iapi(`/api/analytics/yield?days=${days}`);
export const getCycleTimeStats  = ()          => _iapi("/api/analytics/cycle-time");
export const getUnitTestResults = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return _iapi(`/api/analytics/unit-results${q ? "?" + q : ""}`);
};
export const getSmtDashboardSummary = () => _iapi("/api/analytics/smt-summary");

// ── Webhook registration (optional) ──────────────────────────────────────────
export const getCogiscanWebhookUrl = () => `${BASE}/api/webhooks/cogiscan`;