import { useEffect, useState } from "react";
import { getStats, getAllTrays, getPipeline, getScanLog } from "../api/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ── Color map ─────────────────────────────────────────────────────────────────
const STAGE_COLORS = {
  CREATED:    { bg: "#1C2333", accent: "#888780", grad: "rgba(136,135,128,0.15)" },
  RACK1_TOP:  { bg: "#0D1F35", accent: "#378ADD", grad: "rgba(55,138,221,0.15)"  },
  RACK2_BTM:  { bg: "#1A1640", accent: "#7F77DD", grad: "rgba(127,119,221,0.15)" },
  BAT_MOUNT:  { bg: "#2A1E0A", accent: "#EF9F27", grad: "rgba(239,159,39,0.15)"  },
  BAT_SOL_R:  { bg: "#2A0D0D", accent: "#E24B4A", grad: "rgba(226,75,74,0.15)"   },
  BAT_SOL_M:  { bg: "#0C2620", accent: "#5DCAA5", grad: "rgba(93,202,165,0.15)"  },
  RACK3:      { bg: "#2A0E1F", accent: "#D4537E", grad: "rgba(212,83,126,0.15)"  },
  DEPANEL_IN: { bg: "#201500", accent: "#BA7517", grad: "rgba(186,117,23,0.15)"  },
  TESTING:    { bg: "#081428", accent: "#185FA5", grad: "rgba(24,95,165,0.15)"   },
  COMPLETE:   { bg: "#0C1E07", accent: "#3B6D11", grad: "rgba(59,109,17,0.15)"   },
};

const PIE_COLORS = [
  "#378ADD","#7F77DD","#EF9F27","#E24B4A",
  "#5DCAA5","#D4537E","#BA7517","#185FA5","#3B6D11","#888780",
];

// ── Stat card matching image 1 ────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon, extraValue }) {
  return (
    <div style={{
      background: "#111827",
      border: `1px solid ${color}33`,
      borderRadius: 12, padding: "18px 20px",
      position: "relative", overflow: "hidden",
      borderTop: `3px solid ${color}`,
      minWidth: 0,
    }}>
      {/* Faint bg glow */}
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 80, height: 80, borderRadius: "50%",
        background: color + "18",
        transform: "translate(20px,-20px)",
        pointerEvents: "none",
      }} />
      {/* Icon top-right */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        fontSize: 18, opacity: 0.7,
      }}>{icon}</div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7E95",
                    textTransform: "uppercase", letterSpacing: ".06em",
                    marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {sub && <span style={{ fontSize: 12, color: "#6B7E95" }}>{sub}</span>}
        {extraValue !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            background: color + "18", border: `1px solid ${color}44`,
            borderRadius: 4, padding: "1px 7px",
          }}>
            {(extraValue || 0).toLocaleString()} units
          </span>
        )}
      </div>
    </div>
  );
}

// ── Pipeline stage card matching image 3 ─────────────────────────────────────
function StageCard({ stage, count, units, totalTrays }) {
  const c   = STAGE_COLORS[stage.id] || STAGE_COLORS.CREATED;
  const pct = totalTrays > 0 ? Math.round((count / totalTrays) * 100) : 0;

  return (
    <div style={{
      background: `linear-gradient(145deg, ${c.bg} 0%, ${c.grad.replace("0.15","0.08")} 100%)`,
      border: `1px solid ${c.accent}44`,
      borderRadius: 12, padding: "14px 14px 10px",
      minWidth: 110, flex: "1 1 110px",
      display: "flex", flexDirection: "column", gap: 4,
      position: "relative", overflow: "hidden",
    }}>
      {/* Glow circle top-right */}
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 70, height: 70, borderRadius: "50%",
        background: c.accent + "22", pointerEvents: "none",
      }} />

      {/* Stage label */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: c.accent,
        textTransform: "uppercase", letterSpacing: ".05em",
        whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis", marginBottom: 6,
      }}>
        {stage.label}
      </div>

      {/* Tray count */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: c.accent, lineHeight: 1 }}>
          {count}
        </span>
        <span style={{ fontSize: 11, color: c.accent + "99" }}>trays</span>
      </div>

      {/* Units count */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: c.accent + "cc" }}>
          {(units || 0).toLocaleString()}
        </span>
        <span style={{ fontSize: 11, color: c.accent + "77" }}>units</span>
      </div>

      {/* Mini progress bar + pct */}
      <div style={{ marginTop: 8 }}>
        <div style={{
          height: 3, background: c.accent + "22", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: pct + "%",
            background: c.accent, borderRadius: 2,
            transition: "width .4s",
          }} />
        </div>
        <div style={{ fontSize: 9, color: c.accent + "88", marginTop: 3, textAlign: "right" }}>
          {pct}%
        </div>
      </div>
    </div>
  );
}

// ── Stage group (expandable tray list) ────────────────────────────────────────
function StageGroup({ stage, trays }) {
  const [open, setOpen] = useState(false);
  const c          = STAGE_COLORS[stage.id] || STAGE_COLORS.CREATED;
  const totalUnits = trays.reduce((s, t) => s + (t.total_units || 0), 0);

  return (
    <div style={{
      border: `1px solid ${c.accent}33`,
      borderLeft: `3px solid ${c.accent}`,
      borderRadius: 10, marginBottom: 8, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 14px", cursor: "pointer",
        background: c.bg,
      }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: "#E8EFF8" }}>
          {stage.label}
        </span>
        <span style={{
          background: c.accent + "33", color: c.accent,
          borderRadius: 12, padding: "2px 9px",
          fontSize: 11, fontWeight: 700,
        }}>
          {trays.length} trays
        </span>
        <span style={{
          background: c.accent + "18", color: c.accent,
          border: `1px solid ${c.accent}44`,
          borderRadius: 10, padding: "2px 9px",
          fontSize: 11, fontWeight: 600,
        }}>
          {totalUnits.toLocaleString()} units
        </span>
        <span style={{ color: "#6B7E95", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: "0 14px 12px", background: "#0A0F1A" }}>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Tray ID</th><th>Project</th><th>Units</th>
                <th>Shift</th><th>FIFO</th><th>Age (h)</th>
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
                    <td style={{ fontWeight: 600, color: "#85B7EB" }}>
                      {(t.total_units || 0).toLocaleString()}
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

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#162032", border: "1px solid #1E2D42",
      borderRadius: 8, padding: "10px 14px", fontSize: 12,
    }}>
      <div style={{ color: "#6B7E95", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats,           setStats]           = useState(null);
  const [trays,           setTrays]           = useState([]);
  const [pipeline,        setPipeline]        = useState(null);
  const [scanLog,         setScanLog]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);

  async function load(project = selectedProject) {
    setLoading(true);
    try {
      const [s, t, p, log] = await Promise.all([
        getStats(project),
        getAllTrays(project ? { project } : {}),
        getPipeline(),
        getScanLog(500),
      ]);
      setStats(s);
      setTrays(Array.isArray(t) ? t : []);
      setPipeline(p);
      setScanLog(Array.isArray(log) ? log : []);
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(null); }, []);

  function handleProjectSelect(pid) {
    const next = pid === selectedProject ? null : pid;
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
  const stages      = pipeline.stages   || [];
  const activeTrays = trays.filter(t => t.stage !== "COMPLETE" && t.stage !== "SPLIT");
  const byStage     = {};
  activeTrays.forEach(t => {
    byStage[t.stage] = byStage[t.stage] || [];
    byStage[t.stage].push(t);
  });

  const total        = stats.total_active + stats.total_complete;
  const pct          = total > 0 ? Math.round((stats.total_complete / total) * 100) : 0;
  const activeProject = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  // ── Chart data ── ///

  // 1. Pie: stage distribution of active trays
  const pieData = stages
    .filter(s => (stats.stage_counts?.[s.id] || 0) > 0)
    .map(s => ({
      name:  s.label,
      value: stats.stage_counts?.[s.id] || 0,
      units: stats.stage_units?.[s.id]  || 0,
    }));

  // 2. Daily trend: scans per day for last 7 days
  const dayMap = {};
  const now    = Date.now();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    dayMap[d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })] = 0;
  }
  scanLog.forEach(e => {
    if (!e.timestamp) return;
    const d = new Date(e.timestamp);
    const key = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    if (key in dayMap) dayMap[key]++;
  });
  const dailyData = Object.entries(dayMap).map(([date, scans]) => ({ date, scans }));

  // 3. By shift: trays completed per shift
  const shiftMap = { Morning: 0, Afternoon: 0, Night: 0 };
  trays.forEach(t => {
    const sh = t.shift || "Morning";
    if (sh in shiftMap) shiftMap[sh]++;
  });
  const shiftData = Object.entries(shiftMap).map(([shift, count]) => ({ shift, count }));

  // 4. By project: units per project
  const projUnitMap = {};
  trays.forEach(t => {
    if (!t.project) return;
    projUnitMap[t.project] = (projUnitMap[t.project] || 0) + (t.total_units || 0);
  });
  const projData = Object.entries(projUnitMap)
    .map(([project, units]) => ({ project, units }))
    .sort((a, b) => b.units - a.units);

  return (
    <div>
      {/* ── Project filter ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap",
                    marginBottom: 20, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#6B7E95", fontWeight: 600 }}>Project:</span>

        <button onClick={() => handleProjectSelect(null)} style={pill(!selectedProject)}>
          All Projects
        </button>
        {projects.map(p => (
          <button key={p.id} onClick={() => handleProjectSelect(p.id)}
            style={pill(selectedProject === p.id)}>
            {p.label}
          </button>
        ))}

        <button className="btn" style={{ marginLeft: "auto" }}
          onClick={() => load(selectedProject)} disabled={loading}>
          {loading ? <span className="spin" /> : "↻"} Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <StatCard label="Active in Pipeline" value={stats.total_active}
          sub="trays in progress" extraValue={stats.total_active_units}
          color="#378ADD" icon="⚙" />
        <StatCard label="Completed Today"   value={stats.completed_today}
          sub="finished today"   extraValue={stats.completed_today_units}
          color="#3B6D11" icon="✅" />
        <StatCard label="FIFO Violations"   value={stats.fifo_violated}
          sub="flagged trays"
          color={stats.fifo_violated > 0 ? "#E24B4A" : "#3B6D11"} icon="⚠" />
        <StatCard label="Stuck / Bottlenecks" value={stats.stuck_count}
          sub="idle 1h+"
          color={stats.stuck_count > 0 ? "#BA7517" : "#3B6D11"} icon="🕐" />
        <StatCard label="Total Complete"    value={stats.total_complete}
          sub={`${pct}% of all trays`} extraValue={stats.total_complete_units}
          color="#3B6D11" icon="🏁" />
      </div>

      {/* ── Colorful pipeline stage cards ── */}
      <div style={{
        background: "#111827", border: "1px solid #1E2D42",
        borderRadius: 12, padding: 16, marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7E95",
                      textTransform: "uppercase", letterSpacing: ".06em",
                      marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          Pipeline Stages
          {activeProject && (
            <span className="tag tag-blue" style={{ textTransform: "none" }}>
              {activeProject.label}
            </span>
          )}
          <span style={{ flex: 1, height: 1, background: "#1E2D42" }} />
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && (
                <span style={{ color: "#6B7E95", fontSize: 14, flexShrink: 0 }}>›</span>
              )}
              <StageCard
                stage={s}
                count={stats.stage_counts?.[s.id] || 0}
                units={stats.stage_units?.[s.id]  || 0}
                totalTrays={total}
              />
            </div>
          ))}
        </div>

        {/* Throughput bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        fontSize: 12, marginBottom: 5, color: "#6B7E95" }}>
            <span>Overall throughput</span>
            <span style={{ color: "#3B6D11", fontWeight: 700 }}>
              {pct}% &nbsp;·&nbsp; {(stats.total_complete_units || 0).toLocaleString()} units completed
            </span>
          </div>
          <div style={{ height: 6, background: "#1E2D42", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: pct + "%",
              background: "linear-gradient(90deg, #3B6D11, #5DCAA5)",
              borderRadius: 3, transition: "width .5s",
            }} />
          </div>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16, marginBottom: 20,
      }}>
        {/* Pie: stage distribution */}
        <div style={chartCard}>
          <div style={chartTitle}>Stage Distribution</div>
          {pieData.length === 0 ? (
            <div style={emptyChart}>No active trays</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%"
                  innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name"
                  paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={tooltipStyle}>
                        <div style={{ fontWeight: 700, color: "#E8EFF8" }}>{d.name}</div>
                        <div style={{ color: "#85B7EB" }}>{d.value} trays</div>
                        <div style={{ color: "#5DCAA5" }}>{d.units.toLocaleString()} units</div>
                      </div>
                    );
                  }}
                />
                <Legend
                  iconType="circle" iconSize={8}
                  formatter={v => (
                    <span style={{ fontSize: 11, color: "#6B7E95" }}>{v}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar: daily scan trend */}
        <div style={chartCard}>
          <div style={chartTitle}>Daily Scan Activity (7 days)</div>
          {dailyData.every(d => d.scans === 0) ? (
            <div style={emptyChart}>No scan data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} barSize={22}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7E95" }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7E95" }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="scans" name="Scans" fill="#378ADD"
                  radius={[4, 4, 0, 0]}>
                  {dailyData.map((_, i) => (
                    <Cell key={i} fill={i === dailyData.length - 1 ? "#5DCAA5" : "#378ADD"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar: trays by shift */}
        <div style={chartCard}>
          <div style={chartTitle}>Trays by Shift</div>
          {shiftData.every(d => d.count === 0) ? (
            <div style={emptyChart}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={shiftData} barSize={36}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="shift" tick={{ fontSize: 11, fill: "#6B7E95" }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7E95" }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Trays" radius={[4, 4, 0, 0]}>
                  <Cell fill="#378ADD" />
                  <Cell fill="#EF9F27" />
                  <Cell fill="#7F77DD" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar: units by project */}
        {projData.length > 0 && (
          <div style={chartCard}>
            <div style={chartTitle}>Units by Project</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={projData} barSize={30}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="project" tick={{ fontSize: 10, fill: "#6B7E95" }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7E95" }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="units" name="Units" radius={[4, 4, 0, 0]}>
                  {projData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Active tray groups ── */}
      <div style={{ marginBottom: 12 }}>
        <div className="card-title">
          Active Trays by Stage
          {activeProject && (
            <span style={{ fontSize: 11, color: "#6B7E95", fontWeight: 400, marginLeft: 8 }}>
              — {activeProject.label}
            </span>
          )}
        </div>
      </div>

      {Object.keys(byStage).length === 0 ? (
        <div style={{ color: "#6B7E95", textAlign: "center", padding: 40 }}>
          {activeProject
            ? `No active trays for ${activeProject.label}.`
            : "No active trays in the pipeline."}
        </div>
      ) : (
        stages
          .filter(s => byStage[s.id])
          .map(s => (
            <StageGroup key={s.id} stage={s} trays={byStage[s.id]} />
          ))
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
function pill(active) {
  return {
    padding: "5px 14px", borderRadius: 20, fontSize: 12,
    fontWeight: 600, cursor: "pointer", border: "1px solid",
    fontFamily: "inherit", transition: "all .15s",
    background:  active ? "rgba(55,138,221,.15)" : "#111827",
    borderColor: active ? "#378ADD" : "#1E2D42",
    color:       active ? "#378ADD" : "#6B7E95",
  };
}

const chartCard = {
  background: "#111827", border: "1px solid #1E2D42",
  borderRadius: 12, padding: "16px 16px 10px",
};

const chartTitle = {
  fontSize: 12, fontWeight: 700, color: "#6B7E95",
  textTransform: "uppercase", letterSpacing: ".06em",
  marginBottom: 12,
};

const emptyChart = {
  height: 220, display: "flex", alignItems: "center",
  justifyContent: "center", color: "#6B7E95", fontSize: 13,
};

const tooltipStyle = {
  background: "#162032", border: "1px solid #1E2D42",
  borderRadius: 8, padding: "10px 14px", fontSize: 12,
};