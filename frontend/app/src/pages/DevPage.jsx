import { useState, useEffect } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

// All dev requests send the key in the JSON body to avoid CORS header issues
async function devReq(path, devKey, extra = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ dev_key: devKey, ...extra }),
  });
  return res.json();
}

export default function DevPage() {
  const [devKey,  setDevKey]  = useState(localStorage.getItem("devKey") || "");
  const [authed,  setAuthed]  = useState(false);
  const [users,   setUsers]   = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [msg,     setMsg]     = useState("");
  const [tab,     setTab]     = useState("users");
  const [filter,  setFilter]  = useState("");

  // Edit state
  const [editUser, setEditUser] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [editPw,   setEditPw]   = useState("");
  const [editMsg,  setEditMsg]  = useState("");

  async function authenticate() {
    const key = devKey.trim();
    if (!key) { setError("Enter the developer key."); return; }
    setLoading(true); setError("");
    try {
      const res = await devReq("/dev/auth", key);
      if (!res.ok) {
        setError(res.detail || "Invalid developer key. Check the DEV_KEY value on Render.");
        return;
      }
      localStorage.setItem("devKey", key);
      setAuthed(true);
      await Promise.all([loadUsers(key), loadTenants(key)]);
    } catch {
      setError("Cannot reach server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers(key = devKey) {
    setLoading(true);
    try {
      const res = await devReq("/dev/users", key);
      if (Array.isArray(res)) { setUsers(res); setError(""); }
      else setError(res.detail || "Failed to load users.");
    } catch { setError("Server error."); }
    finally { setLoading(false); }
  }

  async function loadTenants(key = devKey) {
    try {
      const res = await devReq("/dev/tenants", key);
      if (Array.isArray(res)) setTenants(res);
    } catch {}
  }

  async function handleSave() {
    if (!editUser) return;
    setEditMsg(""); let ok = true;

    if (editRole.trim() && editRole.trim() !== editUser.role) {
      const res = await devReq(`/dev/users/${editUser.id}/role`, devKey, { role: editRole.trim() });
      if (!res.ok) { setEditMsg("Failed to update role"); ok = false; }
    }
    if (editPw) {
      if (editPw.length < 6) { setEditMsg("Password must be at least 6 characters"); return; }
      const res = await devReq(`/dev/users/${editUser.id}/password`, devKey, { password: editPw });
      if (!res.ok) { setEditMsg("Failed to update password"); ok = false; }
    }
    if (ok) {
      setEditMsg("✅ Saved");
      setEditPw("");
      loadUsers();
      setEditUser(prev => prev ? { ...prev, role: editRole.trim() || prev.role } : null);
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Delete user "${user.username}" (org: ${user.tenant_id})?\nThis cannot be undone.`)) return;
    const res = await devReq(`/dev/users/${user.id}/delete`, devKey);
    if (res.ok) {
      setMsg(`✅ Deleted "${user.username}"`);
      setEditUser(null); setEditMsg("");
      loadUsers(); loadTenants();
    } else {
      setError(res.detail || "Delete failed.");
    }
  }

  function logout() {
    localStorage.removeItem("devKey");
    setAuthed(false); setDevKey(""); setUsers([]);
    setTenants([]); setEditUser(null); setError(""); setMsg("");
  }

  const filtered = users.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return u.username.toLowerCase().includes(q) ||
           u.tenant_id.toLowerCase().includes(q) ||
           u.role.toLowerCase().includes(q);
  });

  // ── Key auth screen ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0A0F1A",
      }}>
        <div style={{
          background:"#162032", border:"1px solid #7F77DD44",
          borderTop:"3px solid #7F77DD", borderRadius:14,
          padding:36, width:"100%", maxWidth:420,
        }}>
          <h2 style={{ color:"#E8EFF8", marginBottom:6, fontWeight:700 }}>
            Developer Panel
          </h2>
          <p style={{ fontSize:12, color:"#6B7E95", marginBottom:24, lineHeight:1.6 }}>
            Enter the <code style={{ color:"#7F77DD", background:"#1E2D42",
              padding:"1px 5px", borderRadius:3 }}>DEV_KEY</code> value from
            your Render environment variables.
          </p>
          <label style={{ fontSize:12, color:"#6B7E95", display:"block", marginBottom:5 }}>
            Developer Key
          </label>
          <input
            type="password"
            style={inp}
            placeholder="Paste your DEV_KEY here"
            value={devKey}
            onChange={e => setDevKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && authenticate()}
            autoFocus
          />
          {error && <div style={{ ...errBox, marginTop:14 }}>{error}</div>}
          <button
            onClick={authenticate}
            disabled={loading}
            style={{
              width:"100%", padding:14, marginTop:16,
              background: loading ? "#3C3489" : "#7F77DD",
              color:"#EEEDFE", border:"none", borderRadius:10,
              fontSize:15, fontWeight:700,
              cursor:loading ? "not-allowed" : "pointer",
            }}>
            {loading ? "Verifying…" : "Access Developer Panel"}
          </button>
          <div style={{
            marginTop:20, background:"rgba(127,119,221,.08)",
            border:"1px solid rgba(127,119,221,.2)",
            borderRadius:8, padding:"10px 14px", fontSize:11, color:"#AFA9EC",
            lineHeight:1.6,
          }}>
            <strong>Troubleshooting:</strong> If you keep getting "Invalid key",
            go to Render → your backend service → Environment, find <code>DEV_KEY</code>,
            click the eye icon to reveal it, then copy-paste it exactly here.
            Spaces at the start or end will cause failure.
          </div>
          <p style={{ marginTop:16, fontSize:11, color:"#6B7E95", textAlign:"center" }}>
            <a href="/" style={{ color:"#6B7E95" }}>← Back to app</a>
          </p>
        </div>
      </div>
    );
  }

  // ── Developer panel ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#0A0F1A" }}>
      {/* Header */}
      <div style={{
        background:"#111827", borderBottom:"1px solid #1E2D42",
        padding:"12px 24px", display:"flex", alignItems:"center", gap:12,
        flexWrap:"wrap",
      }}>
        <span style={{ fontSize:15, fontWeight:700, color:"#7F77DD" }}>
          ⚙ Developer Panel
        </span>
        <span style={{
          background:"#7F77DD22", color:"#7F77DD",
          border:"1px solid #7F77DD44",
          borderRadius:6, padding:"2px 10px", fontSize:11, fontWeight:600,
        }}>
          DEVELOPER MODE
        </span>
        <span style={{ fontSize:12, color:"#6B7E95" }}>
          {users.length} users · {tenants.length} orgs
        </span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button style={btnGray} onClick={() => { loadUsers(); loadTenants(); setMsg(""); }}>
            ↻ Refresh
          </button>
          <button
            style={{ ...btnGray, color:"#F09595", borderColor:"#7A1F1F44" }}
            onClick={logout}>
            Exit Dev Mode
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:"flex", minHeight:"calc(100vh - 57px)" }}>
        {/* Sidebar */}
        <div style={{
          width:220, background:"#111827",
          borderRight:"1px solid #1E2D42",
          padding:16, flexShrink:0,
        }}>
          {[
            { key:"users",   label:"👥 All Users" },
            { key:"tenants", label:"🏢 Organisations" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              width:"100%", padding:"9px 12px", borderRadius:8,
              textAlign:"left", marginBottom:4, border:"1px solid",
              fontSize:13, cursor:"pointer", fontFamily:"inherit",
              background:  tab === t.key ? "#7F77DD22" : "transparent",
              borderColor: tab === t.key ? "#7F77DD"   : "transparent",
              color:       tab === t.key ? "#AFA9EC"   : "#6B7E95",
              fontWeight:  tab === t.key ? 700 : 400,
            }}>
              {t.label}
            </button>
          ))}

          <div style={{ marginTop:20 }}>
            <div style={{
              fontSize:10, fontWeight:700, color:"#6B7E95",
              textTransform:"uppercase", letterSpacing:".06em", marginBottom:10,
            }}>
              Quick Filter by Org
            </div>
            {tenants.map(t => (
              <div key={t.tenant_id}
                onClick={() => { setTab("users"); setFilter(t.tenant_id); }}
                style={{
                  padding:"8px 10px", borderRadius:6, marginBottom:4,
                  background: filter === t.tenant_id ? "#7F77DD22" : "#162032",
                  border: `1px solid ${filter === t.tenant_id ? "#7F77DD44" : "#1E2D42"}`,
                  cursor:"pointer",
                }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#E8EFF8" }}>
                  {t.tenant_id}
                </div>
                <div style={{ fontSize:10, color:"#6B7E95", marginTop:2 }}>
                  {t.user_count} users · {t.tray_count} trays
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex:1, padding:24, overflowY:"auto" }}>
          {msg   && <div style={{ ...okBox,  marginBottom:14 }}>{msg} <span style={{ cursor:"pointer", float:"right" }} onClick={() => setMsg("")}>×</span></div>}
          {error && <div style={{ ...errBox, marginBottom:14 }}>{error} <span style={{ cursor:"pointer", float:"right" }} onClick={() => setError("")}>×</span></div>}

          {/* Users tab */}
          {tab === "users" && (
            <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
              {/* List */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
                  <h3 style={{ color:"#E8EFF8", margin:0, fontSize:15 }}>
                    All Users ({filtered.length}{filter ? " filtered" : ""})
                  </h3>
                  <input style={{ ...inp, flex:1, minWidth:160, maxWidth:280 }}
                    placeholder="Search username, org, role…"
                    value={filter} onChange={e => setFilter(e.target.value)} />
                  {filter && (
                    <button style={btnGray} onClick={() => setFilter("")}>✕ Clear</button>
                  )}
                </div>

                {loading ? (
                  <div style={{ color:"#6B7E95", padding:32, textAlign:"center" }}>
                    <span className="spin"/> Loading users…
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ color:"#6B7E95", padding:32, textAlign:"center" }}>
                    No users found.
                  </div>
                ) : (
                  <div style={{
                    background:"#111827", border:"1px solid #1E2D42",
                    borderRadius:10, overflow:"hidden",
                  }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#162032" }}>
                          {["ID","Organisation","Username","Role","Actions"].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(u => (
                          <tr key={u.id} style={{
                            borderBottom:"1px solid #1E2D42",
                            background: editUser?.id === u.id ? "#162032" : "transparent",
                          }}>
                            <td style={tdStyle}>
                              <span style={{ fontFamily:"monospace", color:"#6B7E95" }}>
                                #{u.id}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                background:"#7F77DD18", color:"#7F77DD",
                                border:"1px solid #7F77DD33",
                                borderRadius:4, padding:"2px 8px", fontSize:11,
                              }}>
                                {u.tenant_id}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#E8EFF8" }}>
                                {u.username}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                background: u.role === "admin" ? "#E24B4A18" : "#378ADD18",
                                color:      u.role === "admin" ? "#E24B4A"   : "#85B7EB",
                                border:`1px solid ${u.role === "admin" ? "#E24B4A33" : "#378ADD33"}`,
                                borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600,
                              }}>
                                {u.role}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display:"flex", gap:6 }}>
                                <button style={{ ...btnSm, color:"#AFA9EC", borderColor:"#7F77DD44" }}
                                  onClick={() => {
                                    setEditUser(u); setEditRole(u.role);
                                    setEditPw(""); setEditMsg("");
                                  }}>
                                  ✏ Edit
                                </button>
                                <button style={{ ...btnSm, color:"#F09595", borderColor:"#7A1F1F44",
                                                background:"#7A1F1F18" }}
                                  onClick={() => handleDelete(u)}>
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Edit panel */}
              {editUser && (
                <div style={{
                  width:280, background:"#111827",
                  border:"1px solid #7F77DD44",
                  borderTop:"3px solid #7F77DD",
                  borderRadius:12, padding:18,
                  flexShrink:0, alignSelf:"flex-start",
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", marginBottom:18 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#E8EFF8" }}>
                        Edit User
                      </div>
                      <div style={{ fontSize:11, color:"#AFA9EC", marginTop:3 }}>
                        {editUser.username}
                      </div>
                      <div style={{ fontSize:10, color:"#6B7E95" }}>
                        org: {editUser.tenant_id}
                      </div>
                    </div>
                    <button onClick={() => { setEditUser(null); setEditMsg(""); }}
                      style={{ background:"none", border:"none",
                               cursor:"pointer", color:"#6B7E95", fontSize:20, lineHeight:1 }}>
                      ×
                    </button>
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:"#6B7E95", marginBottom:5 }}>Role</div>
                    <input style={inp} value={editRole}
                      onChange={e => setEditRole(e.target.value)} />
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color:"#6B7E95", marginBottom:5 }}>
                      New Password <span style={{ color:"#4A5568" }}>(leave blank to keep)</span>
                    </div>
                    <input type="password" style={inp}
                      placeholder="Min 6 chars"
                      value={editPw} onChange={e => setEditPw(e.target.value)} />
                  </div>

                  {editMsg && (
                    <div style={editMsg.includes("✅") ? { ...okBox, marginBottom:12 } : { ...errBox, marginBottom:12 }}>
                      {editMsg}
                    </div>
                  )}

                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={handleSave} style={{
                      flex:1, padding:"9px 0", background:"#7F77DD",
                      color:"#EEEDFE", border:"none", borderRadius:8,
                      fontSize:13, fontWeight:700, cursor:"pointer",
                    }}>
                      💾 Save
                    </button>
                    <button onClick={() => { setEditUser(null); setEditMsg(""); }}
                      style={btnGray}>
                      Cancel
                    </button>
                  </div>

                  <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #1E2D42" }}>
                    <button onClick={() => handleDelete(editUser)} style={{
                      width:"100%", padding:"8px 0",
                      background:"#7A1F1F22", color:"#F09595",
                      border:"1px solid #7A1F1F55", borderRadius:8,
                      fontSize:12, cursor:"pointer", fontFamily:"inherit",
                    }}>
                      🗑 Delete This User
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tenants tab */}
          {tab === "tenants" && (
            <div>
              <h3 style={{ color:"#E8EFF8", marginBottom:16, fontSize:15 }}>
                Organisations ({tenants.length})
              </h3>
              <div style={{
                display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",
                gap:14,
              }}>
                {tenants.map(t => (
                  <div key={t.tenant_id} style={{
                    background:"#111827", border:"1px solid #1E2D42",
                    borderTop:"3px solid #7F77DD", borderRadius:10, padding:18,
                  }}>
                    <div style={{
                      fontSize:14, fontWeight:700, color:"#AFA9EC",
                      marginBottom:12, fontFamily:"monospace",
                    }}>
                      {t.tenant_id}
                    </div>
                    <div style={{ display:"flex", gap:20, marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:26, fontWeight:700, color:"#E8EFF8" }}>
                          {t.user_count}
                        </div>
                        <div style={{ fontSize:10, color:"#6B7E95" }}>users</div>
                      </div>
                      <div>
                        <div style={{ fontSize:26, fontWeight:700, color:"#85B7EB" }}>
                          {t.tray_count}
                        </div>
                        <div style={{ fontSize:10, color:"#6B7E95" }}>trays</div>
                      </div>
                    </div>
                    <button style={{ ...btnGray, width:"100%", fontSize:12 }}
                      onClick={() => { setTab("users"); setFilter(t.tenant_id); }}>
                      View Users →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inp     = { width:"100%", padding:"9px 12px", background:"#0A0F1A",
                  border:"1px solid #1E2D42", borderRadius:7, color:"#E8EFF8",
                  fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
const btnGray = { padding:"8px 14px", background:"#162032", color:"#E8EFF8",
                  border:"1px solid #1E2D42", borderRadius:8, fontSize:12,
                  cursor:"pointer", fontFamily:"inherit" };
const btnSm   = { padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer",
                  fontFamily:"inherit", background:"transparent", border:"1px solid #1E2D42",
                  color:"#6B7E95" };
const errBox  = { background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)",
                  borderRadius:8, padding:"10px 12px", color:"#F09595", fontSize:12 };
const okBox   = { background:"rgba(59,109,17,.2)", border:"1px solid rgba(59,109,17,.4)",
                  borderRadius:8, padding:"10px 12px", color:"#97C459", fontSize:12 };
const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700,
                  color:"#6B7E95", textTransform:"uppercase", letterSpacing:".04em" };
const tdStyle = { padding:"9px 12px", verticalAlign:"middle" };