import { useState, useEffect } from "react";
import {
  getAdminPipelineConfig, saveAdminPipelineConfig, resetPipelineConfig,
  getEmailSettings, saveEmailSettings, sendTestEmail,
  listUsers, adminCreateUser, changeUserRole, adminResetPassword, deleteUser,
  getFeatures, listRoles, createRole, updateRole, deleteRole,
  downloadTraysCSV, downloadScanLogCSV, downloadReportXLSX,
  getAuditLog,
} from "../api/api";
import { useLang } from "../context/LangContext";

export default function AdminPage() {
  const { t } = useLang();
  const [tab, setTab] = useState("users");

  const TABS = [
    { key:"users",    label:`👥 ${t("users")}` },
    { key:"roles",    label:"🔑 Roles & Permissions" },
    { key:"email",    label:"📧 Email & Alerts" },
    { key:"pipeline", label:"🔧 Pipeline Config" },
    { key:"export",   label:`⬇ ${t("export")}` },
    { key:"audit",    label:"📋 Audit Log" },
  ];

  return (
    <div style={{ maxWidth:960, margin:"0 auto" }}>
      <h2 style={{ color:"var(--text)", marginBottom:20 }}>⚙ {t("admin")} Panel</h2>
      <div style={{ display:"flex", gap:4, marginBottom:20, flexWrap:"wrap" }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className={`tab-btn${tab===tb.key?" on":""}`}>
            {tb.label}
          </button>
        ))}
      </div>
      {tab==="users"    && <UsersTab />}
      {tab==="roles"    && <RolesTab />}
      {tab==="email"    && <EmailTab />}
      {tab==="pipeline" && <PipelineTab />}
      {tab==="export"   && <ExportTab />}
      {tab==="audit"    && <AuditTab />}
    </div>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────────
function UsersTab() {
  const { t } = useLang();
  const [users,       setUsers]       = useState([]);
  const [roles,       setRoles]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [newName,     setNewName]     = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [newRole,     setNewRole]     = useState("operator");
  const [msg,         setMsg]         = useState("");
  const [error,       setError]       = useState("");
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

  const allRoles = [
    { name:"admin",    label:"Admin" },
    { name:"operator", label:"Operator" },
    ...roles.map(r => ({ name:r.name, label:r.label||r.name })),
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

  async function handleRoleChange(username, role) { await changeUserRole(username, role); load(); }

  async function handleDelete(username) {
    if (!confirm(`Permanently delete user "${username}"?`)) return;
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
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => { setResetTarget(null); setResetMsg(""); setResetPw(""); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:28, width:"min(400px,96vw)" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:4 }}>Reset Password</div>
            <div style={{ fontSize:12, color:"var(--muted)", marginBottom:20 }}>
              User: <strong style={{ color:"var(--text)" }}>{resetTarget}</strong>
            </div>
            <div className="inp-group">
              <label className="inp-label">New Password (min 6 chars)</label>
              <input type="password" className="inp" placeholder="New password"
                value={resetPw} onChange={e => setResetPw(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handleResetPassword()} />
            </div>
            {resetMsg && <div className={resetMsg.includes("✅")?"ok-box":"err-box"}>{resetMsg}</div>}
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button className="btn btn-blue" onClick={handleResetPassword}>Update Password</button>
              <button className="btn" onClick={() => { setResetTarget(null); setResetMsg(""); setResetPw(""); }}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={cardTitle}>Create New User</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div style={lbl}>{t("username")}</div>
            <input className="inp" placeholder="username" value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div>
            <div style={lbl}>{t("password")}</div>
            <input type="password" className="inp" placeholder="••••••" value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          <div>
            <div style={lbl}>{t("role")}</div>
            <select className="inp" value={newRole} onChange={e => setNewRole(e.target.value)}>
              {allRoles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="err-box">{error}</div>}
        {msg   && <div className="ok-box">{msg}</div>}
        <button className="btn btn-blue" onClick={handleCreate}>➕ {t("addUser")}</button>
      </div>

      <div style={{ ...card, padding:0, overflow:"hidden" }}>
        <div style={{ ...cardTitle, padding:"14px 16px 0" }}>All Users ({users.length})</div>
        {loading ? <Spin /> : (
          <table className="tbl" style={{ margin:0 }}>
            <thead>
              <tr><th>#</th><th>{t("username")}</th><th>{t("role")}</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id}>
                  <td style={{ color:"var(--muted)", fontSize:11 }}>{i+1}</td>
                  <td>
                    <span style={{ fontFamily:"monospace", fontSize:13 }}>{u.username}</span>
                    {u.username===currentUser && <span className="tag tag-blue" style={{ marginLeft:8, fontSize:10 }}>you</span>}
                  </td>
                  <td>
                    <select value={u.role} onChange={e => handleRoleChange(u.username, e.target.value)}
                      className="inp" style={{ width:"auto", padding:"4px 8px", fontSize:12 }}>
                      {allRoles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="btn btn-blue" style={{ padding:"5px 10px", fontSize:11 }}
                        onClick={() => { setResetTarget(u.username); setResetMsg(""); setResetPw(""); }}>
                        🔑 Reset PW
                      </button>
                      {u.username!==currentUser && (
                        <button className="btn btn-red" style={{ padding:"5px 10px", fontSize:11 }}
                          onClick={() => handleDelete(u.username)}>
                          🗑 {t("delete")}
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
      <div style={{ marginTop:12, fontSize:12, color:"var(--muted)" }}>
        💡 To delete your own account, ask another admin.
      </div>
    </div>
  );
}

// ── Roles tab ──────────────────────────────────────────────────────────────────
function RolesTab() {
  const { t } = useLang();
  const [roles,    setRoles]    = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [newName,  setNewName]  = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPerms, setNewPerms] = useState([]);
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");

  async function load() {
    setLoading(true);
    const [r, f] = await Promise.all([listRoles(), getFeatures()]);
    setRoles(Array.isArray(r) ? r : []);
    setFeatures(f?.features || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) { setError("Role name required"); return; }
    setError(""); setMsg("");
    const res = await createRole({ name:newName, label:newLabel||newName, permissions:newPerms });
    if (res.error || !res.ok) { setError(res.error||"Failed"); return; }
    setMsg(`✅ Role "${newLabel||newName}" created`);
    setNewName(""); setNewLabel(""); setNewPerms([]);
    load();
  }

  async function handleSave(role) {
    const res = await updateRole(role.name, { label:role.label, permissions:role.permissions });
    if (res.ok) { setMsg(`✅ Role "${role.label}" updated`); setEditing(null); load(); }
    else setError("Failed to save");
  }

  async function handleDelete(name) {
    if (!confirm(`Delete role "${name}"?`)) return;
    const res = await deleteRole(name);
    if (res.ok) { setMsg("✅ Role deleted"); load(); }
    else setError("Delete failed");
  }

  const permToggle = (perms, key) =>
    perms.includes(key) ? perms.filter(k => k!==key) : [...perms, key];

  return (
    <div>
      <div style={{ ...card, marginBottom:16 }}>
        <div style={{ fontSize:12, color:"var(--muted)", marginBottom:14 }}>
          Built-in roles (<strong style={{ color:"var(--text)" }}>admin</strong> and{" "}
          <strong style={{ color:"var(--text)" }}>operator</strong>) have fixed access and cannot be edited.
        </div>
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { name:"admin",    label:"Admin",    desc:"Full access to everything" },
            { name:"operator", label:"Operator", desc:"Dashboard, scan, create trays, history" },
          ].map(r => (
            <div key={r.name} style={{ flex:1, minWidth:160, background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px" }}>
              <div style={{ fontWeight:700, color:"var(--text)", marginBottom:4 }}>{r.label}</div>
              <div style={{ fontSize:11, color:"var(--muted)" }}>{r.desc}</div>
              <div style={{ marginTop:8 }}><span className="tag tag-gray" style={{ fontSize:10 }}>built-in · cannot edit</span></div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>Create Custom Role</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div>
            <div style={lbl}>Role Key (e.g. supervisor)</div>
            <input className="inp" placeholder="supervisor" value={newName}
              onChange={e => setNewName(e.target.value.toLowerCase().replace(/\s/g,"_"))} />
          </div>
          <div>
            <div style={lbl}>Display Label</div>
            <input className="inp" placeholder="Supervisor" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          </div>
        </div>
        <div style={lbl}>Feature Access</div>
        <PermGrid features={features} perms={newPerms}
          onChange={key => setNewPerms(p => permToggle(p, key))} />
        {error && <div className="err-box">{error}</div>}
        {msg   && <div className="ok-box">{msg}</div>}
        <button className="btn btn-blue" onClick={handleCreate}>Create {t("role")}</button>
      </div>

      {loading ? <Spin /> : roles.length===0 ? (
        <div style={{ color:"var(--muted)", textAlign:"center", padding:32 }}>No custom roles yet.</div>
      ) : roles.map(role => {
        const isEditing = editing===role.name;
        return (
          <div key={role.name} style={{ ...card, marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isEditing?14:0 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:"var(--text)" }}>{role.label}</div>
                <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>
                  key: <code style={{ color:"var(--note-text)" }}>{role.name}</code>
                  {" · "}{role.permissions.length} feature{role.permissions.length!==1?"s":""}
                </div>
              </div>
              <button className="btn" style={{ padding:"5px 10px", fontSize:11 }}
                onClick={() => setEditing(isEditing ? null : role.name)}>
                {isEditing ? t("cancel") : "✏ Edit"}
              </button>
              <button className="btn btn-red" style={{ padding:"5px 10px", fontSize:11 }}
                onClick={() => handleDelete(role.name)}>🗑 {t("delete")}</button>
            </div>
            {isEditing && (
              <div>
                <div style={{ marginBottom:10 }}>
                  <div style={lbl}>Display Label</div>
                  <input className="inp" value={role.label}
                    onChange={e => setRoles(prev => prev.map(r => r.name===role.name ? {...r,label:e.target.value} : r))} />
                </div>
                <div style={lbl}>Feature Access</div>
                <PermGrid features={features} perms={role.permissions}
                  onChange={key => setRoles(prev => prev.map(r => r.name===role.name ? {...r, permissions:permToggle(r.permissions, key)} : r))} />
                <button className="btn btn-blue" onClick={() => handleSave(role)}>💾 {t("save")} Changes</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PermGrid({ features, perms, onChange }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:8, marginTop:8, marginBottom:14 }}>
      {features.map(f => (
        <label key={f.key} style={{
          display:"flex", alignItems:"center", gap:8,
          background:"var(--bg)",
          border:`1px solid ${perms.includes(f.key) ? "var(--accent)" : "var(--border)"}`,
          borderRadius:6, padding:"8px 10px", cursor:"pointer",
        }}>
          <input type="checkbox" checked={perms.includes(f.key)}
            onChange={() => onChange(f.key)} style={{ width:14, height:14 }} />
          <span style={{ fontSize:12, color:perms.includes(f.key) ? "var(--text)" : "var(--muted)" }}>{f.label}</span>
        </label>
      ))}
    </div>
  );
}

// ── Email tab ──────────────────────────────────────────────────────────────────
function EmailTab() {
  const { t } = useLang();
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => { getEmailSettings().then(d => { setSettings(d); setLoading(false); }); }, []);
  function upd(k, v) { setSettings(s => ({...s, [k]:v})); }

  async function save() {
    setSaving(true); setMsg(""); setError("");
    const res = await saveEmailSettings(settings);
    setSaving(false);
    if (res.ok) setMsg(`✅ ${t("save")}d`); else setError("Failed to save");
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
          <Fld label="SMTP Host"><input className="inp" placeholder="smtp.gmail.com" value={settings.smtp_host} onChange={e => upd("smtp_host", e.target.value)} /></Fld>
          <Fld label="SMTP Port"><input className="inp" type="number" value={settings.smtp_port} onChange={e => upd("smtp_port", +e.target.value)} /></Fld>
          <Fld label="SMTP Username"><input className="inp" value={settings.smtp_user} onChange={e => upd("smtp_user", e.target.value)} /></Fld>
          <Fld label="SMTP Password"><input type="password" className="inp" placeholder="••••••••" onChange={e => upd("smtp_password", e.target.value)} /></Fld>
          <Fld label={`From ${t("email")}`}><input className="inp" value={settings.from_email} onChange={e => upd("from_email", e.target.value)} /></Fld>
          <Fld label="Use TLS">
            <select className="inp" value={settings.smtp_use_tls?"1":"0"} onChange={e => upd("smtp_use_tls", e.target.value==="1")}>
              <option value="1">{t("yes")}</option><option value="0">{t("no")}</option>
            </select>
          </Fld>
        </Grid>
        <Fld label="Alert Recipients (comma-separated)">
          <input className="inp" value={settings.alert_recipients} onChange={e => upd("alert_recipients", e.target.value)} />
        </Fld>
      </div>

      <div style={card}>
        <div style={cardTitle}>Notification {t("settings")}</div>
        <Grid>
          <Fld label="FIFO Alert"><EToggle value={settings.fifo_alert_enabled} onChange={v => upd("fifo_alert_enabled",v)} /></Fld>
          <Fld label="Stuck Tray Alert (hourly)"><EToggle value={settings.stuck_alert_enabled} onChange={v => upd("stuck_alert_enabled",v)} /></Fld>
          <Fld label="Stuck Threshold (hours)"><input className="inp" type="number" min={1} max={48} value={settings.stuck_hours} onChange={e => upd("stuck_hours", +e.target.value)} /></Fld>
          <Fld label="Daily Summary Email"><EToggle value={settings.daily_summary_enabled} onChange={v => upd("daily_summary_enabled",v)} /></Fld>
          <Fld label="Summary Hour (UTC 0–23)"><input className="inp" type="number" min={0} max={23} value={settings.daily_summary_hour} onChange={e => upd("daily_summary_hour", +e.target.value)} /></Fld>
        </Grid>
      </div>

      {error && <div className="err-box">{error}</div>}
      {msg   && <div className="ok-box">{msg}</div>}
      <div style={{ display:"flex", gap:10 }}>
        <button className="btn btn-blue" onClick={save} disabled={saving}>{saving?"Saving…":`💾 ${t("save")} Settings`}</button>
        <button className="btn" onClick={testEmail}>📨 Send Test Email</button>
      </div>
    </div>
  );
}

// ── Pipeline tab ───────────────────────────────────────────────────────────────
const PALETTE = ["#378ADD","#7F77DD","#EF9F27","#E24B4A","#5DCAA5","#D4537E","#BA7517","#185FA5","#3B6D11","#888780","#9B59B6","#E67E22","#1ABC9C","#E74C3C","#2ECC71"];

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
      {PALETTE.map(c => (
        <div key={c} onClick={() => onChange(c)} style={{ width:22, height:22, borderRadius:5, background:c, cursor:"pointer", outline:value===c?`3px solid ${c}`:"2px solid transparent", outlineOffset:2 }}/>
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width:22, height:22, border:"none", background:"none", cursor:"pointer", padding:0 }}/>
    </div>
  );
}

function PToggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, cursor:"pointer", background:value?"var(--accent-dk)":"var(--border)", position:"relative", transition:"background .2s", flexShrink:0 }}>
      <div style={{ position:"absolute", top:3, left:value?21:3, width:16, height:16, borderRadius:8, background:"var(--text-inv)", transition:"left .2s" }}/>
    </div>
  );
}

function rebuildNext(stages) {
  return stages.map((s,i) => ({...s, next:i<stages.length-1?stages[i+1].id:null}));
}

// Pipeline sub-styles — all CSS variables
const PS = {
  card:    { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", marginBottom:14 },
  label:   { fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:6, display:"block" },
  input:   { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--inp-bg)", color:"var(--text)", fontSize:13, boxSizing:"border-box", outline:"none", fontFamily:"inherit" },
  select:  { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--inp-bg)", color:"var(--text)", fontSize:13, boxSizing:"border-box", outline:"none", cursor:"pointer", fontFamily:"inherit" },
  btn:     { padding:"8px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--text)", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  btnP:    { padding:"8px 16px", borderRadius:8, border:"none", background:"var(--accent-dk)", color:"var(--accent-text)", fontSize:12, cursor:"pointer", fontWeight:700, fontFamily:"inherit" },
  btnR:    { padding:"8px 14px", borderRadius:8, border:"1px solid var(--err-border)", background:"var(--err-bg)", color:"var(--err-text)", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  btnG:    { padding:"8px 16px", borderRadius:8, border:"none", background:"var(--green)", color:"var(--green-lt)", fontSize:12, cursor:"pointer", fontWeight:700, fontFamily:"inherit" },
  secTitle:{ fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 },
  tag:     (col) => ({ background:col+"22", color:col, borderRadius:5, padding:"2px 9px", fontSize:11, fontWeight:700, display:"inline-block" }),
};

function StageInlineEditor({ stage, onSave, onCancel }) {
  const [form, setForm] = useState({...stage});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ background:"var(--bg)", border:"1px solid var(--note-border)", borderRadius:10, padding:16, marginTop:8 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <div><span style={PS.label}>Stage ID (read-only)</span><input style={{...PS.input,opacity:.5}} value={form.id} readOnly/></div>
        <div><span style={PS.label}>Display label</span><input style={PS.input} value={form.label} onChange={e=>set("label",e.target.value)}/></div>
        <div><span style={PS.label}>Scan note</span><input style={PS.input} value={form.scanNote||""} onChange={e=>set("scanNote",e.target.value)}/></div>
        <div>
          <span style={PS.label}>Stuck alert threshold</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="number" min={5} step={5} style={{...PS.input,width:90}} value={Math.round((form.stuckLimitSeconds||3600)/60)} onChange={e=>set("stuckLimitSeconds",Number(e.target.value)*60)}/>
            <span style={{ color:"var(--muted)", fontSize:12 }}>minutes</span>
          </div>
        </div>
      </div>
      <span style={PS.label}>Stage colour</span>
      <ColorPicker value={form.color||"#888780"} onChange={v=>set("color",v)}/>
      <div style={{ display:"flex", gap:8, marginTop:16 }}>
        <button style={PS.btnP} onClick={()=>onSave(form)}>Save stage</button>
        <button style={PS.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PipelineStagesTab({ config, setConfig }) {
  const [editing, setEditing] = useState(null);
  const [adding,  setAdding]  = useState(false);
  const [newStage, setNewStage] = useState({ id:"", label:"", color:"#378ADD", scanNote:"", stuckLimitSeconds:3600 });
  const stages = config.stages || [];

  function move(idx, dir) {
    const arr = [...stages]; const swap=idx+dir;
    if (swap<0||swap>=arr.length) return;
    [arr[idx],arr[swap]]=[arr[swap],arr[idx]];
    setConfig(c=>({...c,stages:rebuildNext(arr)}));
  }
  function saveEdit(updated) { setConfig(c=>({...c,stages:rebuildNext(c.stages.map(s=>s.id===updated.id?updated:s))})); setEditing(null); }
  function deleteStage(id) { if(!confirm(`Delete stage "${id}"?`))return; setConfig(c=>({...c,stages:rebuildNext(c.stages.filter(s=>s.id!==id))})); }
  function addStage() {
    if(!newStage.id.trim()||!newStage.label.trim()) return alert("ID and Label required.");
    if(stages.find(s=>s.id===newStage.id.trim().toUpperCase())) return alert("Stage ID already exists.");
    const s={...newStage,id:newStage.id.trim().toUpperCase()};
    setConfig(c=>({...c,stages:rebuildNext([...c.stages,s])}));
    setNewStage({id:"",label:"",color:"#378ADD",scanNote:"",stuckLimitSeconds:3600});
    setAdding(false);
  }

  return (
    <div>
      <div style={{...PS.card,padding:"12px 16px",marginBottom:16}}>
        <div style={PS.secTitle}>Pipeline flow preview</div>
        <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:4 }}>
          {stages.map((s,i)=>(
            <span key={s.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={PS.tag(s.color||"#888780")}>{s.label}</span>
              {i<stages.length-1&&<span style={{ color:"var(--muted)", fontSize:12 }}>›</span>}
            </span>
          ))}
        </div>
      </div>
      {stages.map((s,i)=>(
        <div key={s.id}>
          <div style={{...PS.card,padding:"12px 16px",marginBottom:editing===s.id?0:8}}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:12, height:12, borderRadius:3, background:s.color||"#888780", flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{s.label}</div>
                <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{s.id} · alert after {Math.round((s.stuckLimitSeconds||3600)/60)} min{s.scanNote?` · "${s.scanNote}"`:"" }</div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{...PS.btn,padding:"4px 8px"}} onClick={()=>move(i,-1)} disabled={i===0}>↑</button>
                <button style={{...PS.btn,padding:"4px 8px"}} onClick={()=>move(i,1)} disabled={i===stages.length-1}>↓</button>
                <button style={{...PS.btn,padding:"4px 10px"}} onClick={()=>setEditing(editing===s.id?null:s.id)}>Edit</button>
                <button style={{...PS.btnR,padding:"4px 10px"}} onClick={()=>deleteStage(s.id)}>Delete</button>
              </div>
            </div>
          </div>
          {editing===s.id&&<div style={{marginBottom:8}}><StageInlineEditor stage={s} onSave={saveEdit} onCancel={()=>setEditing(null)}/></div>}
        </div>
      ))}
      {!adding
        ? <button style={{...PS.btnG,marginTop:4}} onClick={()=>setAdding(true)}>+ Add stage</button>
        : (
          <div style={{...PS.card,border:"1px solid var(--ok-border)"}}>
            <div style={PS.secTitle}>New stage</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div><span style={PS.label}>Stage ID</span><input style={PS.input} placeholder="LASER_CUT" value={newStage.id} onChange={e=>setNewStage(f=>({...f,id:e.target.value.toUpperCase()}))}/></div>
              <div><span style={PS.label}>Display label</span><input style={PS.input} placeholder="Laser Cutting" value={newStage.label} onChange={e=>setNewStage(f=>({...f,label:e.target.value}))}/></div>
              <div><span style={PS.label}>Scan note</span><input style={PS.input} value={newStage.scanNote} onChange={e=>setNewStage(f=>({...f,scanNote:e.target.value}))}/></div>
              <div>
                <span style={PS.label}>Stuck alert (minutes)</span>
                <input type="number" min={5} step={5} style={PS.input} value={Math.round(newStage.stuckLimitSeconds/60)} onChange={e=>setNewStage(f=>({...f,stuckLimitSeconds:Number(e.target.value)*60}))}/>
              </div>
            </div>
            <span style={PS.label}>Colour</span>
            <ColorPicker value={newStage.color} onChange={v=>setNewStage(f=>({...f,color:v}))}/>
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button style={PS.btnP} onClick={addStage}>Add to pipeline</button>
              <button style={PS.btn} onClick={()=>setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
    </div>
  );
}

function PipelineProjectsTab({ config, setConfig }) {
  const [editing, setEditing] = useState(null);
  const [adding,  setAdding]  = useState(false);
  const [newProj, setNewProj] = useState({ id:"", label:"", panels:50, unitsPerPanel:9 });
  const projects = config.projects || [];

  function saveProject(updated) {
    const p={...updated,unitsPerTray:updated.panels*updated.unitsPerPanel};
    setConfig(c=>({...c,projects:c.projects.map(x=>x.id===p.id?p:x)}));
    setEditing(null);
  }
  function deleteProject(id) {
    if(!confirm(`Remove project "${id}"?`))return;
    setConfig(c=>({...c,projects:c.projects.filter(p=>p.id!==id)}));
  }
  function addProject() {
    if(!newProj.id.trim()||!newProj.label.trim())return alert("ID and Label required.");
    if(projects.find(p=>p.id===newProj.id.trim().toUpperCase()))return alert("Project ID already exists.");
    const p={id:newProj.id.trim().toUpperCase(),label:newProj.label.trim(),panels:Number(newProj.panels),unitsPerPanel:Number(newProj.unitsPerPanel),unitsPerTray:Number(newProj.panels)*Number(newProj.unitsPerPanel),stageIds:[],splitOverride:"inherit",branchOverride:"inherit",branchOptions:[]};
    setConfig(c=>({...c,projects:[...c.projects,p]}));
    setNewProj({id:"",label:"",panels:50,unitsPerPanel:9});
    setAdding(false);
  }

  return (
    <div>
      <div style={{ overflowX:"auto", marginBottom:16 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:"1px solid var(--border)" }}>
              {["ID","Label","Panels","Units/Panel","Units/Tray","Split","Branch",""].map(h=>(
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map(p=>(
              <>
                <tr key={p.id} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"10px 10px", fontSize:12, color:"var(--note-text)", fontWeight:700 }}>{p.id}</td>
                  <td style={{ padding:"10px 10px", fontSize:13, color:"var(--text)" }}>{p.label}</td>
                  <td style={{ padding:"10px 10px", fontSize:13, color:"var(--text)" }}>{p.panels}</td>
                  <td style={{ padding:"10px 10px", fontSize:13, color:"var(--text)" }}>{p.unitsPerPanel}</td>
                  <td style={{ padding:"10px 10px", fontSize:13, fontWeight:700, color:"#5DCAA5" }}>{p.unitsPerTray}</td>
                  <td style={{ padding:"10px 10px" }}><span style={PS.tag("#EF9F27")}>{p.splitOverride}</span></td>
                  <td style={{ padding:"10px 10px" }}><span style={PS.tag("#7F77DD")}>{p.branchOverride}</span></td>
                  <td style={{ padding:"10px 10px" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={{...PS.btn,padding:"4px 10px"}} onClick={()=>setEditing(editing===p.id?null:p.id)}>Edit</button>
                      <button style={{...PS.btnR,padding:"4px 10px"}} onClick={()=>deleteProject(p.id)}>✕</button>
                    </div>
                  </td>
                </tr>
                {editing===p.id&&(
                  <tr key={p.id+"_ed"}>
                    <td colSpan={8} style={{ padding:"0 0 12px 0" }}>
                      <ProjectInlineEditor project={p} onSave={saveProject} onCancel={()=>setEditing(null)}/>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      {!adding
        ? <button style={PS.btnG} onClick={()=>setAdding(true)}>+ Add project</button>
        : (
          <div style={{...PS.card,border:"1px solid var(--ok-border)"}}>
            <div style={PS.secTitle}>New project</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
              <div><span style={PS.label}>Project ID</span><input style={PS.input} placeholder="PD8" value={newProj.id} onChange={e=>setNewProj(f=>({...f,id:e.target.value.toUpperCase()}))}/></div>
              <div><span style={PS.label}>Label</span><input style={PS.input} placeholder="PD8" value={newProj.label} onChange={e=>setNewProj(f=>({...f,label:e.target.value}))}/></div>
              <div><span style={PS.label}>Panels per tray</span><input type="number" min={1} style={PS.input} value={newProj.panels} onChange={e=>setNewProj(f=>({...f,panels:Number(e.target.value)}))}/></div>
              <div><span style={PS.label}>Units per panel</span><input type="number" min={1} style={PS.input} value={newProj.unitsPerPanel} onChange={e=>setNewProj(f=>({...f,unitsPerPanel:Number(e.target.value)}))}/></div>
            </div>
            <div style={{ fontSize:13, color:"#5DCAA5", marginBottom:14 }}>Units per tray: <strong>{newProj.panels*newProj.unitsPerPanel}</strong></div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={PS.btnP} onClick={addProject}>Add project</button>
              <button style={PS.btn} onClick={()=>setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
    </div>
  );
}

function ProjectInlineEditor({ project, onSave, onCancel }) {
  const [form, setForm] = useState({...project});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:16, margin:"4px 0" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
        <div><span style={PS.label}>Label</span><input style={PS.input} value={form.label} onChange={e=>set("label",e.target.value)}/></div>
        <div><span style={PS.label}>Panels</span><input type="number" min={1} style={PS.input} value={form.panels} onChange={e=>set("panels",Number(e.target.value))}/></div>
        <div><span style={PS.label}>Units per panel</span><input type="number" min={1} style={PS.input} value={form.unitsPerPanel} onChange={e=>set("unitsPerPanel",Number(e.target.value))}/></div>
        <div><span style={PS.label}>Units per tray (auto)</span><input style={{...PS.input,opacity:.5}} readOnly value={form.panels*form.unitsPerPanel}/></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        <div>
          <span style={PS.label}>Split override</span>
          <select style={PS.select} value={form.splitOverride||"inherit"} onChange={e=>set("splitOverride",e.target.value)}>
            <option value="inherit">Inherit global setting</option>
            <option value="enabled">Always enabled</option>
            <option value="disabled">Disabled for this project</option>
          </select>
        </div>
        <div>
          <span style={PS.label}>Branch override</span>
          <select style={PS.select} value={form.branchOverride||"inherit"} onChange={e=>set("branchOverride",e.target.value)}>
            <option value="inherit">Inherit global setting</option>
            <option value="enabled">Always enabled</option>
            <option value="disabled">Disabled for this project</option>
          </select>
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={PS.btnP} onClick={()=>onSave({...form,unitsPerTray:form.panels*form.unitsPerPanel})}>Save project</button>
        <button style={PS.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PipelineSplitBranchTab({ config, setConfig }) {
  const stages=config.stages||[], split=config.split||{}, branch=config.branch||{}, branchOpts=branch.options||[];
  const [editingB, setEditingB]=useState(null);
  const [addingB,  setAddingB] =useState(false);
  const [newB, setNewB]=useState({id:"",label:"",icon:"⚡",color:"#378ADD",next:"",scanNote:""});

  const setSplit =(k,v)=>setConfig(c=>({...c,split:{...c.split,[k]:v}}));
  const setBranch=(k,v)=>setConfig(c=>({...c,branch:{...c.branch,[k]:v}}));

  return (
    <div>
      <div style={PS.card}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={PS.secTitle}>Tray split</div>
          <PToggle value={split.enabled} onChange={v=>setSplit("enabled",v)}/>
          <span style={{ fontSize:12, color:split.enabled?"#5DCAA5":"var(--muted)" }}>{split.enabled?"Enabled":"Disabled"}</span>
        </div>
        {split.enabled && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div>
              <span style={PS.label}>Split triggers at stage</span>
              <select style={PS.select} value={split.atStage||""} onChange={e=>setSplit("atStage",e.target.value)}>
                {stages.map(s=><option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
              </select>
            </div>
            <div>
              <span style={PS.label}>Child trays start at</span>
              <select style={PS.select} value={split.resumeAtStage||""} onChange={e=>setSplit("resumeAtStage",e.target.value)}>
                {stages.map(s=><option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={PS.card}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={PS.secTitle}>Branch (operator method choice)</div>
          <PToggle value={branch.enabled} onChange={v=>setBranch("enabled",v)}/>
          <span style={{ fontSize:12, color:branch.enabled?"#5DCAA5":"var(--muted)" }}>{branch.enabled?"Enabled":"Disabled"}</span>
        </div>
        {branch.enabled && (
          <>
            <div style={{ marginBottom:16 }}>
              <span style={PS.label}>Operator chooses branch at stage</span>
              <select style={{...PS.select,maxWidth:320}} value={branch.atStage||""} onChange={e=>setBranch("atStage",e.target.value)}>
                {stages.map(s=><option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
              </select>
            </div>
            <div style={PS.secTitle}>Branch options</div>
            {branchOpts.map(b=>(
              <div key={b.id}>
                <div style={{...PS.card,marginBottom:8,padding:"10px 14px"}}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:20 }}>{b.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{b.label}</div>
                      <div style={{ fontSize:11, color:"var(--muted)" }}>{b.id} → {b.next||"—"} · {b.scanNote||"no scan note"}</div>
                    </div>
                    <div style={{ width:14, height:14, borderRadius:3, background:b.color||"#888780" }}/>
                    <button style={{...PS.btn,padding:"4px 10px"}} onClick={()=>setEditingB(editingB===b.id?null:b.id)}>Edit</button>
                    <button style={{...PS.btnR,padding:"4px 10px"}} onClick={()=>setBranch("options",branchOpts.filter(x=>x.id!==b.id))}>✕</button>
                  </div>
                </div>
                {editingB===b.id&&<BranchOptEditor stages={stages} opt={b} onSave={opt=>{setBranch("options",branchOpts.map(x=>x.id===opt.id?opt:x));setEditingB(null);}} onCancel={()=>setEditingB(null)}/>}
              </div>
            ))}
            {!addingB
              ? <button style={{...PS.btnG,marginTop:4}} onClick={()=>setAddingB(true)}>+ Add branch option</button>
              : <BranchOptEditor stages={stages} opt={newB} isNew onSave={opt=>{if(!opt.id.trim()||!opt.label.trim())return alert("ID and Label required.");setBranch("options",[...branchOpts,{...opt,id:opt.id.trim().toUpperCase()}]);setNewB({id:"",label:"",icon:"⚡",color:"#378ADD",next:"",scanNote:""});setAddingB(false);}} onCancel={()=>setAddingB(false)}/>}
          </>
        )}
      </div>
    </div>
  );
}

function BranchOptEditor({ stages, opt, onSave, onCancel, isNew }) {
  const [form,setForm]=useState({...opt});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:16, marginBottom:8 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>
        <div><span style={PS.label}>Branch ID</span><input style={{...PS.input,...(isNew?{}:{opacity:.5})}} readOnly={!isNew} value={form.id} onChange={e=>set("id",e.target.value.toUpperCase())} placeholder="BAT_SOL_LASER"/></div>
        <div><span style={PS.label}>Label shown to operator</span><input style={PS.input} value={form.label} onChange={e=>set("label",e.target.value)} placeholder="Laser Solder"/></div>
        <div><span style={PS.label}>Icon (emoji)</span><input style={PS.input} value={form.icon} onChange={e=>set("icon",e.target.value)} placeholder="⚡"/></div>
        <div>
          <span style={PS.label}>Goes to stage after branch</span>
          <select style={PS.select} value={form.next||""} onChange={e=>set("next",e.target.value)}>
            <option value="">— select —</option>
            {stages.map(s=><option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
          </select>
        </div>
        <div><span style={PS.label}>Scan note</span><input style={PS.input} value={form.scanNote||""} onChange={e=>set("scanNote",e.target.value)}/></div>
      </div>
      <span style={PS.label}>Colour</span>
      <ColorPicker value={form.color||"#378ADD"} onChange={v=>set("color",v)}/>
      <div style={{ display:"flex", gap:8, marginTop:14 }}>
        <button style={PS.btnP} onClick={()=>onSave(form)}>Save</button>
        <button style={PS.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const PIPELINE_TABS = [
  {id:"stages",label:"Pipeline stages"},{id:"projects",label:"Projects"},
  {id:"split",label:"Split & branch"},{id:"settings",label:"Global settings"},
];

function PipelineTab() {
  const { t } = useLang();
  const [config,  setConfig]  = useState(null);
  const [ptab,    setPtab]    = useState("stages");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getAdminPipelineConfig().then(d=>{setConfig(d);setLoading(false);}).catch(()=>setLoading(false)); }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try { await saveAdminPipelineConfig(config); setMsg({type:"ok",text:`✅ Pipeline ${t("save")}d — changes are live immediately.`}); }
    catch { setMsg({type:"err",text:"❌ Save failed."}); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    if(!confirm("Reset pipeline to defaults?"))return;
    setSaving(true);
    const res = await resetPipelineConfig();
    setConfig(res.config); setSaving(false);
    setMsg({type:"ok",text:"✅ Reset to defaults."});
  }

  if (loading) return <Spin />;
  if (!config) return <div style={{ padding:32, color:"var(--err-text)" }}>Could not load pipeline config.</div>;

  return (
    <div style={{ maxWidth:900 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>Pipeline configurator</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Changes apply immediately after saving.</div>
        </div>
        <button className="btn" style={{ fontSize:12 }} onClick={handleReset}>↩ Reset defaults</button>
        <button className="btn btn-blue" style={{ padding:"10px 24px" }} onClick={save} disabled={saving}>
          {saving?"Saving…":`💾 ${t("save")} pipeline`}
        </button>
      </div>

      {msg && (
        <div style={{ padding:"12px 16px", borderRadius:8, marginBottom:14, fontSize:13,
          background:msg.type==="ok"?"var(--ok-bg)":"var(--err-bg)",
          border:`1px solid ${msg.type==="ok"?"var(--ok-border)":"var(--err-border)"}`,
          color:msg.type==="ok"?"var(--ok-text)":"var(--err-text)",
        }}>{msg.text}</div>
      )}

      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid var(--border)" }}>
        {PIPELINE_TABS.map(tb => (
          <button key={tb.id} onClick={()=>setPtab(tb.id)} style={{
            padding:"9px 18px", fontSize:12, fontWeight:600, cursor:"pointer",
            fontFamily:"inherit", border:"none", background:"none",
            color:ptab===tb.id?"var(--accent)":"var(--muted)",
            borderBottom:ptab===tb.id?"2px solid var(--accent)":"2px solid transparent",
            marginBottom:-1, transition:"color .15s",
          }}>{tb.label}</button>
        ))}
      </div>

      {ptab==="stages"   && <PipelineStagesTab   config={config} setConfig={setConfig}/>}
      {ptab==="projects" && <PipelineProjectsTab config={config} setConfig={setConfig}/>}
      {ptab==="split"    && <PipelineSplitBranchTab config={config} setConfig={setConfig}/>}
      {ptab==="settings" && (
        <div style={PS.card}>
          <div style={PS.secTitle}>Global tray defaults</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div>
              <span style={PS.label}>Tray ID prefix</span>
              <input style={PS.input} value={config.tray?.idPrefix||"TRY"}
                onChange={e=>setConfig(c=>({...c,tray:{...c.tray,idPrefix:e.target.value.toUpperCase()}}))}/>
              <div style={{ fontSize:11, color:"var(--muted)", marginTop:5 }}>IDs will look like TRY-001, TRY-002…</div>
            </div>
            <div>
              <span style={PS.label}>Default units per tray</span>
              <input type="number" min={1} style={PS.input} value={config.tray?.unitsPerTray||450}
                onChange={e=>setConfig(c=>({...c,tray:{...c.tray,unitsPerTray:Number(e.target.value)}}))}/>
              <div style={{ fontSize:11, color:"var(--muted)", marginTop:5 }}>Used when a project has no specific unit count.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export tab ─────────────────────────────────────────────────────────────────
function ExportTab() {
  const { t } = useLang();
  const [startDate,setStartDate]=useState(""), [endDate,setEndDate]=useState("");
  const [stage,setStage]=useState(""), [project,setProject]=useState("");

  const exports = [
    { label:`📄 Trays CSV`, color:"var(--accent-dk)", desc:"All tray records with optional filters.", action:()=>downloadTraysCSV({...(stage?{stage}:{}), ...(project?{project}:{}), ...(startDate?{start_date:startDate}:{}), ...(endDate?{end_date:endDate}:{})}) },
    { label:`📋 Scan Log CSV`, color:"#3B6D11", desc:"Full scan event history with timestamps.", action:downloadScanLogCSV },
    { label:`📊 Full Report XLSX`, color:"#7F77DD", desc:"3-sheet workbook: Trays, Scan Log, Stage Summary.", action:downloadReportXLSX },
  ];

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Filters (for Trays CSV)</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
          <Fld label={t("stage")}><input className="inp" placeholder="e.g. TESTING" value={stage} onChange={e=>setStage(e.target.value.toUpperCase())}/></Fld>
          <Fld label={t("project")}><input className="inp" placeholder="e.g. CD2_PRO" value={project} onChange={e=>setProject(e.target.value.toUpperCase())}/></Fld>
          <Fld label="Start Date"><input type="date" className="inp" value={startDate} onChange={e=>setStartDate(e.target.value)}/></Fld>
          <Fld label="End Date"><input type="date" className="inp" value={endDate} onChange={e=>setEndDate(e.target.value)}/></Fld>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14 }}>
        {exports.map(ex => (
          <div key={ex.label} style={{ ...card, borderTop:`3px solid ${ex.color}`, display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--text)", marginBottom:6 }}>{ex.label}</div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>{ex.desc}</div>
            </div>
            <button onClick={ex.action} className="btn btn-blue" style={{ background:ex.color, borderColor:ex.color }}>⬇ Download</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Audit log tab ──────────────────────────────────────────────────────────────
function AuditTab() {
  const { t } = useLang();
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit,   setLimit]   = useState(200);
  const [filter,  setFilter]  = useState("");

  function loadLogs(lim=limit) {
    setLoading(true);
    getAuditLog(lim).then(d=>{ setLogs(Array.isArray(d)?d:[]); setLoading(false); });
  }
  useEffect(()=>{loadLogs();},[]);

  function fmtDate(iso) {
    if(!iso)return"—";
    return new Date(iso).toLocaleString("en-GB",{dateStyle:"short",timeStyle:"medium"});
  }

  const filtered=logs.filter(l=>{
    if(!filter)return true;
    const q=filter.toLowerCase();
    return(l.username||"").toLowerCase().includes(q)||(l.action||"").toLowerCase().includes(q)||(l.details||"").toLowerCase().includes(q);
  });

  function downloadCSV() {
    const rows=[["Timestamp","User","Action","Details"],...filtered.map(l=>[fmtDate(l.timestamp),l.username||"",l.action||"",(l.details||"").replace(/,/g,";")])];
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`audit_log_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const actionTag=(action)=>{
    if(["DELETE_TRAY","DELETE_USER","BULK_DELETE_TRAYS"].includes(action))return"tag-red";
    if(["LOGIN","REGISTER"].includes(action))return"tag-blue";
    if(action?.startsWith("UPDATE")||action?.startsWith("SAVE")||action?.startsWith("RESET"))return"tag-amber";
    if(action==="SCAN")return"tag-green";
    return"tag-gray";
  };

  return (
    <div>
      <div style={{...card,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{ flex:2, minWidth:180 }} placeholder={`${t("search")} user, action…`} value={filter} onChange={e=>setFilter(e.target.value)}/>
        <select className="inp" style={{ width:"auto",flex:"none" }} value={limit}
          onChange={e=>{setLimit(+e.target.value);loadLogs(+e.target.value);}}>
          <option value={100}>Last 100</option><option value={200}>Last 200</option>
          <option value={500}>Last 500</option><option value={1000}>Last 1000</option>
        </select>
        <button className="btn" onClick={()=>loadLogs()}>↻ {t("refresh")}</button>
        <button className="btn btn-blue" onClick={downloadCSV} disabled={filtered.length===0}>⬇ {t("export")}</button>
      </div>
      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:8 }}>{filtered.length} entries{filter?" (filtered)":""}</div>
      <div style={{...card,padding:0,overflow:"hidden"}}>
        {loading?<Spin/>:filtered.length===0?(
          <div style={{ padding:32, textAlign:"center", color:"var(--muted)" }}>No audit log entries found.</div>
        ):(
          <div style={{ overflowX:"auto" }}>
            <table className="tbl">
              <thead><tr><th>Timestamp</th><th>{t("users")}</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {filtered.map((l,i)=>(
                  <tr key={i}>
                    <td style={{ fontSize:12, color:"var(--muted)", whiteSpace:"nowrap" }}>{fmtDate(l.timestamp)}</td>
                    <td><span style={{ fontFamily:"monospace", fontSize:12 }}>{l.username}</span></td>
                    <td><span className={`tag ${actionTag(l.action)}`}>{l.action}</span></td>
                    <td style={{ fontSize:12, color:"var(--muted)", maxWidth:300 }}>{l.details||"—"}</td>
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

// ── Shared helpers ─────────────────────────────────────────────────────────────
function Spin() { return <div style={{ padding:32, color:"var(--muted)", textAlign:"center" }}><span className="spin"/> Loading…</div>; }
function Grid({ children }) { return <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{children}</div>; }
function Fld({ label, children }) { return <div style={{ display:"flex", flexDirection:"column", gap:5 }}><div style={lbl}>{label}</div>{children}</div>; }
function EToggle({ value, onChange }) {
  return (
    <select className="inp" value={value?"1":"0"} onChange={e=>onChange(e.target.value==="1")}>
      <option value="1">Enabled</option><option value="0">Disabled</option>
    </select>
  );
}

// ── Styles — all CSS variables ─────────────────────────────────────────────────
const card      = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:16, marginBottom:0 };
const cardTitle = { fontSize:12, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:14 };
const lbl       = { fontSize:11, color:"var(--muted)", fontWeight:600 };


const btnBlue   = { padding:"9px 18px", background:"#185FA5", color:"#E6F1FB", border:"1px solid #185FA5", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };
const btnGray   = { padding:"9px 16px", background:"#162032", color:"#E8EFF8", border:"1px solid #1E2D42", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" };
const btnSm     = { padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontFamily:"inherit", background:"#162032", color:"#E8EFF8", border:"1px solid #1E2D42" };
const errBox    = { background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)", borderRadius:8, padding:12, color:"#F09595", fontSize:13, marginBottom:12 };
const okBox     = { background:"rgba(59,109,17,.2)", border:"1px solid rgba(59,109,17,.4)", borderRadius:8, padding:12, color:"#97C459", fontSize:13, marginBottom:12 };