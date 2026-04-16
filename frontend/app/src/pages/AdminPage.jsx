import { useState, useEffect } from "react";
import {
  getAdminPipelineConfig, saveAdminPipelineConfig, resetPipelineConfig,
  getEmailSettings, saveEmailSettings, sendTestEmail,
  listUsers, adminCreateUser, changeUserRole, deleteUser,
  downloadTraysCSV, downloadScanLogCSV, downloadReportXLSX,
  getAuditLog,
} from "../api/api";

const TABS = [
  { key: "users",    label: "👥 Users" },
  { key: "email",    label: "📧 Email & Alerts" },
  { key: "pipeline", label: "🔧 Pipeline Config" },
  { key: "export",   label: "⬇ Export" },
  { key: "audit",    label: "📋 Audit Log" },
];

export default function AdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ color: "#E8EFF8", marginBottom: 20 }}>⚙ Admin Panel</h2>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
              fontFamily: "inherit",
              background: tab === t.key ? "#185FA5" : "#162032",
              color:      tab === t.key ? "#E6F1FB"  : "#6B7E95",
              border:     tab === t.key ? "1px solid #185FA5" : "1px solid #1E2D42",
              fontWeight: tab === t.key ? 700 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users"    && <UsersTab />}
      {tab === "email"    && <EmailTab />}
      {tab === "pipeline" && <PipelineTab />}
      {tab === "export"   && <ExportTab />}
      {tab === "audit"    && <AuditTab />}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [newRole,  setNewRole]  = useState("operator");
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");

  async function load() {
    setLoading(true);
    const data = await listUsers();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim() || !newPw.trim()) { setError("Name and password required"); return; }
    setError(""); setMsg("");
    const res = await adminCreateUser(newName.trim(), newPw.trim(), newRole);
    if (res.error || !res.ok) { setError(res.error || "Failed"); return; }
    setMsg(`✅ User "${newName}" created`);
    setNewName(""); setNewPw("");
    load();
  }

  async function handleRoleChange(username, role) {
    await changeUserRole(username, role);
    load();
  }

  async function handleDelete(username) {
    if (!confirm(`Delete user "${username}"?`)) return;
    await deleteUser(username);
    load();
  }

  return (
    <div>
      {/* Create user */}
      <div style={card}>
        <div style={cardTitle}>Create New User</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={label}>Username</div>
            <input style={inp} placeholder="username"
              value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div>
            <div style={label}>Password</div>
            <input type="password" style={inp} placeholder="••••••"
              value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          <div>
            <div style={label}>Role</div>
            <select style={inp} value={newRole} onChange={e => setNewRole(e.target.value)}>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        {error && <div style={errBox}>{error}</div>}
        {msg   && <div style={okBox}>{msg}</div>}
        <button style={btnBlue} onClick={handleCreate}>➕ Create User</button>
      </div>

      {/* Users list */}
      <div style={card}>
        <div style={cardTitle}>All Users ({users.length})</div>
        {loading ? <Spin /> : (
          <table className="tbl">
            <thead><tr><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><span style={{ fontFamily: "monospace" }}>{u.username}</span></td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e => handleRoleChange(u.username, e.target.value)}
                      style={{ ...inp, width: "auto", padding: "4px 8px" }}>
                      <option value="operator">operator</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      style={{ ...btnSm, background: "#7A1F1F", color: "#FCEBEB",
                               border: "1px solid #7A1F1F" }}
                      onClick={() => handleDelete(u.username)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Email / Alerts tab ────────────────────────────────────────────────────────
function EmailTab() {
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => {
    getEmailSettings().then(d => { setSettings(d); setLoading(false); });
  }, []);

  function upd(k, v) { setSettings(s => ({ ...s, [k]: v })); }

  async function save() {
    setSaving(true); setMsg(""); setError("");
    const res = await saveEmailSettings(settings);
    setSaving(false);
    if (res.ok) setMsg("✅ Settings saved");
    else setError("Failed to save");
  }

  async function testEmail() {
    setMsg("Sending test…"); setError("");
    const res = await sendTestEmail();
    if (res.ok) setMsg(`✅ Test email sent to: ${res.sent_to?.join(", ")}`);
    else setError(res.error || "Failed to send test email");
  }

  if (loading || !settings) return <Spin />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* SMTP */}
      <div style={card}>
        <div style={cardTitle}>SMTP Configuration</div>
        <Grid>
          <Field label="SMTP Host">
            <input style={inp} placeholder="smtp.gmail.com"
              value={settings.smtp_host} onChange={e => upd("smtp_host", e.target.value)} />
          </Field>
          <Field label="SMTP Port">
            <input style={inp} type="number"
              value={settings.smtp_port} onChange={e => upd("smtp_port", +e.target.value)} />
          </Field>
          <Field label="SMTP Username / Email">
            <input style={inp} placeholder="you@gmail.com"
              value={settings.smtp_user} onChange={e => upd("smtp_user", e.target.value)} />
          </Field>
          <Field label="SMTP Password (leave blank to keep existing)">
            <input type="password" style={inp} placeholder="••••••••"
              onChange={e => upd("smtp_password", e.target.value)} />
          </Field>
          <Field label="From Email">
            <input style={inp} placeholder="alerts@yourcompany.com"
              value={settings.from_email} onChange={e => upd("from_email", e.target.value)} />
          </Field>
          <Field label="Use TLS">
            <select style={inp} value={settings.smtp_use_tls ? "1" : "0"}
              onChange={e => upd("smtp_use_tls", e.target.value === "1")}>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </Field>
        </Grid>
        <Field label="Alert Recipients (comma-separated emails)">
          <input style={inp} placeholder="manager@co.com, supervisor@co.com"
            value={settings.alert_recipients}
            onChange={e => upd("alert_recipients", e.target.value)} />
        </Field>
      </div>

      {/* Notification settings */}
      <div style={card}>
        <div style={cardTitle}>Notification Settings</div>
        <Grid>
          <Field label="FIFO Violation Alert">
            <Toggle
              value={settings.fifo_alert_enabled}
              onChange={v => upd("fifo_alert_enabled", v)} />
          </Field>
          <Field label="Stuck Tray Alert (hourly check)">
            <Toggle
              value={settings.stuck_alert_enabled}
              onChange={v => upd("stuck_alert_enabled", v)} />
          </Field>
          <Field label="Stuck Threshold (hours)">
            <input style={inp} type="number" min={1} max={48}
              value={settings.stuck_hours}
              onChange={e => upd("stuck_hours", +e.target.value)} />
          </Field>
          <Field label="Daily Summary Email">
            <Toggle
              value={settings.daily_summary_enabled}
              onChange={v => upd("daily_summary_enabled", v)} />
          </Field>
          <Field label="Summary Send Hour (UTC, 0–23)">
            <input style={inp} type="number" min={0} max={23}
              value={settings.daily_summary_hour}
              onChange={e => upd("daily_summary_hour", +e.target.value)} />
          </Field>
        </Grid>
      </div>

      {error && <div style={errBox}>{error}</div>}
      {msg   && <div style={okBox}>{msg}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button style={btnBlue} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "💾 Save Settings"}
        </button>
        <button style={btnGray} onClick={testEmail}>
          📨 Send Test Email
        </button>
      </div>
    </div>
  );
}

// ── Pipeline config tab ───────────────────────────────────────────────────────
function PipelineTab() {
  const [config,  setConfig]  = useState(null);
  const [raw,     setRaw]     = useState("");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const [error,   setError]   = useState("");
  const [jsonErr, setJsonErr] = useState("");

  useEffect(() => {
    getAdminPipelineConfig().then(d => {
      setConfig(d); setRaw(JSON.stringify(d, null, 2)); setLoading(false);
    });
  }, []);

  function handleRawChange(v) {
    setRaw(v);
    try { setConfig(JSON.parse(v)); setJsonErr(""); }
    catch { setJsonErr("Invalid JSON"); }
  }

  async function save() {
    if (jsonErr) { setError("Fix JSON errors first"); return; }
    setSaving(true); setMsg(""); setError("");
    const res = await saveAdminPipelineConfig(config);
    setSaving(false);
    if (res.ok) setMsg("✅ Pipeline config saved");
    else setError("Failed to save");
  }

  async function handleReset() {
    if (!confirm("Reset pipeline to hardcoded defaults?")) return;
    setSaving(true);
    const res = await resetPipelineConfig();
    setConfig(res.config);
    setRaw(JSON.stringify(res.config, null, 2));
    setSaving(false);
    setMsg("✅ Reset to defaults");
  }

  if (loading) return <Spin />;

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Pipeline JSON Config</div>
        <p style={{ fontSize: 12, color: "#6B7E95", marginBottom: 12 }}>
          Edit stages, projects, split configuration and branch options. Changes apply
          immediately after saving — no redeploy needed.
        </p>
        {jsonErr && <div style={errBox}>{jsonErr}</div>}
        <textarea
          value={raw}
          onChange={e => handleRawChange(e.target.value)}
          style={{
            width: "100%", height: 480, background: "#0A0F1A",
            border: "1px solid #1E2D42", borderRadius: 8, color: "#97C459",
            fontFamily: "Courier New, monospace", fontSize: 12, padding: 14,
            lineHeight: 1.5, resize: "vertical", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {error && <div style={errBox}>{error}</div>}
      {msg   && <div style={okBox}>{msg}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button style={btnBlue} onClick={save} disabled={saving || !!jsonErr}>
          {saving ? "Saving…" : "💾 Save Config"}
        </button>
        <button style={btnGray} onClick={handleReset}>
          ↩ Reset to Defaults
        </button>
      </div>
    </div>
  );
}

// ── Export tab ────────────────────────────────────────────────────────────────
function ExportTab() {
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [stage,     setStage]     = useState("");
  const [project,   setProject]   = useState("");

  const exports = [
    {
      label: "📄 Trays CSV",
      desc:  "All tray records with optional filters. Includes FIFO flag, stage, batch info.",
      color: "#185FA5",
      action: () => downloadTraysCSV({
        ...(stage     ? { stage }      : {}),
        ...(project   ? { project }    : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate   ? { end_date: endDate }     : {}),
      }),
    },
    {
      label: "📋 Scan Log CSV",
      desc:  "Full scan event history — every stage transition with operator and timestamp.",
      color: "#3B6D11",
      action: downloadScanLogCSV,
    },
    {
      label: "📊 Full Report XLSX",
      desc:  "3-sheet Excel workbook: Trays, Scan Log, Stage Summary. FIFO violations highlighted in red.",
      color: "#7F77DD",
      action: downloadReportXLSX,
    },
  ];

  return (
    <div>
      {/* Filters for tray CSV */}
      <div style={card}>
        <div style={cardTitle}>Filters (apply to Trays CSV)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <Field label="Stage">
            <input style={inp} placeholder="e.g. TESTING" value={stage}
              onChange={e => setStage(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Project">
            <input style={inp} placeholder="e.g. CD2_PRO" value={project}
              onChange={e => setProject(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Start Date">
            <input type="date" style={inp} value={startDate}
              onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="End Date">
            <input type="date" style={inp} value={endDate}
              onChange={e => setEndDate(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Export cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 14 }}>
        {exports.map(ex => (
          <div key={ex.label} style={{
            ...card, borderTop: `3px solid ${ex.color}`,
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#E8EFF8", marginBottom: 6 }}>
                {ex.label}
              </div>
              <div style={{ fontSize: 12, color: "#6B7E95", lineHeight: 1.5 }}>{ex.desc}</div>
            </div>
            <button
              onClick={ex.action}
              style={{ ...btnBlue, background: ex.color, borderColor: ex.color }}>
              ⬇ Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Audit log tab ─────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit,   setLimit]   = useState(200);
  const [filter,  setFilter]  = useState("");

  function loadLogs(lim = limit) {
    setLoading(true);
    getAuditLog(lim).then(d => {
      setLogs(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }

  useEffect(() => { loadLogs(); }, []);

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
  }

  // Download visible logs as CSV
  function downloadCSV() {
    const rows = [
      ["Timestamp", "User", "Action", "Details"],
      ...filtered.map(l => [
        fmtDate(l.timestamp),
        l.username || "",
        l.action   || "",
        (l.details || "").replace(/,/g, ";"),
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = logs.filter(l => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (l.username || "").toLowerCase().includes(q) ||
      (l.action   || "").toLowerCase().includes(q) ||
      (l.details  || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        ...card,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        {/* Search */}
        <input
          style={{ ...inp, flex: 2, minWidth: 180 }}
          placeholder="Search user, action, details…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />

        {/* Limit selector */}
        <select
          style={{ ...inp, width: "auto", flex: "none" }}
          value={limit}
          onChange={e => { setLimit(+e.target.value); loadLogs(+e.target.value); }}
        >
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
          <option value={1000}>Last 1000</option>
        </select>

        {/* Refresh */}
        <button style={btnGray} onClick={() => loadLogs()}>
          ↻ Refresh
        </button>

        {/* Download CSV */}
        <button
          style={{ ...btnBlue, display: "flex", alignItems: "center", gap: 6 }}
          onClick={downloadCSV}
          disabled={filtered.length === 0}
        >
          ⬇ Download CSV
        </button>
      </div>

      {/* Log count info */}
      <div style={{
        fontSize: 11, color: "#6B7E95", marginBottom: 8,
        display: "flex", gap: 16,
      }}>
        <span>{filtered.length} entries shown</span>
        {filter && <span style={{ color: "#FAC775" }}>⚠ Filter active</span>}
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {loading ? <Spin /> : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#6B7E95" }}>
            No audit log entries found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12, color: "#6B7E95", whiteSpace: "nowrap" }}>
                      {fmtDate(l.timestamp)}
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {l.username}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${actionTag(l.action)}`}>{l.action}</span>
                    </td>
                    <td style={{ fontSize: 12, color: "#6B7E95", maxWidth: 300 }}>
                      {l.details || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared micro-components ───────────────────────────────────────────────────
function Spin() {
  return (
    <div style={{ padding: 32, color: "#6B7E95", textAlign: "center" }}>
      <span className="spin" /> Loading…
    </div>
  );
}

function Grid({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={label2}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <select style={inp} value={value ? "1" : "0"}
      onChange={e => onChange(e.target.value === "1")}>
      <option value="1">Enabled</option>
      <option value="0">Disabled</option>
    </select>
  );
}

function actionTag(action) {
  if (["DELETE_TRAY", "DELETE_USER"].includes(action)) return "tag-red";
  if (["LOGIN", "REGISTER"].includes(action)) return "tag-blue";
  if (action.startsWith("UPDATE") || action.startsWith("SAVE")) return "tag-amber";
  if (action === "SCAN") return "tag-green";
  return "tag-gray";
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card     = { background: "#162032", border: "1px solid #1E2D42",
                   borderRadius: 12, padding: 16, marginBottom: 0 };
const cardTitle = { fontSize: 12, fontWeight: 700, color: "#6B7E95",
                    textTransform: "uppercase", letterSpacing: ".06em",
                    marginBottom: 14, display: "flex", alignItems: "center", gap: 8 };
const inp      = { width: "100%", padding: "9px 12px", background: "#111827",
                   border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8",
                   fontSize: 13, outline: "none", boxSizing: "border-box",
                   fontFamily: "inherit" };
const label    = { fontSize: 12, color: "#6B7E95", fontWeight: 600 };
const label2   = label;
const btnBlue  = { padding: "10px 18px", background: "#185FA5", color: "#E6F1FB",
                   border: "1px solid #185FA5", borderRadius: 8, fontSize: 13,
                   fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnGray  = { padding: "10px 18px", background: "#162032", color: "#E8EFF8",
                   border: "1px solid #1E2D42", borderRadius: 8, fontSize: 13,
                   cursor: "pointer", fontFamily: "inherit" };
const btnSm    = { padding: "5px 12px", borderRadius: 6, fontSize: 12,
                   cursor: "pointer", fontFamily: "inherit" };
const errBox   = { background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)",
                   borderRadius: 8, padding: 12, color: "#F09595", fontSize: 13,
                   marginBottom: 12 };
const okBox    = { background: "rgba(59,109,17,.2)", border: "1px solid rgba(59,109,17,.4)",
                   borderRadius: 8, padding: 12, color: "#97C459", fontSize: 13,
                   marginBottom: 12 };