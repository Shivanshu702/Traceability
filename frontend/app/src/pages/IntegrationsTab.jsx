// C:\SHIVANSH\Traceability\frontend\app\src\pages\IntegrationsTab.jsx

import { useEffect, useState } from "react";
import { useLang } from "../context/LangContext";
import {
  getIntegrationsConfig,
  saveIntegrationsConfig,
  testCogiscanConnection,
  testWatsConnection,
  syncWatsNow,
  syncCogiscanNow,
  getCogiscanWebhookUrl,
} from "../api/integrations_api";

// ── Shared mini-components ────────────────────────────────────────────────────
function Row({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, label, sublabel }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12 }}>
      <div
        onClick={() => onChange(!value)}
        style={{ width: 40, height: 22, borderRadius: 11, cursor: "pointer", flexShrink: 0, marginTop: 2, background: value ? "var(--accent-dk)" : "var(--border)", position: "relative", transition: "background .2s" }}
      >
        <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: "var(--text-inv)", transition: "left .2s" }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const ok = status === "ok";
  return (
    <span className={ok ? "tag tag-green" : "tag tag-red"} style={{ fontSize: 11 }}>
      {ok ? "✓ Connected" : "✕ Failed"}
    </span>
  );
}

function Spin() {
  return <span className="spin" style={{ width: 12, height: 12, borderWidth: 1.5 }} />;
}

// ── Default config shape ──────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  cogiscan_enabled:     false,
  cogiscan_url:         "",
  cogiscan_api_key:     "",
  cogiscan_poll_sec:    30,
  smt_auto_create:      false,
  cogiscan_last_sync:   null,

  wats_enabled:         false,
  wats_url:             "",
  wats_api_key:         "",
  wats_sync_mode:       "manual",
  wats_last_sync:       null,
};

// ── Main component ────────────────────────────────────────────────────────────
export default function IntegrationsTab() {
  const { t } = useLang();
  const [config, setConfig]   = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const [err,     setErr]     = useState("");

  const [cogStatus,   setCogStatus]   = useState(null);
  const [watsStatus,  setWatsStatus]  = useState(null);
  const [cogTesting,  setCogTesting]  = useState(false);
  const [watsTesting, setWatsTesting] = useState(false);
  const [cogSyncing,  setCogSyncing]  = useState(false);
  const [watsSyncing, setWatsSyncing] = useState(false);

  useEffect(() => {
    getIntegrationsConfig()
      .then(d => { setConfig({ ...DEFAULT_CONFIG, ...d }); setLoading(false); })
      .catch(e => { if (e.message !== "SESSION_EXPIRED") setErr("Could not load integration config."); setLoading(false); });
  }, []);

  function upd(key, val) { setConfig(c => ({ ...c, [key]: val })); }

  async function save() {
    setSaving(true); setMsg(""); setErr("");
    try {
      await saveIntegrationsConfig(config);
      setMsg("✅ Integration settings saved.");
    } catch (e) { setErr(e.message || "Save failed."); }
    finally { setSaving(false); }
  }

  async function testCogiscan() {
    setCogTesting(true); setCogStatus(null);
    try { await testCogiscanConnection(); setCogStatus("ok"); }
    catch  { setCogStatus("err"); }
    finally { setCogTesting(false); }
  }

  async function testWats() {
    setWatsTesting(true); setWatsStatus(null);
    try { await testWatsConnection(); setWatsStatus("ok"); }
    catch  { setWatsStatus("err"); }
    finally { setWatsTesting(false); }
  }

  async function syncCogiscan() {
    setCogSyncing(true); setMsg(""); setErr("");
    try { const r = await syncCogiscanNow(); setMsg(`✅ Cogiscan synced — ${r.panels_created ?? 0} new panel(s) imported.`); }
    catch (e) { setErr(e.message || "Sync failed."); }
    finally { setCogSyncing(false); }
  }

  async function syncWats() {
    setWatsSyncing(true); setMsg(""); setErr("");
    try { const r = await syncWatsNow(); setMsg(`✅ WATS synced — ${r.results_pulled ?? 0} result(s) updated.`); }
    catch (e) { setErr(e.message || "Sync failed."); }
    finally { setWatsSyncing(false); }
  }

  if (loading) return <div style={{ padding: 40, color: "var(--muted)", textAlign: "center" }}><span className="spin" /> Loading…</div>;

  const card      = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 };
  const cardTitle = { fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 };

  return (
    <div style={{ maxWidth: 820 }}>

      {/* ── Cogiscan card ─────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ ...cardTitle, marginBottom: 0, flex: 1 }}>🏭 Cogiscan — SMT traceability</div>
          <StatusBadge status={cogStatus} />
        </div>

        <Toggle
          value={config.cogiscan_enabled}
          onChange={v => upd("cogiscan_enabled", v)}
          label="Enable Cogiscan integration"
          sublabel="Your backend will poll Cogiscan for new panels exiting the SMT line."
        />

        {config.cogiscan_enabled && (
          <>
            <Toggle
              value={config.smt_auto_create}
              onChange={v => upd("smt_auto_create", v)}
              label="Auto-create trays from SMT panels"
              sublabel="When on: QR printing is hidden and tray records are created automatically from Cogiscan DataMatrix data."
            />

            {config.smt_auto_create && (
              <div className="note-box" style={{ marginBottom: 12 }}>
                ℹ️ Manual tray creation on the <strong>Create Trays</strong> page will be hidden while this is active. Cogiscan becomes the source of truth for tray creation.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Row label="Cogiscan API URL">
                <input className="inp" placeholder="https://cogiscan-host/api" value={config.cogiscan_url}
                  onChange={e => upd("cogiscan_url", e.target.value)} />
              </Row>
              <Row label="API Key">
                <input type="password" className="inp" placeholder="••••••••••••" value={config.cogiscan_api_key}
                  onChange={e => upd("cogiscan_api_key", e.target.value)} />
              </Row>
            </div>

            <Row label="Poll interval">
              <select className="inp" style={{ width: "auto" }} value={config.cogiscan_poll_sec}
                onChange={e => upd("cogiscan_poll_sec", Number(e.target.value))}>
                <option value={15}>Every 15 seconds</option>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every 60 seconds</option>
                <option value={300}>Every 5 minutes</option>
                <option value={0}>Manual only (no polling)</option>
              </select>
            </Row>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>Webhook URL (push mode)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", flex: 1, color: "var(--note-text)", fontFamily: "var(--font-mono)" }}>
                  {getCogiscanWebhookUrl()}
                </code>
                <button className="btn" style={{ fontSize: 11, padding: "6px 10px", flexShrink: 0 }}
                  onClick={() => navigator.clipboard?.writeText(getCogiscanWebhookUrl())}>
                  Copy
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
                Configure this URL in Cogiscan's event forwarding settings for push mode (faster than polling).
              </div>
            </div>

            {config.cogiscan_last_sync && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
                Last sync: <span style={{ color: "var(--text)" }}>{new Date(config.cogiscan_last_sync).toLocaleString()}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-blue" style={{ fontSize: 12, padding: "7px 14px" }}
                onClick={testCogiscan} disabled={cogTesting || !config.cogiscan_url}>
                {cogTesting ? <><Spin /> Testing…</> : "🔌 Test connection"}
              </button>
              <button className="btn" style={{ fontSize: 12, padding: "7px 14px" }}
                onClick={syncCogiscan} disabled={cogSyncing}>
                {cogSyncing ? <><Spin /> Syncing…</> : "↻ Sync now"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── WATS card ──────────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ ...cardTitle, marginBottom: 0, flex: 1 }}>🧪 WATS — test result sync</div>
          <StatusBadge status={watsStatus} />
        </div>

        <Toggle
          value={config.wats_enabled}
          onChange={v => upd("wats_enabled", v)}
          label="Enable WATS integration"
          sublabel="Pull pass/fail results from WATS when a tray reaches the Testing stage."
        />

        {config.wats_enabled && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Row label="WATS tenant URL">
                <input className="inp" placeholder="https://yourcompany.wats.com" value={config.wats_url}
                  onChange={e => upd("wats_url", e.target.value)} />
              </Row>
              <Row label="API Key">
                <input type="password" className="inp" placeholder="••••••••••••" value={config.wats_api_key}
                  onChange={e => upd("wats_api_key", e.target.value)} />
              </Row>
            </div>

            <Row label="Sync mode">
              <select className="inp" style={{ width: "auto" }} value={config.wats_sync_mode}
                onChange={e => upd("wats_sync_mode", e.target.value)}>
                <option value="auto">Auto-sync when tray reaches Testing stage</option>
                <option value="scheduled">Scheduled (every hour)</option>
                <option value="manual">Manual only</option>
              </select>
            </Row>

            {config.wats_last_sync && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
                Last sync: <span style={{ color: "var(--text)" }}>{new Date(config.wats_last_sync).toLocaleString()}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-blue" style={{ fontSize: 12, padding: "7px 14px" }}
                onClick={testWats} disabled={watsTesting || !config.wats_url}>
                {watsTesting ? <><Spin /> Testing…</> : "🔌 Test connection"}
              </button>
              <button className="btn" style={{ fontSize: 12, padding: "7px 14px" }}
                onClick={syncWats} disabled={watsSyncing}>
                {watsSyncing ? <><Spin /> Syncing…</> : "↻ Sync now"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Save row ───────────────────────────────────────────────────────── */}
      {err && <div className="err-box">{err}</div>}
      {msg && <div className="ok-box">{msg}</div>}
      <button className="btn btn-blue" onClick={save} disabled={saving}>
        {saving ? "Saving…" : `💾 ${t("save")} integration settings`}
      </button>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, background: "var(--note-bg)", border: "1px solid var(--note-border)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--note-text)", marginBottom: 10 }}>ℹ️ How SMT auto-create works</div>
        <ol style={{ paddingLeft: 18, fontSize: 12, color: "var(--note-text)", lineHeight: 1.9, margin: 0 }}>
          <li>A panel exits your SMT line and Cogiscan records its DataMatrix code.</li>
          <li>Your backend polls Cogiscan (or receives a webhook push) and reads the panel ID, unit count, and project.</li>
          <li>A tray record is automatically created and placed at your first post-SMT pipeline stage.</li>
          <li>Operators continue scanning normally at downstream stages — no QR printing needed.</li>
          <li>When the tray reaches Testing, WATS sync pulls pass/fail per unit and updates the SMT Analytics page.</li>
        </ol>
      </div>
    </div>
  );
}