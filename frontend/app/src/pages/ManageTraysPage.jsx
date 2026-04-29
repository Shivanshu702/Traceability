import { useState, useEffect } from "react";
import { getAllTrays, getPipeline, bulkDeleteTrays, deleteTray } from "../api/api";
import { useLang } from "../context/LangContext";

export default function ManageTraysPage() {
  const { t } = useLang();

  const [trays,        setTrays]        = useState([]);
  const [pipeline,     setPipeline]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState(new Set());
  const [filterStage,  setFilterStage]  = useState("");
  const [filterProj,   setFilterProj]   = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [deleting,     setDeleting]     = useState(false);
  const [msg,          setMsg]          = useState("");
  const [error,        setError]        = useState("");
  const [confirmOpen,  setConfirmOpen]  = useState(false);

  async function load() {
    setLoading(true); setMsg(""); setError("");
    const [tr, p] = await Promise.all([getAllTrays(), getPipeline()]);
    setTrays(Array.isArray(tr) ? tr : []);
    setPipeline(p);
    setSelected(new Set());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = trays.filter(tr => {
    if (filterStage  && tr.stage   !== filterStage)                        return false;
    if (filterProj   && tr.project !== filterProj)                         return false;
    if (filterSearch && !tr.id.includes(filterSearch.toUpperCase()) &&
        !tr.batch_no?.includes(filterSearch))                              return false;
    return true;
  });

  function toggleOne(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)));
  }
  function selectByStage(stageId) {
    setSelected(new Set(filtered.filter(t => t.stage === stageId).map(t => t.id)));
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setDeleting(true); setMsg(""); setError(""); setConfirmOpen(false);
    try {
      const res = await bulkDeleteTrays([...selected]);
      if (res.ok) { setMsg(`✅ ${t("delete")}d ${res.deleted} tray${res.deleted !== 1 ? "s" : ""} successfully.`); await load(); }
      else setError("Delete failed — check your permissions.");
    } catch { setError(t("cannotReachServer")); }
    finally  { setDeleting(false); }
  }

  async function handleDeleteOne(id) {
    if (!confirm(`Delete tray "${id}" and all its scan history? This cannot be undone.`)) return;
    setDeleting(true); setMsg(""); setError("");
    try {
      const res = await deleteTray(id);
      if (res.ok) { setMsg(`✅ Tray ${id} deleted.`); await load(); }
      else setError(res.detail || "Delete failed.");
    } catch { setError(t("cannotReachServer")); }
    finally  { setDeleting(false); }
  }

  const selectedUnits = filtered.filter(t => selected.has(t.id)).reduce((s, t) => s + (t.total_units || 0), 0);
  const allStages     = [...new Set(trays.map(t => t.stage))].sort();
  const allProjects   = pipeline?.projects?.map(p => p.id) || [];

  function stageColor(stage) {
    const c = {
      CREATED:"#888780", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
      BAT_MOUNT:"#EF9F27", BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
      RACK3:"#D4537E", DEPANEL_IN:"#BA7517", TESTING:"#185FA5",
      COMPLETE:"#3B6D11", SPLIT:"#FAC775",
    };
    return c[stage] || "#888780";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", { dateStyle:"short", timeStyle:"short" });
  }

  return (
    <div style={{ maxWidth:1100, margin:"0 auto" }}>
      <h2 style={{ color:"var(--text)", marginBottom:6 }}>🗂 {t("manageTrays")}</h2>
      <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>
        Select trays to bulk delete — use this to remove mistakenly created trays or excess QR labels.
      </p>

      {/* Filters */}
      <div style={card}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div style={{ flex:2, minWidth:160 }}>
            <div style={lbl}>{t("search")}</div>
            <input style={inp} placeholder="TRY-001 or BATCH-..."
              value={filterSearch}
              onChange={e => { setFilterSearch(e.target.value); setSelected(new Set()); }} />
          </div>
          <div style={{ flex:1, minWidth:130 }}>
            <div style={lbl}>Filter by {t("stage")}</div>
            <select style={inp} value={filterStage}
              onChange={e => { setFilterStage(e.target.value); setSelected(new Set()); }}>
              <option value="">All Stages</option>
              {allStages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex:1, minWidth:130 }}>
            <div style={lbl}>Filter by {t("project")}</div>
            <select style={inp} value={filterProj}
              onChange={e => { setFilterProj(e.target.value); setSelected(new Set()); }}>
              <option value="">All Projects</option>
              {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button style={btnGray} onClick={load} disabled={loading}>↻ {t("refresh")}</button>
        </div>
      </div>

      {/* Selection toolbar */}
      <div style={{
        display:"flex", alignItems:"center", gap:12,
        padding:"12px 16px", background:"var(--surface)",
        border:"1px solid var(--border)", borderRadius:8,
        marginBottom:12, flexWrap:"wrap",
      }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer", color:"var(--text)" }}>
          <input type="checkbox"
            checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll} style={{ width:15, height:15 }} />
          Select all ({filtered.length})
        </label>
        <span style={{ fontSize:12, color:"var(--muted)" }}>
          {selected.size > 0 ? `${selected.size} selected · ${selectedUnits.toLocaleString()} ${t("units")}` : "None selected"}
        </span>

        {allStages.filter(s => s !== "COMPLETE").length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginLeft:"auto" }}>
            <span style={{ fontSize:11, color:"var(--muted)", alignSelf:"center" }}>Quick select:</span>
            {allStages.filter(s => s !== "COMPLETE" && s !== "SPLIT").map(s => (
              <button key={s} onClick={() => selectByStage(s)} style={{
                padding:"3px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontFamily:"inherit",
                background:stageColor(s)+"22", border:`1px solid ${stageColor(s)}55`, color:stageColor(s),
              }}>{s}</button>
            ))}
          </div>
        )}

        <button style={{ ...btnRed, marginLeft:selected.size > 0 ? 0 : "auto", opacity:selected.size === 0 ? 0.4 : 1 }}
          disabled={selected.size === 0 || deleting}
          onClick={() => setConfirmOpen(true)}>
          🗑 {t("delete")} {selected.size > 0 ? `${selected.size} Selected` : "Selected"}
        </button>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div style={{ background:"var(--err-bg)", border:"1px solid var(--err-border)", borderRadius:10, padding:20, marginBottom:12 }}>
          <p style={{ color:"var(--err-text)", fontSize:14, marginBottom:14 }}>
            ⚠ You are about to permanently delete <strong>{selected.size}</strong> tray{selected.size !== 1 ? "s" : ""} and
            all their scan history ({selectedUnits.toLocaleString()} {t("units")}). This cannot be undone.
          </p>
          <div style={{ display:"flex", gap:10 }}>
            <button style={btnRed} onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, delete permanently"}
            </button>
            <button style={btnGray} onClick={() => setConfirmOpen(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}

      {msg   && <div className="ok-box">{msg}</div>}
      {error && <div className="err-box">{error}</div>}

      {/* Tray table */}
      <div style={{ ...card, padding:0, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:32, textAlign:"center", color:"var(--muted)" }}>
            <span className="spin" /> Loading trays…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--muted)" }}>
            No trays match the current filters.
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width:36 }}></th>
                  <th>{t("trayId")}</th>
                  <th>{t("stage")}</th>
                  <th>{t("project")}</th>
                  <th>{t("units")}</th>
                  <th>{t("batchNo")}</th>
                  <th>{t("createdBy")}</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tr => (
                  <tr key={tr.id} style={{ background:selected.has(tr.id) ? "rgba(122,31,31,.08)" : undefined }}>
                    <td style={{ textAlign:"center" }}>
                      <input type="checkbox" checked={selected.has(tr.id)} onChange={() => toggleOne(tr.id)}
                        style={{ width:14, height:14, cursor:"pointer" }} />
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize:12 }}>{tr.id}</span>
                      {tr.parent_id && <span className="tag tag-amber" style={{ marginLeft:6, fontSize:10 }}>Part {tr.id.slice(-1)}</span>}
                      {tr.fifo_violated && <span className="tag tag-red" style={{ marginLeft:4, fontSize:10 }}>FIFO</span>}
                    </td>
                    <td>
                      <span style={{ background:stageColor(tr.stage)+"22", color:stageColor(tr.stage), borderRadius:5, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                        {tr.stage}
                      </span>
                    </td>
                    <td style={{ fontSize:12 }}>{tr.project || "—"}</td>
                    <td><span style={{ fontWeight:600, color:"#85B7EB", fontSize:13 }}>{(tr.total_units||0).toLocaleString()}</span></td>
                    <td style={{ fontSize:12, color:"var(--muted)" }}>{tr.batch_no || "—"}</td>
                    <td style={{ fontSize:12, color:"var(--muted)" }}>{tr.created_by || "—"}</td>
                    <td style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>{fmtDate(tr.created_at)}</td>
                    <td>
                      <button onClick={() => handleDeleteOne(tr.id)} disabled={deleting}
                        style={{ padding:"4px 10px", fontSize:11, cursor:"pointer", background:"var(--err-bg)", color:"var(--err-text)", border:"1px solid var(--err-border)", borderRadius:5, fontFamily:"inherit" }}>
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:"10px 16px", borderTop:"1px solid var(--border)", display:"flex", gap:20, fontSize:12, color:"var(--muted)" }}>
              <span>{filtered.length} tray{filtered.length !== 1 ? "s" : ""} shown</span>
              <span>{filtered.reduce((s, t) => s + (t.total_units||0), 0).toLocaleString()} total {t("units")}</span>
              {(filterStage || filterProj || filterSearch) && (
                <span style={{ color:"var(--warn-text)" }}>⚠ Filters active — not showing all trays</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles — all CSS variables ─────────────────────────────────────────────────
const card   = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:14, marginBottom:12 };
const inp    = { width:"100%", padding:"9px 12px", background:"var(--inp-bg)", border:"1px solid var(--border)", borderRadius:7, color:"var(--text)", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
const lbl    = { fontSize:11, color:"var(--muted)", fontWeight:600, marginBottom:4 };
const btnRed = { padding:"9px 18px", background:"var(--err-bg)", color:"var(--err-text)", border:"1px solid var(--err-border)", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };
const btnGray= { padding:"9px 16px", background:"var(--card)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" };