import { useEffect, useState } from "react";
import { getStats, getAllTrays, getPipeline } from "../api/api";

const COLORS = {
  CREATED:"#888780", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
  BAT_MOUNT:"#EF9F27", BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
  RACK3:"#D4537E", DEPANEL_IN:"#BA7517", TESTING:"#185FA5", COMPLETE:"#3B6D11",
};

function StatCard({ label, value, color, sub }) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function StageGroup({ stage, trays, color }) {
  const [open, setOpen] = useState(false);
  const label = stage.label || stage.id;

  return (
    <div className="sg-wrap">
      <div
        className="sg-hdr"
        style={{ borderLeftColor: color }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sg-name">{label}</span>
        <span className="sg-count" style={{ background: color + "33", color }}>
          {trays.length}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Tray ID</th>
                <th>Project</th>
                <th>Shift</th>
                <th>FIFO</th>
                <th>Age (h)</th>
              </tr>
            </thead>
            <tbody>
              {trays.map((t) => {
                const ageH = t.last_updated
                  ? Math.round(
                      ((Date.now() - new Date(t.last_updated)) / 3600000) * 10
                    ) / 10
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
                    <td>{t.shift || "—"}</td>
                    <td>
                      {t.fifo_violated ? (
                        <span className="tag tag-red">⚠ FIFO</span>
                      ) : (
                        <span className="tag tag-green">✓</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`tag ${
                          ageH > 4 ? "tag-red" : ageH > 2 ? "tag-amber" : "tag-green"
                        }`}
                      >
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

export default function Dashboard() {
  const [stats,    setStats]    = useState(null);
  const [trays,    setTrays]    = useState([]);
  const [pipeline, setPipeline] = useState(null);
  const [loading,  setLoading]  = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([
        getStats(), getAllTrays(), getPipeline(),
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

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--muted)" }}>
        <span className="spin" /> Loading dashboard…
      </div>
    );
  }
  if (!stats || !pipeline) return null;

  // Group active trays by stage
  const activeTrays = trays.filter((t) => t.stage !== "COMPLETE" && t.stage !== "SPLIT");
  const byStage = {};
  activeTrays.forEach((t) => {
    byStage[t.stage] = byStage[t.stage] || [];
    byStage[t.stage].push(t);
  });

  const total     = stats.total_active + stats.total_complete;
  const pct       = total > 0 ? Math.round((stats.total_complete / total) * 100) : 0;

  return (
    <div>
      {/* KPI row */}
      <div className="stat-grid">
        <StatCard label="Active in Pipeline"  value={stats.total_active}    color="#378ADD" sub="trays in progress" />
        <StatCard label="Completed Today"     value={stats.completed_today}  color="#3B6D11" sub="finished today" />
        <StatCard label="FIFO Violations"     value={stats.fifo_violated}    color={stats.fifo_violated > 0 ? "#E24B4A" : "#3B6D11"} sub="flagged trays" />
        <StatCard label="Stuck / Bottlenecks" value={stats.stuck_count}      color={stats.stuck_count > 0 ? "#BA7517" : "#3B6D11"} sub="idle 1h+" />
        <StatCard label="Total Complete"      value={stats.total_complete}   color="#3B6D11" sub={`${pct}% of all trays`} />
      </div>

      {/* Pipeline bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Pipeline Overview</div>
        <div className="pipe-wrap">
          {(pipeline.stages || [])
            .filter((s) => s.id !== "COMPLETE")
            .map((s, i) => {
              const count = stats.stage_counts?.[s.id] || 0;
              const col   = COLORS[s.id] || "#888780";
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <span className="pipe-arrow">›</span>}
                  <div
                    className="pipe-node"
                    style={{
                      background:   count > 0 ? col + "22" : "var(--surface)",
                      borderColor:  count > 0 ? col : "var(--border)",
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? col : "var(--muted)" }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                      {s.label}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="pbar-wrap" style={{ marginTop: 12 }}>
          <div className="pbar-top">
            <span>Overall throughput</span>
            <span>{pct}%</span>
          </div>
          <div className="pbar-bg">
            <div className="pbar-fill" style={{ width: pct + "%", background: "#3B6D11" }} />
          </div>
        </div>
      </div>

      {/* Active tray groups */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>Active Trays by Stage</div>
        <button className="btn" onClick={load}>↻ Refresh</button>
      </div>

      {Object.keys(byStage).length === 0 && (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>
          No active trays in the pipeline.
        </div>
      )}

      {(pipeline.stages || [])
        .filter((s) => byStage[s.id])
        .map((s) => (
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