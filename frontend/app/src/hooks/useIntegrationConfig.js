// src/hooks/useIntegrationConfig.js
// Convenience hook — returns booleans instead of raw config.
//
// Usage:
//   const { smtAutoCreate, watsEnabled } = useIntegrationConfig();
//
// In CreateTraysPage.jsx you can gate the manual form:
//   const { smtAutoCreate, loaded } = useIntegrationConfig();
//   if (!loaded) return <Spinner />;
//   if (smtAutoCreate) return <SmtAutoCreateNotice />;

import { useIntegrationContext } from "../context/IntegrationContext";

export function useIntegrationConfig() {
  const { config, loaded, refreshConfig } = useIntegrationContext();

  return {
    // ── ready flag ──────────────────────────────────────────────────────────
    loaded,

    // ── raw config ──────────────────────────────────────────────────────────
    config,

    // ── computed booleans ───────────────────────────────────────────────────
    /** True when Cogiscan is enabled AND auto-create is toggled on.
     *  When true: hide QR printing, hide manual tray creation form. */
    smtAutoCreate:   config.cogiscan_enabled && config.smt_auto_create,

    /** Cogiscan polling is active */
    cogiscanEnabled: config.cogiscan_enabled,

    /** WATS sync is active */
    watsEnabled:     config.wats_enabled,

    /** WATS will auto-sync the moment a tray is scanned into the Testing stage */
    watsAutoSync:    config.wats_enabled && config.wats_sync_mode === "auto",

    /** Force a fresh config load (call after saving integration settings) */
    refreshConfig,
  };
}