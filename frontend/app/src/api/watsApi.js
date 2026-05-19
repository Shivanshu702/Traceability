// src/api/watsApi.js
// Thin re-export layer for WATS-specific calls.

export {
  testWatsConnection,
  syncWatsNow,
  getUnitTestResults,
} from "./integrations";