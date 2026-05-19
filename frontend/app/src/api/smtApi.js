// src/api/smtApi.js
// Thin re-export layer for SMT-specific calls.
// Keeps import paths clean: import { getYieldAnalytics } from "../api/smtApi"
// instead of the longer integrations.js path.

export {
  getSmtDashboardSummary,
  getYieldAnalytics,
  getCycleTimeStats,
  getUnitTestResults,
  syncCogiscanNow,
  getCogiscanWebhookUrl,
} from "./integrations";