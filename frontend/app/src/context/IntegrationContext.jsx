//  C:\SHIVANSH\Traceability\frontend\app\src\context\IntegrationContext.jsx

// src/context/IntegrationContext.jsx
// Provides integration config (Cogiscan + WATS) to the whole app.
// Wrap this around <App /> in main.jsx AFTER LangProvider and ThemeProvider.
//
// Usage anywhere:
//   import { useIntegrationContext } from "../context/IntegrationContext";
//   const { config, loaded } = useIntegrationContext();
//
// Or use the hook shorthand:
//   import { useIntegrationConfig } from "../hooks/useIntegrationConfig";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getIntegrationsConfig } from "../api/integrations";

// ── Default shape (safe fallback before first load) ────────────────────────────
const DEFAULT = {
  cogiscan_enabled:    false,
  cogiscan_url:        "",
  cogiscan_api_key:    "",
  cogiscan_poll_sec:   30,
  smt_auto_create:     false,   // ← when true: hides QR printing / manual create
  cogiscan_last_sync:  null,

  wats_enabled:        false,
  wats_url:            "",
  wats_api_key:        "",
  wats_sync_mode:      "manual",  // "auto" | "scheduled" | "manual"
  wats_last_sync:      null,
};

const IntegrationContext = createContext({
  config:        DEFAULT,
  loaded:        false,
  refreshConfig: async () => {},
  setConfig:     () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────
export function IntegrationProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  const refreshConfig = useCallback(async () => {
    try {
      const d = await getIntegrationsConfig();
      setConfig({ ...DEFAULT, ...d });
    } catch {
      // Fail silently — integration may not be configured yet,
      // or user is not authenticated yet (SESSION_EXPIRED handled by App.jsx)
    }
  }, []);

  useEffect(() => {
    refreshConfig().finally(() => setLoaded(true));
  }, [refreshConfig]);

  return (
    <IntegrationContext.Provider value={{ config, loaded, refreshConfig, setConfig }}>
      {children}
    </IntegrationContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useIntegrationContext() {
  return useContext(IntegrationContext);
}