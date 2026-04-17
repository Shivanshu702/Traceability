import { useState, useEffect } from "react";
import {
  getAdminPipelineConfig, saveAdminPipelineConfig, resetPipelineConfig,
  getEmailSettings, saveEmailSettings, sendTestEmail,
  listUsers, adminCreateUser, changeUserRole, adminResetPassword, deleteUser,
  getFeatures, listRoles, createRole, updateRole, deleteRole,
  downloadTraysCSV, downloadScanLogCSV, downloadReportXLSX,
  getAuditLog,
} from "../api/api";

const TABS = [
  { key: "users",    label: "👥 Users" },
  { key: "roles",    label: "🔑 Roles & Permissions" },
  { key: "email",    label: "📧 Email & Alerts" },
  { key: "pipeline", label: "🔧 Pipeline Config" },
  { key: "export",   label: "⬇ Export" },
  { key: "audit",    label: "📋 Audit Log" },
];

export default function AdminPage() {
  const [tab, setTab] = useState("users");
  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ color: "#E8EFF8", marginBottom: 20 }}>⚙ Admin Panel</h2>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
            background: tab === t.key ? "#185FA5" : "#162032",
            color:      tab === t.key ? "#E6F1FB"  : "#6B7E95",
            border:     tab === t.key ? "1px solid #185FA5" : "1px solid #1E2D42",
            fontWeight: tab === t.key ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>
      {tab === "users"    && <UsersTab />}
      {tab === "roles"    && <RolesTab />}
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
  const [roles,    setRoles]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [newRole,  setNewRole]  = useState("operator");
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");
  // Reset password modal state
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw,     setResetPw]     = useState("");
  const [resetMsg,    setResetMsg]    = useState("");

  async function load() {
    setLoading(true);
    const [u, r] = await Promise.all([listUsers(), listRoles()]);
    setUsers(Array.isArray(u) ? u : []);
    setRoles(Array.isArray(r) ? r : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // All available role options: built-in + custom
  const allRoles = [
    { name: "admin",    label: "Admin"    },
    { name: "operator", label: "Operator" },
    ...roles.map(r => ({ name: r.name, label: r.label || r.name })),
  ];

  async function handleCreate() {
    if (!newName.trim() || !newPw.trim()) { setError("Name and password required"); return; }
    setError(""); setMsg("");
    const res = await adminCreateUser(newName.trim(), newPw.trim(), newRole);
    if (res.error || !res.ok) { setError(res.error || "Failed to create user"); return; }
    setMsg(`✅ User "${newName}" created with role: ${newRole}`);
    setNewName(""); setNewPw(""); setNewRole("operator");
    load();
  }

  async function handleRoleChange(username, role) {
    await changeUserRole(username, role);
    load();
  }

  async function handleDelete(username) {
    if (!confirm(`Permanently delete user "${username}"? This cannot be undone.`)) return;
    const res = await deleteUser(username);
    if (res.ok) { setMsg(`✅ User "${username}" deleted`); load(); }
    else setError(res.detail || "Delete failed");
  }

  async function handleResetPassword() {
    if (!resetPw || resetPw.length < 6) { setResetMsg("Min 6 characters"); return; }
    const res = await adminResetPassword(resetTarget, resetPw);
    if (res.ok) { setResetMsg("✅ Password updated"); setResetPw(""); }
    else setResetMsg("Failed — try again");
  }

  const currentUser = localStorage.getItem("username");

  return (
    <div>
      {/* Reset password modal */}
      {resetTarget && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.7)",
          zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center",
        }} onClick={() => { setResetTarget(null); setResetMsg(""); setResetPw(""); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"#162032", border:"1px solid #1E2D42",
            borderRadius:14, padding:28, width:"min(400px,96vw)",
          }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#E8EFF8", marginBottom:4 }}>
              Reset Password
            </div>
            <div style={{ fontSize:12, color:"#6B7E95", marginBottom:20 }}>
              User: <strong style={{ color:"#E8EFF8" }}>{resetTarget}</strong>
            </div>
            <div style={fldStyle}>
              <div style={lbl}>New Password (min 6 chars)</div>
              <input type="password" style={inp}
                placeholder="New password"
                value={resetPw}
                onChange={e => setResetPw(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleResetPassword()}
              />
            </div>
            {resetMsg && <div style={resetMsg.includes("✅") ? okBox : errBox}>{resetMsg}</div>}
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button style={btnBlue} onClick={handleResetPassword}>Update Password</button>
              <button style={btnGray} onClick={() => { setResetTarget(null); setResetMsg(""); setResetPw(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user */}
      <div style={card}>
        <div style={cardTitle}>Create New User</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div style={lbl}>Username</div>
            <input style={inp} placeholder="username"
              value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div>
            <div style={lbl}>Password</div>
            <input type="password" style={inp} placeholder="••••••"
              value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          <div>
            <div style={lbl}>Role</div>
            <select style={inp} value={newRole} onChange={e => setNewRole(e.target.value)}>
              {allRoles.map(r => (
                <option key={r.name} value={r.name}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <div style={errBox}>{error}</div>}
        {msg   && <div style={okBox}>{msg}</div>}
        <button style={btnBlue} onClick={handleCreate}>➕ Create User</button>
      </div>

      {/* Users list */}
      <div style={{ ...card, padding: 0, overflow:"hidden" }}>
        <div style={{ ...cardTitle, padding:"14px 16px 0" }}>
          All Users ({users.length})
        </div>
        {loading ? <Spin /> : (
          <table className="tbl" style={{ margin:0 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id}>
                  <td style={{ color:"#6B7E95", fontSize:11 }}>{i + 1}</td>
                  <td>
                    <span style={{ fontFamily:"monospace", fontSize:13 }}>{u.username}</span>
                    {u.username === currentUser && (
                      <span className="tag tag-blue" style={{ marginLeft:8, fontSize:10 }}>you</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e => handleRoleChange(u.username, e.target.value)}
                      style={{ ...inp, width:"auto", padding:"4px 8px", fontSize:12 }}>
                      {allRoles.map(r => (
                        <option key={r.name} value={r.name}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      {/* Reset password */}
                      <button
                        style={{ ...btnSm, background:"#185FA5", color:"#E6F1FB", border:"1px solid #185FA5" }}
                        onClick={() => { setResetTarget(u.username); setResetMsg(""); setResetPw(""); }}>
                        🔑 Reset PW
                      </button>
                      {/* Delete — cannot delete yourself */}
                      {u.username !== currentUser && (
                        <button
                          style={{ ...btnSm, background:"#7A1F1F", color:"#FCEBEB", border:"1px solid #7A1F1F" }}
                          onClick={() => handleDelete(u.username)}>
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop:12, fontSize:12, color:"#6B7E95" }}>
        💡 To delete your own account, ask another admin. You cannot delete yourself.
      </div>
    </div>
  );
}

// ── Roles & Permissions tab ───────────────────────────────────────────────────
function RolesTab() {
  const [roles,    setRoles]    = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null); // role being edited
  const [newName,  setNewName]  = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPerms, setNewPerms] = useState([]);
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");

  async function load() {
    setLoading(true);
    const [r, f] = await Promise.all([listRoles(), getFeatures()]);
    setRoles(Array.isArray(r) ? r : []);
    setFeatures((f?.features) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function togglePerm(key, perms, setPerms) {
    setPerms(perms.includes(key) ? perms.filter(k => k !== key) : [...perms, key]);
  }

  async function handleCreate() {
    if (!newName.trim()) { setError("Role name required"); return; }
    setError(""); setMsg("");
    const res = await createRole({ name: newName, label: newLabel || newName, permissions: newPerms });
    if (res.error || !res.ok) { setError(res.error || "Failed"); return; }
    setMsg(`✅ Role "${newLabel || newName}" created`);
    setNewName(""); setNewLabel(""); setNewPerms([]);
    load();
  }

  async function handleSave(role) {
    const res = await updateRole(role.name, { label: role.label, permissions: role.permissions });
    if (res.ok) { setMsg(`✅ Role "${role.label}" updated`); setEditing(null); load(); }
    else setError("Failed to save");
  }

  async function handleDelete(name) {
    if (!confirm(`Delete role "${name}"? Users with this role will keep their role name but lose permission mappings.`)) return;
    const res = await deleteRole(name);
    if (res.ok) { setMsg("✅ Role deleted"); load(); }
    else setError("Delete failed");
  }

  return (
    <div>
      <div style={{ ...card, marginBottom:16 }}>
        <div style={{ fontSize:12, color:"#6B7E95", marginBottom:14 }}>
          Built-in roles (<strong style={{ color:"#E8EFF8" }}>admin</strong> and{" "}
          <strong style={{ color:"#E8EFF8" }}>operator</strong>) have fixed access and cannot be edited.
          Create custom roles below and assign feature access per role.
        </div>
        {/* Built-in roles display */}
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { name:"admin",    label:"Admin",    desc:"Full access to everything" },
            { name:"operator", label:"Operator", desc:"Dashboard, scan, create trays, history" },
          ].map(r => (
            <div key={r.name} style={{
              flex:1, minWidth:160,
              background:"#0A0F1A", border:"1px solid #1E2D42",
              borderRadius:8, padding:"12px 14px",
            }}>
              <div style={{ fontWeight:700, color:"#E8EFF8", marginBottom:4 }}>{r.label}</div>
              <div style={{ fontSize:11, color:"#6B7E95" }}>{r.desc}</div>
              <div style={{ marginTop:8 }}>
                <span className="tag tag-gray" style={{ fontSize:10 }}>built-in · cannot edit</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create custom role */}
      <div style={card}>
        <div style={cardTitle}>Create Custom Role</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div>
            <div style={lbl}>Role Key (e.g. supervisor)</div>
            <input style={inp} placeholder="supervisor"
              value={newName}
              onChange={e => setNewName(e.target.value.toLowerCase().replace(/\s/g,"_"))} />
          </div>
          <div>
            <div style={lbl}>Display Label</div>
            <input style={inp} placeholder="Supervisor"
              value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          </div>
        </div>

        <div style={lbl}>Feature Access</div>
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))",
          gap:8, marginTop:8, marginBottom:14,
        }}>
          {features.map(f => (
            <label key={f.key} style={{
              display:"flex", alignItems:"center", gap:8,
              background:"#0A0F1A", border:"1px solid #1E2D42",
              borderRadius:6, padding:"8px 10px", cursor:"pointer",
              borderColor: newPerms.includes(f.key) ? "#378ADD" : "#1E2D42",
            }}>
              <input type="checkbox"
                checked={newPerms.includes(f.key)}
                onChange={() => togglePerm(f.key, newPerms, setNewPerms)}
                style={{ width:14, height:14 }} />
              <span style={{ fontSize:12, color: newPerms.includes(f.key) ? "#E8EFF8" : "#6B7E95" }}>
                {f.label}
              </span>
            </label>
          ))}
        </div>

        {error && <div style={errBox}>{error}</div>}
        {msg   && <div style={okBox}>{msg}</div>}
        <button style={btnBlue} onClick={handleCreate}>Create Role</button>
      </div>

      {/* Custom roles list */}
      {loading ? <Spin /> : roles.length === 0 ? (
        <div style={{ color:"#6B7E95", textAlign:"center", padding:32 }}>
          No custom roles yet. Create one above.
        </div>
      ) : (
        roles.map(role => {
          const isEditing = editing === role.name;
          const editRole  = isEditing
            ? roles.find(r => r.name === role.name)
            : null;
          return (
            <div key={role.name} style={{ ...card, marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: isEditing ? 14 : 0 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, color:"#E8EFF8" }}>{role.label}</div>
                  <div style={{ fontSize:11, color:"#6B7E95", marginTop:2 }}>
                    key: <code style={{ color:"#85B7EB" }}>{role.name}</code>
                    {" · "}{role.permissions.length} feature{role.permissions.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <button style={btnSm} onClick={() => setEditing(isEditing ? null : role.name)}>
                  {isEditing ? "Cancel" : "✏ Edit"}
                </button>
                <button
                  style={{ ...btnSm, background:"#7A1F1F", color:"#FCEBEB", border:"1px solid #7A1F1F" }}
                  onClick={() => handleDelete(role.name)}>
                  🗑 Delete
                </button>
              </div>

              {isEditing && (
                <div>
                  <div style={{ marginBottom:10 }}>
                    <div style={lbl}>Display Label</div>
                    <input style={inp} value={role.label}
                      onChange={e => setRoles(prev => prev.map(r =>
                        r.name === role.name ? { ...r, label: e.target.value } : r
                      ))} />
                  </div>
                  <div style={lbl}>Feature Access</div>
                  <div style={{
                    display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))",
                    gap:8, marginTop:8, marginBottom:14,
                  }}>
                    {features.map(f => (
                      <label key={f.key} style={{
                        display:"flex", alignItems:"center", gap:8,
                        background:"#0A0F1A", border:"1px solid",
                        borderColor: role.permissions.includes(f.key) ? "#378ADD" : "#1E2D42",
                        borderRadius:6, padding:"8px 10px", cursor:"pointer",
                      }}>
                        <input type="checkbox"
                          checked={role.permissions.includes(f.key)}
                          onChange={() => setRoles(prev => prev.map(r =>
                            r.name === role.name
                              ? { ...r, permissions: r.permissions.includes(f.key)
                                  ? r.permissions.filter(k => k !== f.key)
                                  : [...r.permissions, f.key] }
                              : r
                          ))}
                          style={{ width:14, height:14 }} />
                        <span style={{ fontSize:12,
                          color: role.permissions.includes(f.key) ? "#E8EFF8" : "#6B7E95" }}>
                          {f.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button style={btnBlue} onClick={() => handleSave(role)}>💾 Save Changes</button>
                </div>
              )}
            </div>
          );
        })
      )}
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
    setMsg("Sending…"); setError("");
    const res = await sendTestEmail();
    if (res.ok) setMsg(`✅ Test email sent to: ${res.sent_to?.join(", ")}`);
    else setError(res.error || "Failed");
  }

  if (loading || !settings) return <Spin />;

  return (
    <div style={{ display:"grid", gap:16 }}>
      <div style={card}>
        <div style={cardTitle}>SMTP Configuration</div>
        <Grid>
          <Fld label="SMTP Host">
            <input style={inp} placeholder="smtp.gmail.com"
              value={settings.smtp_host} onChange={e => upd("smtp_host", e.target.value)} />
          </Fld>
          <Fld label="SMTP Port">
            <input style={inp} type="number"
              value={settings.smtp_port} onChange={e => upd("smtp_port", +e.target.value)} />
          </Fld>
          <Fld label="SMTP Username">
            <input style={inp} value={settings.smtp_user}
              onChange={e => upd("smtp_user", e.target.value)} />
          </Fld>
          <Fld label="SMTP Password (blank = keep existing)">
            <input type="password" style={inp} placeholder="••••••••"
              onChange={e => upd("smtp_password", e.target.value)} />
          </Fld>
          <Fld label="From Email">
            <input style={inp} value={settings.from_email}
              onChange={e => upd("from_email", e.target.value)} />
          </Fld>
          <Fld label="Use TLS">
            <select style={inp} value={settings.smtp_use_tls ? "1" : "0"}
              onChange={e => upd("smtp_use_tls", e.target.value === "1")}>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </Fld>
        </Grid>
        <Fld label="Alert Recipients (comma-separated)">
          <input style={inp} value={settings.alert_recipients}
            onChange={e => upd("alert_recipients", e.target.value)} />
        </Fld>
      </div>

      <div style={card}>
        <div style={cardTitle}>Notification Settings</div>
        <Grid>
          <Fld label="FIFO Violation Alert">
            <Toggle value={settings.fifo_alert_enabled}
              onChange={v => upd("fifo_alert_enabled", v)} />
          </Fld>
          <Fld label="Stuck Tray Alert (hourly)">
            <Toggle value={settings.stuck_alert_enabled}
              onChange={v => upd("stuck_alert_enabled", v)} />
          </Fld>
          <Fld label="Stuck Threshold (hours)">
            <input style={inp} type="number" min={1} max={48}
              value={settings.stuck_hours}
              onChange={e => upd("stuck_hours", +e.target.value)} />
          </Fld>
          <Fld label="Daily Summary Email">
            <Toggle value={settings.daily_summary_enabled}
              onChange={v => upd("daily_summary_enabled", v)} />
          </Fld>
          <Fld label="Summary Send Hour (UTC 0–23)">
            <input style={inp} type="number" min={0} max={23}
              value={settings.daily_summary_hour}
              onChange={e => upd("daily_summary_hour", +e.target.value)} />
          </Fld>
        </Grid>
      </div>

      {error && <div style={errBox}>{error}</div>}
      {msg   && <div style={okBox}>{msg}</div>}

      <div style={{ display:"flex", gap:10 }}>
        <button style={btnBlue} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "💾 Save Settings"}
        </button>
        <button style={btnGray} onClick={testEmail}>📨 Send Test Email</button>
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
        <p style={{ fontSize:12, color:"#6B7E95", marginBottom:12 }}>
          Edit stages, projects, split and branch settings. Changes apply immediately — no redeploy.
        </p>
        {jsonErr && <div style={errBox}>{jsonErr}</div>}
        <textarea value={raw} onChange={e => handleRawChange(e.target.value)} style={{
          width:"100%", height:480, background:"#0A0F1A",
          border:"1px solid #1E2D42", borderRadius:8, color:"#97C459",
          fontFamily:"Courier New, monospace", fontSize:12, padding:14,
          lineHeight:1.5, resize:"vertical", outline:"none", boxSizing:"border-box",
        }}/>
      </div>
      {error && <div style={errBox}>{error}</div>}
      {msg   && <div style={okBox}>{msg}</div>}
      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <button style={btnBlue} onClick={save} disabled={saving || !!jsonErr}>
          {saving ? "Saving…" : "💾 Save Config"}
        </button>
        <button style={btnGray} onClick={handleReset}>↩ Reset to Defaults</button>
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
      label: "📄 Trays CSV", color: "#185FA5",
      desc: "All tray records with optional filters.",
      action: () => downloadTraysCSV({
        ...(stage     ? { stage }              : {}),
        ...(project   ? { project }            : {}),
        ...(startDate ? { start_date:startDate } : {}),
        ...(endDate   ? { end_date:endDate }     : {}),
      }),
    },
    {
      label: "📋 Scan Log CSV", color: "#3B6D11",
      desc: "Full scan event history with timestamps.",
      action: downloadScanLogCSV,
    },
    {
      label: "📊 Full Report XLSX", color: "#7F77DD",
      desc: "3-sheet workbook: Trays, Scan Log, Stage Summary.",
      action: downloadReportXLSX,
    },
  ];

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Filters (for Trays CSV)</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
          <Fld label="Stage"><input style={inp} placeholder="e.g. TESTING" value={stage}
            onChange={e => setStage(e.target.value.toUpperCase())} /></Fld>
          <Fld label="Project"><input style={inp} placeholder="e.g. CD2_PRO" value={project}
            onChange={e => setProject(e.target.value.toUpperCase())} /></Fld>
          <Fld label="Start Date"><input type="date" style={inp} value={startDate}
            onChange={e => setStartDate(e.target.value)} /></Fld>
          <Fld label="End Date"><input type="date" style={inp} value={endDate}
            onChange={e => setEndDate(e.target.value)} /></Fld>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14 }}>
        {exports.map(ex => (
          <div key={ex.label} style={{ ...card, borderTop:`3px solid ${ex.color}`,
            display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#E8EFF8", marginBottom:6 }}>
                {ex.label}
              </div>
              <div style={{ fontSize:12, color:"#6B7E95" }}>{ex.desc}</div>
            </div>
            <button onClick={ex.action}
              style={{ ...btnBlue, background:ex.color, borderColor:ex.color }}>
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
    getAuditLog(lim).then(d => { setLogs(Array.isArray(d) ? d : []); setLoading(false); });
  }

  useEffect(() => { loadLogs(); }, []);

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", { dateStyle:"short", timeStyle:"medium" });
  }

  const filtered = logs.filter(l => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (l.username||"").toLowerCase().includes(q) ||
           (l.action||"").toLowerCase().includes(q) ||
           (l.details||"").toLowerCase().includes(q);
  });

  function downloadCSV() {
    const rows = [
      ["Timestamp","User","Action","Details"],
      ...filtered.map(l => [fmtDate(l.timestamp), l.username||"", l.action||"", (l.details||"").replace(/,/g,";")]),
    ];
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const actionTag = (action) => {
    if (["DELETE_TRAY","DELETE_USER","BULK_DELETE_TRAYS"].includes(action)) return "tag-red";
    if (["LOGIN","REGISTER"].includes(action)) return "tag-blue";
    if (action?.startsWith("UPDATE") || action?.startsWith("SAVE") || action?.startsWith("RESET")) return "tag-amber";
    if (action === "SCAN") return "tag-green";
    return "tag-gray";
  };

  return (
    <div>
      <div style={{ ...card, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <input style={{ ...inp, flex:2, minWidth:180 }}
          placeholder="Search user, action, details…"
          value={filter} onChange={e => setFilter(e.target.value)} />
        <select style={{ ...inp, width:"auto", flex:"none" }}
          value={limit}
          onChange={e => { setLimit(+e.target.value); loadLogs(+e.target.value); }}>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
          <option value={1000}>Last 1000</option>
        </select>
        <button style={btnGray} onClick={() => loadLogs()}>↻ Refresh</button>
        <button style={btnBlue} onClick={downloadCSV} disabled={filtered.length === 0}>
          ⬇ Download CSV
        </button>
      </div>
      <div style={{ fontSize:11, color:"#6B7E95", marginBottom:8 }}>
        {filtered.length} entries{filter ? " (filtered)" : ""}
      </div>
      <div style={{ ...card, padding:0, overflow:"hidden" }}>
        {loading ? <Spin /> : filtered.length === 0 ? (
          <div style={{ padding:32, textAlign:"center", color:"#6B7E95" }}>
            No audit log entries found.
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Details</th></tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontSize:12, color:"#6B7E95", whiteSpace:"nowrap" }}>
                      {fmtDate(l.timestamp)}
                    </td>
                    <td><span style={{ fontFamily:"monospace", fontSize:12 }}>{l.username}</span></td>
                    <td><span className={`tag ${actionTag(l.action)}`}>{l.action}</span></td>
                    <td style={{ fontSize:12, color:"#6B7E95", maxWidth:300 }}>{l.details || "—"}</td>
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

// ── Shared helpers ────────────────────────────────────────────────────────────
function Spin() {
  return <div style={{ padding:32, color:"#6B7E95", textAlign:"center" }}><span className="spin"/> Loading…</div>;
}
function Grid({ children }) {
  return <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{children}</div>;
}
function Fld({ label, children }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:5 }}><div style={lbl}>{label}</div>{children}</div>;
}
function Toggle({ value, onChange }) {
  return (
    <select style={inp} value={value ? "1" : "0"} onChange={e => onChange(e.target.value === "1")}>
      <option value="1">Enabled</option>
      <option value="0">Disabled</option>
    </select>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card     = { background:"#162032", border:"1px solid #1E2D42", borderRadius:12, padding:16, marginBottom:0 };
const cardTitle = { fontSize:12, fontWeight:700, color:"#6B7E95", textTransform:"uppercase", letterSpacing:".06em", marginBottom:14 };
const fldStyle = { display:"flex", flexDirection:"column", gap:5, marginBottom:12 };
const inp      = { width:"100%", padding:"9px 12px", background:"#111827", border:"1px solid #1E2D42", borderRadius:7, color:"#E8EFF8", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
const lbl      = { fontSize:11, color:"#6B7E95", fontWeight:600 };
const btnBlue  = { padding:"9px 18px", background:"#185FA5", color:"#E6F1FB", border:"1px solid #185FA5", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };
const btnGray  = { padding:"9px 16px", background:"#162032", color:"#E8EFF8", border:"1px solid #1E2D42", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" };
const btnSm    = { padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontFamily:"inherit", background:"#162032", color:"#E8EFF8", border:"1px solid #1E2D42" };
const errBox   = { background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)", borderRadius:8, padding:12, color:"#F09595", fontSize:13, marginBottom:12 };
const okBox    = { background:"rgba(59,109,17,.2)", border:"1px solid rgba(59,109,17,.4)", borderRadius:8, padding:12, color:"#97C459", fontSize:13, marginBottom:12 };