import { useEffect, useState } from "react";
import { getStats, getAllTrays, getPipeline } from "../api/api";

const COLORS = {
  CREATED:"#888780", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
  BAT_MOUNT:"#EF9F27", BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
  RACK3:"#D4537E", DEPANEL_IN:"#BA7517", TESTING:"#185FA5", COMPLETE:"#3B6D11",
};

// ── Compact stat card — units shown as a small pill beside the subtitle ───────
function StatCard({ label, value, sub, color, extraValue }) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color, marginBottom: 6 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {sub && <div className="stat-sub" style={{ margin: 0 }}>{sub}</div>}
        {extraValue !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            background: color + "18",
            border: `1px solid ${color}44`,
            borderRadius: 4, padding: "1px 7px",
            whiteSpace: "nowrap",
          }}>
            {extraValue.toLocaleString()} units
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stage group with tray + units badges ──────────────────────────────────────
function StageGroup({ stage, trays, color }) {
  const [open, setOpen] = useState(false);
  const totalUnits = trays.reduce((sum, t) => sum + (t.total_units || 0), 0);

  return (
    <div className="sg-wrap">
      <div
        className="sg-hdr"
        style={{ borderLeftColor: color }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="sg-name">{stage.label || stage.id}</span>

        <span className="sg-count" style={{ background: color + "33", color }}>
          {trays.length} tray{trays.length !== 1 ? "s" : ""}
        </span>

        <span style={{
          background: color + "18", color,
          border: `1px solid ${color}44`,
          borderRadius: 10, padding: "2px 9px",
          fontSize: 11, fontWeight: 600,
        }}>
          {totalUnits.toLocaleString()} units
        </span>

        <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 4 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Tray ID</th>
                <th>Project</th>
                <th>Units</th>
                <th>Shift</th>
                <th>FIFO</th>
                <th>Age (h)</th>
              </tr>
            </thead>
            <tbody>
              {trays.map(t => {
                const ageH = t.last_updated
                  ? Math.round(((Date.now() - new Date(t.last_updated)) / 3600000) * 10) / 10
                  : "—";
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12 }}>{t.id}</span>
                      {t.parent_id && (
                        <span className="tag tag-amber" style={{ marginLeft: 6 }}>
                          Part {t.id.slice(-1)}
                        </span>
                      )}
                    </td>
                    <td>{t.project || "—"}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: "#85B7EB" }}>
                        {(t.total_units || 0).toLocaleString()}
                      </span>
                    </td>
                    <td>{t.shift || "—"}</td>
                    <td>
                      {t.fifo_violated
                        ? <span className="tag tag-red">⚠ FIFO</span>
                        : <span className="tag tag-green">✓</span>}
                    </td>
                    <td>
                      <span className={`tag ${ageH > 4 ? "tag-red" : ageH > 2 ? "tag-amber" : "tag-green"}`}>
                        {ageH}h
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats,           setStats]           = useState(null);
  const [trays,           setTrays]           = useState([]);
  const [pipeline,        setPipeline]        = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);

  async function load(project = selectedProject) {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([
        getStats(project),
        getAllTrays(project ? { project } : {}),
        getPipeline(),
      ]);
      setStats(s);
      setTrays(Array.isArray(t) ? t : []);
      setPipeline(p);
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(null); }, []);

  function handleProjectSelect(projectId) {
    const next = projectId === selectedProject ? null : projectId;
    setSelectedProject(next);
    load(next);
  }

  if (loading && !stats) {
    return (
      <div style={{ padding: 40, color: "var(--muted)" }}>
        <span className="spin" /> Loading dashboard…
      </div>
    );
  }
  if (!stats || !pipeline) return null;

  const projects    = pipeline.projects || [];
  const activeTrays = trays.filter(t => t.stage !== "COMPLETE" && t.stage !== "SPLIT");
  const byStage     = {};
  activeTrays.forEach(t => {
    byStage[t.stage] = byStage[t.stage] || [];
    byStage[t.stage].push(t);
  });

  const total        = stats.total_active + stats.total_complete;
  const pct          = total > 0 ? Math.round((stats.total_complete / total) * 100) : 0;
  const activeProject = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  return (
    <div>
      {/* ── Project filter pills ── */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap",
        marginBottom: 20, alignItems: "center",
      }}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
          Project:
        </span>

        <button onClick={() => handleProjectSelect(null)} style={pill(!selectedProject)}>
          All Projects
        </button>

        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => handleProjectSelect(p.id)}
            style={pill(selectedProject === p.id)}>
            {p.label}
          </button>
        ))}

        <button
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={() => load(selectedProject)}
          disabled={loading}
        >
          {loading ? <span className="spin" /> : "↻"} Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div className="stat-grid">
        <StatCard
          label="Active in Pipeline"
          value={stats.total_active}
          sub="trays in progress"
          extraValue={stats.total_active_units}
          color="#378ADD"
        />
        <StatCard
          label="Completed Today"
          value={stats.completed_today}
          sub="finished today"
          extraValue={stats.completed_today_units}
          color="#3B6D11"
        />
        <StatCard
          label="FIFO Violations"
          value={stats.fifo_violated}
          sub="flagged trays"
          color={stats.fifo_violated > 0 ? "#E24B4A" : "#3B6D11"}
        />
        <StatCard
          label="Stuck / Bottlenecks"
          value={stats.stuck_count}
          sub="idle 1h+"
          color={stats.stuck_count > 0 ? "#BA7517" : "#3B6D11"}
        />
        <StatCard
          label="Total Complete"
          value={stats.total_complete}
          sub={`${pct}% of all trays`}
          extraValue={stats.total_complete_units}
          color="#3B6D11"
        />
      </div>

      {/* ── Pipeline bar ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          Pipeline Overview
          {activeProject && (
            <span className="tag tag-blue" style={{ marginLeft: 8, textTransform: "none" }}>
              {activeProject.label}
            </span>
          )}
        </div>

        <div className="pipe-wrap">
          {(pipeline.stages || [])
            .filter(s => s.id !== "COMPLETE")
            .map((s, i) => {
              const count = stats.stage_counts?.[s.id] || 0;
              const units = stats.stage_units?.[s.id]  || 0;
              const col   = COLORS[s.id] || "#888780";
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <span className="pipe-arrow">›</span>}
                  <div
                    className="pipe-node"
                    style={{
                      background:  count > 0 ? col + "22" : "var(--surface)",
                      borderColor: count > 0 ? col : "var(--border)",
                      minWidth: 88,
                    }}
                  >
                    <div style={{
                      fontSize: 20, fontWeight: 700, lineHeight: 1,
                      color: count > 0 ? col : "var(--muted)",
                    }}>
                      {count}
                    </div>
                    {count > 0 && (
                      <div style={{
                        fontSize: 10, fontWeight: 600,
                        color: col, opacity: 0.85,
                        marginTop: 2, marginBottom: 2,
                      }}>
                        {units.toLocaleString()} u
                      </div>
                    )}
                    <div style={{
                      fontSize: 10, color: "var(--muted)",
                      marginTop: count > 0 ? 0 : 4,
                    }}>
                      {s.label}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="pbar-wrap" style={{ marginTop: 14 }}>
          <div className="pbar-top">
            <span>Overall throughput</span>
            <span style={{ color: "var(--muted)" }}>
              {pct}%
              {stats.total_complete_units > 0 && (
                <span style={{ marginLeft: 8, color: "#3B6D11", fontWeight: 600 }}>
                  · {stats.total_complete_units.toLocaleString()} units completed
                </span>
              )}
            </span>
          </div>
          <div className="pbar-bg">
            <div className="pbar-fill" style={{ width: pct + "%", background: "#3B6D11" }} />
          </div>
        </div>
      </div>

      {/* ── Active tray groups ── */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 12,
      }}>
        <div className="card-title" style={{ margin: 0 }}>
          Active Trays by Stage
          {activeProject && (
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>
              — {activeProject.label}
            </span>
          )}
        </div>
      </div>

      {Object.keys(byStage).length === 0 && (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>
          {activeProject
            ? `No active trays for ${activeProject.label}.`
            : "No active trays in the pipeline."}
        </div>
      )}

      {(pipeline.stages || [])
        .filter(s => byStage[s.id])
        .map(s => (
          <StageGroup
            key={s.id}
            stage={s}
            trays={byStage[s.id]}
            color={COLORS[s.id] || "#888780"}
          />
        ))}
    </div>
  );
}

// ── Project pill button style ──────────────────────────────────────────────────
function pill(active) {
  return {
    padding: "5px 14px", borderRadius: 20, fontSize: 12,
    fontWeight: 600, cursor: "pointer", border: "1px solid",
    fontFamily: "inherit", transition: "all .15s",
    background:  active ? "rgba(55,138,221,.15)" : "var(--surface)",
    borderColor: active ? "var(--accent)"        : "var(--border)",
    color:       active ? "var(--accent)"        : "var(--muted)",
  };
}