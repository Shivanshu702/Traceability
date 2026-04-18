import { useState, useEffect } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

// Developer API helper — uses X-Dev-Key header instead of Bearer token
async function devReq(method, path, devKey, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "X-Dev-Key": devKey },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

export default function DevPage() {
  const [devKey,   setDevKey]   = useState(localStorage.getItem("devKey") || "");
  const [authed,   setAuthed]   = useState(false);
  const [users,    setUsers]    = useState([]);
  const [tenants,  setTenants]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [msg,      setMsg]      = useState("");
  const [tab,      setTab]      = useState("users");
  const [filter,   setFilter]   = useState("");

  // Edit state
  const [editUser,    setEditUser]    = useState(null);
  const [editRole,    setEditRole]    = useState("");
  const [editPw,      setEditPw]      = useState("");
  const [editMsg,     setEditMsg]     = useState("");

  async function authenticate() {
    if (!devKey.trim()) { setError("Enter the developer key."); return; }
    setLoading(true); setError("");
    try {
      const res = await devReq("GET", "/dev/tenants", devKey.trim());
      if (res.detail || res.error) {
        setError("Invalid developer key or key not configured on the server.");
        return;
      }
      localStorage.setItem("devKey", devKey.trim());
      setTenants(res);
      setAuthed(true);
      loadUsers(devKey.trim());
    } catch { setError("Cannot reach server."); }
    finally   { setLoading(false); }
  }

  async function loadUsers(key = devKey) {
    setLoading(true); setMsg(""); setError("");
    try {
      const res = await devReq("GET", "/dev/users", key);
      if (Array.isArray(res)) setUsers(res);
      else setError("Failed to load users.");
    } catch { setError("Server error."); }
    finally   { setLoading(false); }
  }

  async function loadTenants(key = devKey) {
    const res = await devReq("GET", "/dev/tenants", key);
    if (Array.isArray(res)) setTenants(res);
  }

  async function handleSave() {
    if (!editUser) return;
    setEditMsg(""); let ok = true;

    if (editRole && editRole !== editUser.role) {
      const res = await devReq("PUT", `/dev/users/${editUser.id}/role`, devKey, { role: editRole });
      if (!res.ok) { setEditMsg("Failed to update role"); ok = false; }
    }
    if (editPw && editPw.length >= 6) {
      const res = await devReq("PUT", `/dev/users/${editUser.id}/password`, devKey, { password: editPw });
      if (!res.ok) { setEditMsg("Failed to update password"); ok = false; }
    }
    if (editPw && editPw.length > 0 && editPw.length < 6) {
      setEditMsg("Password must be at least 6 characters"); return;
    }

    if (ok) {
      setEditMsg("✅ User updated");
      setEditPw("");
      loadUsers();
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Permanently delete user "${user.username}" (${user.tenant_id})? This cannot be undone.`)) return;
    const res = await devReq("DELETE", `/dev/users/${user.id}`, devKey);
    if (res.ok) {
      setMsg(`✅ Deleted user "${user.username}"`);
      setEditUser(null);
      loadUsers();
      loadTenants();
    } else {
      setError("Delete failed.");
    }
  }

  function logout() {
    localStorage.removeItem("devKey");
    setAuthed(false); setDevKey(""); setUsers([]); setTenants([]);
    setEditUser(null); setError(""); setMsg("");
  }

  const filtered = users.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return u.username.toLowerCase().includes(q) ||
           u.tenant_id.toLowerCase().includes(q) ||
           u.role.toLowerCase().includes(q);
  });

  // ── Key auth screen ───────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0A0F1A",
      }}>
        <div style={{
          background:"#162032", border:"1px solid #7F77DD44",
          borderTop:"3px solid #7F77DD",
          borderRadius:14, padding:36, width:"100%", maxWidth:400,
        }}>
          <h2 style={{ color:"#E8EFF8", marginBottom:6, fontWeight:700 }}>
            Developer Panel
          </h2>
          <p style={{ fontSize:12, color:"#6B7E95", marginBottom:24 }}>
            Enter the <code style={{ color:"#7F77DD" }}>DEV_KEY</code> environment variable
            value to access cross-tenant user management.
          </p>
          <label style={{ fontSize:12, color:"#6B7E95", display:"block", marginBottom:5 }}>
            Developer Key
          </label>
          <input
            type="password"
            style={inp}
            placeholder="Enter DEV_KEY"
            value={devKey}
            onChange={e => setDevKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && authenticate()}
          />
          {error && (
            <div style={{ ...errBox, marginTop:12 }}>{error}</div>
          )}
          <button
            onClick={authenticate}
            disabled={loading}
            style={{
              width:"100%", padding:14, marginTop:16, background:"#7F77DD",
              color:"#EEEDFE", border:"none", borderRadius:10,
              fontSize:15, fontWeight:700, cursor:loading ? "not-allowed" : "pointer",
              opacity:loading ? 0.6 : 1,
            }}>
            {loading ? "Authenticating…" : "Access Developer Panel"}
          </button>
          <p style={{ marginTop:16, fontSize:11, color:"#6B7E95", textAlign:"center" }}>
            This panel is for developers only. Not accessible to regular users.
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
      }}>
        <span style={{ fontSize:15, fontWeight:700, color:"#7F77DD" }}>
          ⚙ Developer Panel
        </span>
        <span style={{
          background:"#7F77DD22", color:"#7F77DD",
          border:"1px solid #7F77DD44", borderRadius:6,
          padding:"2px 10px", fontSize:11, fontWeight:600,
        }}>
          DEVELOPER MODE
        </span>
        <span style={{ fontSize:12, color:"#6B7E95", marginLeft:4 }}>
          {users.length} users · {tenants.length} organisations
        </span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button style={btnGray} onClick={() => { loadUsers(); loadTenants(); }}>
            ↻ Refresh
          </button>
          <button style={{ ...btnGray, color:"#F09595", borderColor:"#7A1F1F" }} onClick={logout}>
            Exit Dev Mode
          </button>
        </div>
      </div>

      <div style={{ display:"flex", minHeight:"calc(100vh - 57px)" }}>
        {/* Sidebar */}
        <div style={{
          width:220, background:"#111827",
          borderRight:"1px solid #1E2D42", padding:16, flexShrink:0,
        }}>
          {/* Tab nav */}
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
              color:       tab === t.key ? "#7F77DD"   : "#6B7E95",
              fontWeight:  tab === t.key ? 700 : 400,
            }}>
              {t.label}
            </button>
          ))}

          {/* Tenant summary */}
          <div style={{ marginTop:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#6B7E95",
                          textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>
              Organisations
            </div>
            {tenants.map(t => (
              <div key={t.tenant_id} style={{
                padding:"8px 10px", borderRadius:6, marginBottom:4,
                background:"#162032", border:"1px solid #1E2D42",
                cursor:"pointer",
              }}
                onClick={() => { setTab("users"); setFilter(t.tenant_id); }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#E8EFF8" }}>
                  {t.tenant_id}
                </div>
                <div style={{ fontSize:10, color:"#6B7E95" }}>
                  {t.user_count} users · {t.tray_count} trays
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex:1, padding:24, overflowY:"auto" }}>
          {msg   && <div style={{ ...okBox,  marginBottom:12 }}>{msg}</div>}
          {error && <div style={{ ...errBox, marginBottom:12 }}>{error}</div>}

          {/* ── Users tab ── */}
          {tab === "users" && (
            <div style={{ display:"flex", gap:16, height:"100%" }}>
              {/* User list */}
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
                  <h3 style={{ color:"#E8EFF8", margin:0, fontSize:16 }}>
                    All Users ({filtered.length})
                  </h3>
                  <input style={{ ...inp, flex:1, maxWidth:280 }}
                    placeholder="Search username, org, role…"
                    value={filter} onChange={e => setFilter(e.target.value)} />
                  {filter && (
                    <button style={btnGray} onClick={() => setFilter("")}>Clear</button>
                  )}
                </div>

                {loading ? (
                  <div style={{ color:"#6B7E95", padding:32, textAlign:"center" }}>
                    <span className="spin"/> Loading…
                  </div>
                ) : (
                  <div style={{
                    background:"#111827", border:"1px solid #1E2D42",
                    borderRadius:10, overflow:"hidden",
                  }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#162032" }}>
                          <th style={th}>ID</th>
                          <th style={th}>Organisation</th>
                          <th style={th}>Username</th>
                          <th style={th}>Role</th>
                          <th style={th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(u => (
                          <tr key={u.id}
                            style={{
                              borderBottom:"1px solid #1E2D42",
                              background: editUser?.id === u.id ? "#162032" : "transparent",
                            }}>
                            <td style={td}>
                              <span style={{ color:"#6B7E95", fontFamily:"monospace" }}>
                                #{u.id}
                              </span>
                            </td>
                            <td style={td}>
                              <span style={{
                                background:"#7F77DD18", color:"#7F77DD",
                                border:"1px solid #7F77DD33",
                                borderRadius:4, padding:"1px 7px", fontSize:11,
                              }}>
                                {u.tenant_id}
                              </span>
                            </td>
                            <td style={td}>
                              <span style={{ fontFamily:"monospace", fontWeight:600,
                                             color:"#E8EFF8" }}>
                                {u.username}
                              </span>
                            </td>
                            <td style={td}>
                              <span style={{
                                background: u.role === "admin" ? "#E24B4A18" : "#378ADD18",
                                color:      u.role === "admin" ? "#E24B4A"   : "#85B7EB",
                                border:`1px solid ${u.role === "admin" ? "#E24B4A33" : "#378ADD33"}`,
                                borderRadius:4, padding:"1px 7px", fontSize:11, fontWeight:600,
                              }}>
                                {u.role}
                              </span>
                            </td>
                            <td style={td}>
                              <div style={{ display:"flex", gap:6 }}>
                                <button
                                  style={{ ...btnSm, borderColor:"#7F77DD44", color:"#7F77DD" }}
                                  onClick={() => {
                                    setEditUser(u); setEditRole(u.role);
                                    setEditPw(""); setEditMsg("");
                                  }}>
                                  ✏ Edit
                                </button>
                                <button
                                  style={{ ...btnSm, background:"#7A1F1F22",
                                           borderColor:"#7A1F1F", color:"#F09595" }}
                                  onClick={() => handleDelete(u)}>
                                  🗑 Delete
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
                  width:300, background:"#111827",
                  border:"1px solid #7F77DD44",
                  borderTop:"3px solid #7F77DD",
                  borderRadius:12, padding:20, flexShrink:0, alignSelf:"flex-start",
                }}>
                  <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#E8EFF8" }}>
                        Edit User
                      </div>
                      <div style={{ fontSize:11, color:"#6B7E95", marginTop:2 }}>
                        {editUser.username} · {editUser.tenant_id}
                      </div>
                    </div>
                    <button style={{ background:"none", border:"none",
                                     cursor:"pointer", color:"#6B7E95", fontSize:18 }}
                      onClick={() => setEditUser(null)}>×</button>
                  </div>

                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color:"#6B7E95", marginBottom:5 }}>Role</div>
                    <input style={inp} value={editRole}
                      onChange={e => setEditRole(e.target.value)} />
                    <div style={{ fontSize:10, color:"#6B7E95", marginTop:4 }}>
                      e.g. admin, operator, supervisor
                    </div>
                  </div>

                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:"#6B7E95", marginBottom:5 }}>
                      New Password (leave blank to keep)
                    </div>
                    <input type="password" style={inp}
                      placeholder="Min 6 characters"
                      value={editPw} onChange={e => setEditPw(e.target.value)} />
                  </div>

                  {editMsg && (
                    <div style={editMsg.includes("✅") ? okBox : errBox}>
                      {editMsg}
                    </div>
                  )}

                  <div style={{ display:"flex", gap:8, marginTop:4 }}>
                    <button style={{
                      flex:1, padding:"9px 0", background:"#7F77DD",
                      color:"#EEEDFE", border:"none", borderRadius:8,
                      fontSize:13, fontWeight:700, cursor:"pointer",
                    }} onClick={handleSave}>
                      💾 Save
                    </button>
                    <button style={{ ...btnGray, flex:"none" }}
                      onClick={() => { setEditUser(null); setEditMsg(""); }}>
                      Cancel
                    </button>
                  </div>

                  <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #1E2D42" }}>
                    <button style={{
                      width:"100%", padding:"8px 0", background:"#7A1F1F22",
                      color:"#F09595", border:"1px solid #7A1F1F",
                      borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                    }} onClick={() => handleDelete(editUser)}>
                      🗑 Delete This User
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tenants tab ── */}
          {tab === "tenants" && (
            <div>
              <h3 style={{ color:"#E8EFF8", marginBottom:16, fontSize:16 }}>
                Organisations ({tenants.length})
              </h3>
              <div style={{
                display:"grid",
                gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))",
                gap:14,
              }}>
                {tenants.map(t => (
                  <div key={t.tenant_id} style={{
                    background:"#111827", border:"1px solid #1E2D42",
                    borderTop:"3px solid #7F77DD", borderRadius:10, padding:18,
                  }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#7F77DD",
                                  marginBottom:12, fontFamily:"monospace" }}>
                      {t.tenant_id}
                    </div>
                    <div style={{ display:"flex", gap:20 }}>
                      <div>
                        <div style={{ fontSize:24, fontWeight:700, color:"#E8EFF8" }}>
                          {t.user_count}
                        </div>
                        <div style={{ fontSize:10, color:"#6B7E95" }}>users</div>
                      </div>
                      <div>
                        <div style={{ fontSize:24, fontWeight:700, color:"#85B7EB" }}>
                          {t.tray_count}
                        </div>
                        <div style={{ fontSize:10, color:"#6B7E95" }}>trays</div>
                      </div>
                    </div>
                    <button style={{ ...btnGray, marginTop:14, width:"100%", fontSize:12 }}
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
const inp    = { width:"100%", padding:"9px 12px", background:"#0A0F1A",
                 border:"1px solid #1E2D42", borderRadius:7, color:"#E8EFF8",
                 fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
const btnGray= { padding:"8px 14px", background:"#162032", color:"#E8EFF8",
                 border:"1px solid #1E2D42", borderRadius:8, fontSize:12,
                 cursor:"pointer", fontFamily:"inherit" };
const btnSm  = { padding:"4px 10px", borderRadius:6, fontSize:11,
                 cursor:"pointer", fontFamily:"inherit", background:"transparent",
                 border:"1px solid #1E2D42", color:"#6B7E95" };
const errBox = { background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)",
                 borderRadius:8, padding:10, color:"#F09595", fontSize:12 };
const okBox  = { background:"rgba(59,109,17,.2)", border:"1px solid rgba(59,109,17,.4)",
                 borderRadius:8, padding:10, color:"#97C459", fontSize:12 };
const th     = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700,
                 color:"#6B7E95", textTransform:"uppercase", letterSpacing:".04em" };
const td     = { padding:"9px 12px", verticalAlign:"middle" };