import { useState, useEffect, useCallback } from "react";
import { getAllTrays, getPipeline, bulkDeleteTrays, deleteTray } from "../api/api";

export default function ManageTraysPage() {
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
    setLoading(true);
    setMsg(""); setError("");
    const [t, p] = await Promise.all([getAllTrays(), getPipeline()]);
    setTrays(Array.isArray(t) ? t : []);
    setPipeline(p);
    setSelected(new Set());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Filtered view ──────────────────────────────────────────────────────────
  const filtered = trays.filter(t => {
    if (filterStage  && t.stage   !== filterStage)                        return false;
    if (filterProj   && t.project !== filterProj)                         return false;
    if (filterSearch && !t.id.includes(filterSearch.toUpperCase()) &&
        !t.batch_no?.includes(filterSearch))                              return false;
    return true;
  });

  // ── Select helpers ─────────────────────────────────────────────────────────
  function toggleOne(id) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  }

  function selectByStage(stageId) {
    const ids = filtered.filter(t => t.stage === stageId).map(t => t.id);
    setSelected(new Set(ids));
  }

  // ── Delete actions ─────────────────────────────────────────────────────────
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setDeleting(true); setMsg(""); setError(""); setConfirmOpen(false);
    try {
      const res = await bulkDeleteTrays([...selected]);
      if (res.ok) {
        setMsg(`✅ Deleted ${res.deleted} tray${res.deleted !== 1 ? "s" : ""} successfully.`);
        await load();
      } else {
        setError("Delete failed — check your permissions.");
      }
    } catch {
      setError("Cannot reach server.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteOne(id) {
    if (!confirm(`Delete tray "${id}" and all its scan history? This cannot be undone.`)) return;
    setDeleting(true); setMsg(""); setError("");
    try {
      const res = await deleteTray(id);
      if (res.ok) {
        setMsg(`✅ Tray ${id} deleted.`);
        await load();
      } else {
        setError(res.detail || "Delete failed.");
      }
    } catch {
      setError("Cannot reach server.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const selectedUnits = filtered
    .filter(t => selected.has(t.id))
    .reduce((sum, t) => sum + (t.total_units || 0), 0);

  const allStages  = [...new Set(trays.map(t => t.stage))].sort();
  const allProjects = pipeline?.projects?.map(p => p.id) || [];

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
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ color: "#E8EFF8", marginBottom: 6 }}>🗂 Manage Trays</h2>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
        Select trays to bulk delete — use this to remove mistakenly created trays or excess QR labels.
      </p>

      {/* ── Filters ── */}
      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={lbl}>Search ID / Batch</div>
            <input style={inp}
              placeholder="TRY-001 or BATCH-..."
              value={filterSearch}
              onChange={e => { setFilterSearch(e.target.value); setSelected(new Set()); }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div style={lbl}>Filter by Stage</div>
            <select style={inp} value={filterStage}
              onChange={e => { setFilterStage(e.target.value); setSelected(new Set()); }}>
              <option value="">All Stages</option>
              {allStages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div style={lbl}>Filter by Project</div>
            <select style={inp} value={filterProj}
              onChange={e => { setFilterProj(e.target.value); setSelected(new Set()); }}>
              <option value="">All Projects</option>
              {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button style={btnGray} onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Selection toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: 8,
        marginBottom: 12, flexWrap: "wrap",
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8,
                        fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll}
            style={{ width: 15, height: 15 }}
          />
          Select all ({filtered.length})
        </label>

        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {selected.size > 0
            ? `${selected.size} selected · ${selectedUnits.toLocaleString()} units`
            : "None selected"}
        </span>

        {/* Quick select by stage */}
        {allStages.filter(s => s !== "COMPLETE").length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
            <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center" }}>
              Quick select:
            </span>
            {allStages.filter(s => s !== "COMPLETE" && s !== "SPLIT").map(s => (
              <button key={s}
                onClick={() => selectByStage(s)}
                style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 11,
                  cursor: "pointer", fontFamily: "inherit",
                  background: stageColor(s) + "22",
                  border: `1px solid ${stageColor(s)}55`,
                  color: stageColor(s),
                }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Delete button */}
        <button
          style={{
            ...btnRed,
            marginLeft: selected.size > 0 ? 0 : "auto",
            opacity: selected.size === 0 ? 0.4 : 1,
          }}
          disabled={selected.size === 0 || deleting}
          onClick={() => setConfirmOpen(true)}
        >
          🗑 Delete {selected.size > 0 ? `${selected.size} Selected` : "Selected"}
        </button>
      </div>

      {/* ── Confirm modal ── */}
      {confirmOpen && (
        <div style={{
          background: "rgba(122,31,31,.25)", border: "1px solid rgba(163,45,45,.5)",
          borderRadius: 10, padding: 20, marginBottom: 12,
        }}>
          <p style={{ color: "#F09595", fontSize: 14, marginBottom: 14 }}>
            ⚠ You are about to permanently delete <strong>{selected.size}</strong> tray
            {selected.size !== 1 ? "s" : ""} and all their scan history
            ({selectedUnits.toLocaleString()} units). This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={btnRed} onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, delete permanently"}
            </button>
            <button style={btnGray} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg   && <div style={okBox}>{msg}</div>}
      {error && <div style={errBox}>{error}</div>}

      {/* ── Tray table ── */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
            <span className="spin" /> Loading trays…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            No trays match the current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Tray ID</th>
                  <th>Stage</th>
                  <th>Project</th>
                  <th>Units</th>
                  <th>Batch No</th>
                  <th>Created By</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}
                    style={{ background: selected.has(t.id) ? "rgba(122,31,31,.1)" : undefined }}
                  >
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleOne(t.id)}
                        style={{ width: 14, height: 14, cursor: "pointer" }}
                      />
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 12 }}>{t.id}</span>
                      {t.parent_id && (
                        <span className="tag tag-amber" style={{ marginLeft: 6, fontSize: 10 }}>
                          Part {t.id.slice(-1)}
                        </span>
                      )}
                      {t.fifo_violated && (
                        <span className="tag tag-red" style={{ marginLeft: 4, fontSize: 10 }}>
                          FIFO
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        background: stageColor(t.stage) + "22",
                        color: stageColor(t.stage),
                        borderRadius: 5, padding: "2px 8px",
                        fontSize: 11, fontWeight: 600,
                      }}>
                        {t.stage}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{t.project || "—"}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: "#85B7EB", fontSize: 13 }}>
                        {(t.total_units || 0).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{t.batch_no || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{t.created_by || "—"}</td>
                    <td style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {fmtDate(t.created_at)}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDeleteOne(t.id)}
                        disabled={deleting}
                        style={{
                          padding: "4px 10px", fontSize: 11, cursor: "pointer",
                          background: "rgba(122,31,31,.2)", color: "#F09595",
                          border: "1px solid rgba(163,45,45,.4)", borderRadius: 5,
                          fontFamily: "inherit",
                        }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer summary */}
            <div style={{
              padding: "10px 16px", borderTop: "1px solid var(--border)",
              display: "flex", gap: 20, fontSize: 12, color: "var(--muted)",
            }}>
              <span>{filtered.length} tray{filtered.length !== 1 ? "s" : ""} shown</span>
              <span>
                {filtered.reduce((s, t) => s + (t.total_units || 0), 0).toLocaleString()} total units
              </span>
              {filterStage || filterProj || filterSearch
                ? <span style={{ color: "#FAC775" }}>⚠ Filters active — not showing all trays</span>
                : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const card   = { background: "#162032", border: "1px solid #1E2D42",
                 borderRadius: 10, padding: 14, marginBottom: 12 };
const inp    = { width: "100%", padding: "9px 12px", background: "#111827",
                 border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8",
                 fontSize: 13, outline: "none", boxSizing: "border-box",
                 fontFamily: "inherit" };
const lbl    = { fontSize: 11, color: "#6B7E95", fontWeight: 600, marginBottom: 4 };
const btnRed = { padding: "9px 18px", background: "#7A1F1F", color: "#FCEBEB",
                 border: "1px solid #7A1F1F", borderRadius: 8, fontSize: 13,
                 fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnGray= { padding: "9px 16px", background: "#162032", color: "#E8EFF8",
                 border: "1px solid #1E2D42", borderRadius: 8, fontSize: 13,
                 cursor: "pointer", fontFamily: "inherit" };
const errBox = { background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)",
                 borderRadius: 8, padding: 12, color: "#F09595", fontSize: 13,
                 marginBottom: 12 };
const okBox  = { background: "rgba(59,109,17,.2)", border: "1px solid rgba(59,109,17,.4)",
                 borderRadius: 8, padding: 12, color: "#97C459", fontSize: 13,
                 marginBottom: 12 };