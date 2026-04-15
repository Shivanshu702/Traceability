import { useEffect, useState } from "react";
import { getStats, getAllTrays, getPipeline, getScanLog } from "../api/api";

// ── Color themes per stage ────────────────────────────────────────────────────
const THEME = {
  CREATED:    { bg:"#1C2333", accent:"#888780" },
  RACK1_TOP:  { bg:"#0D1F35", accent:"#378ADD" },
  RACK2_BTM:  { bg:"#1A1640", accent:"#7F77DD" },
  BAT_MOUNT:  { bg:"#2A1E0A", accent:"#EF9F27" },
  BAT_SOL_R:  { bg:"#2A0D0D", accent:"#E24B4A" },
  BAT_SOL_M:  { bg:"#0C2620", accent:"#5DCAA5" },
  RACK3:      { bg:"#2A0E1F", accent:"#D4537E" },
  DEPANEL_IN: { bg:"#201500", accent:"#BA7517" },
  TESTING:    { bg:"#081428", accent:"#185FA5" },
  COMPLETE:   { bg:"#0C1E07", accent:"#3B6D11" },
};

const CHART_COLORS = [
  "#378ADD","#7F77DD","#EF9F27","#E24B4A",
  "#5DCAA5","#D4537E","#BA7517","#3B6D11","#888780",
];

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon, extraValue }) {
  return (
    <div style={{
      background: "#111827",
      border: `1px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      borderRadius: 12, padding: "18px 20px",
      position: "relative", overflow: "hidden", minWidth: 0,
    }}>
      <div style={{
        position:"absolute", top:-16, right:-16,
        width:72, height:72, borderRadius:"50%",
        background: color + "18", pointerEvents:"none",
      }}/>
      <div style={{
        position:"absolute", top:12, right:14,
        fontSize:18, opacity:0.65, lineHeight:1,
      }}>{icon}</div>
      <div style={{ fontSize:11, fontWeight:700, color:"#6B7E95",
                    textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>
        {label}
      </div>
      <div style={{ fontSize:34, fontWeight:700, color, lineHeight:1, marginBottom:6 }}>
        {value}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        {sub && <span style={{ fontSize:12, color:"#6B7E95" }}>{sub}</span>}
        {extraValue !== undefined && (
          <span style={{
            fontSize:11, fontWeight:700, color,
            background:color+"18", border:`1px solid ${color}44`,
            borderRadius:4, padding:"1px 7px", whiteSpace:"nowrap",
          }}>
            {(extraValue||0).toLocaleString()} units
          </span>
        )}
      </div>
    </div>
  );
}

// ── Pipeline stage card ───────────────────────────────────────────────────────
function StageCard({ stage, count, units, totalTrays }) {
  const t   = THEME[stage.id] || THEME.CREATED;
  const pct = totalTrays > 0 ? Math.round((count / totalTrays) * 100) : 0;
  return (
    <div style={{
      background: t.bg,
      border: `1px solid ${t.accent}44`,
      borderRadius:12, padding:"14px 14px 10px",
      minWidth:110, flex:"1 1 110px",
      display:"flex", flexDirection:"column", gap:4,
      position:"relative", overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", top:-18, right:-18,
        width:60, height:60, borderRadius:"50%",
        background:t.accent+"22", pointerEvents:"none",
      }}/>
      <div style={{
        fontSize:9, fontWeight:700, color:t.accent,
        textTransform:"uppercase", letterSpacing:".05em",
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:4,
      }}>
        {stage.label}
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontSize:28, fontWeight:700, color:t.accent, lineHeight:1 }}>{count}</span>
        <span style={{ fontSize:11, color:t.accent+"88" }}>trays</span>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontSize:15, fontWeight:600, color:t.accent+"bb" }}>
          {(units||0).toLocaleString()}
        </span>
        <span style={{ fontSize:11, color:t.accent+"66" }}>units</span>
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ height:3, background:t.accent+"22", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:pct+"%", background:t.accent, borderRadius:2 }}/>
        </div>
        <div style={{ fontSize:9, color:t.accent+"77", marginTop:3, textAlign:"right" }}>
          {pct}%
        </div>
      </div>
    </div>
  );
}

// ── Stage group (expandable) ───────────────────────────────────────────────────
function StageGroup({ stage, trays }) {
  const [open, setOpen] = useState(false);
  const t          = THEME[stage.id] || THEME.CREATED;
  const totalUnits = trays.reduce((s, t) => s + (t.total_units||0), 0);
  return (
    <div style={{
      border:`1px solid ${t.accent}33`,
      borderLeft:`3px solid ${t.accent}`,
      borderRadius:10, marginBottom:8, overflow:"hidden",
    }}>
      <div style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"11px 14px", cursor:"pointer", background:t.bg,
      }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize:13, fontWeight:600, flex:1, color:"#E8EFF8" }}>
          {stage.label}
        </span>
        <span style={{
          background:t.accent+"33", color:t.accent,
          borderRadius:12, padding:"2px 9px", fontSize:11, fontWeight:700,
        }}>
          {trays.length} trays
        </span>
        <span style={{
          background:t.accent+"18", color:t.accent,
          border:`1px solid ${t.accent}44`,
          borderRadius:10, padding:"2px 9px", fontSize:11, fontWeight:600,
        }}>
          {totalUnits.toLocaleString()} units
        </span>
        <span style={{ color:"#6B7E95", fontSize:12 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding:"0 14px 12px", background:"#0A0F1A" }}>
          <table className="tbl" style={{ marginTop:8 }}>
            <thead>
              <tr>
                <th>Tray ID</th><th>Project</th><th>Units</th>
                <th>Shift</th><th>FIFO</th><th>Age (h)</th>
              </tr>
            </thead>
            <tbody>
              {trays.map(tr => {
                const ageH = tr.last_updated
                  ? Math.round(((Date.now()-new Date(tr.last_updated))/3600000)*10)/10
                  : "—";
                return (
                  <tr key={tr.id}>
                    <td>
                      <span className="mono" style={{ fontSize:12 }}>{tr.id}</span>
                      {tr.parent_id && (
                        <span className="tag tag-amber" style={{ marginLeft:6 }}>
                          Part {tr.id.slice(-1)}
                        </span>
                      )}
                    </td>
                    <td>{tr.project||"—"}</td>
                    <td style={{ fontWeight:600, color:"#85B7EB" }}>
                      {(tr.total_units||0).toLocaleString()}
                    </td>
                    <td>{tr.shift||"—"}</td>
                    <td>
                      {tr.fifo_violated
                        ? <span className="tag tag-red">⚠ FIFO</span>
                        : <span className="tag tag-green">✓</span>}
                    </td>
                    <td>
                      <span className={`tag ${ageH>4?"tag-red":ageH>2?"tag-amber":"tag-green"}`}>
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

// ── Pure CSS bar chart — no external library ──────────────────────────────────
function BarChart({ data, valueKey, labelKey, colors, height = 140, unit = "" }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6,
                  height, paddingTop:8, paddingBottom:0 }}>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const pct = (val / max) * 100;
        const col = Array.isArray(colors) ? colors[i % colors.length] : colors;
        return (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column",
                                alignItems:"center", gap:4, height:"100%" }}>
            <div style={{ flex:1, display:"flex", alignItems:"flex-end", width:"100%" }}>
              <div
                title={`${d[labelKey]}: ${val.toLocaleString()}${unit}`}
                style={{
                  width:"100%", height: pct + "%", minHeight: val > 0 ? 4 : 0,
                  background: col, borderRadius:"4px 4px 0 0",
                  transition:"height .4s", cursor:"default",
                  position:"relative",
                }}>
                {val > 0 && (
                  <div style={{
                    position:"absolute", top:-18, left:"50%",
                    transform:"translateX(-50%)",
                    fontSize:9, fontWeight:700, color:col, whiteSpace:"nowrap",
                  }}>
                    {val.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            <div style={{
              fontSize:9, color:"#6B7E95", textAlign:"center",
              whiteSpace:"nowrap", overflow:"hidden",
              textOverflow:"ellipsis", width:"100%", maxWidth:60,
            }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pure CSS donut chart ───────────────────────────────────────────────────────
function DonutChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div style={{ width:size, height:size, display:"flex", alignItems:"center",
                  justifyContent:"center", color:"#6B7E95", fontSize:11 }}>
      No data
    </div>
  );

  let offset = 0;
  const r = 45, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow:"visible" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E2D42" strokeWidth={12}/>
      {data.map((d, i) => {
        const pct  = d.value / total;
        const dash = pct * circ;
        const gap  = circ - dash;
        const rot  = offset * 360 - 90;
        offset    += pct;
        return (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none"
            stroke={d.color || CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={12}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rot} ${cx} ${cy})`}
            strokeLinecap="butt"
          >
            <title>{d.name}: {d.value}</title>
          </circle>
        );
      })}
      <text x={cx} y={cy-6} textAnchor="middle"
        style={{ fontSize:14, fontWeight:700, fill:"#E8EFF8" }}>
        {total}
      </text>
      <text x={cx} y={cy+8} textAnchor="middle"
        style={{ fontSize:7, fill:"#6B7E95" }}>
        TRAYS
      </text>
    </svg>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────
function ChartCard({ title, children, style = {} }) {
  return (
    <div style={{
      background:"#111827", border:"1px solid #1E2D42",
      borderRadius:12, padding:"16px 16px 14px", ...style,
    }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#6B7E95",
                    textTransform:"uppercase", letterSpacing:".06em", marginBottom:14 }}>
        {title}
      </div>
      {children}
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
      <div style={{ padding:40, color:"#6B7E95" }}>
        <span className="spin"/> Loading dashboard…
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

  // ── Chart data ──────────────────────────────────────────────────────────────

  // Donut: stage distribution
  const donutData = stages
    .filter(s => (stats.stage_counts?.[s.id]||0) > 0)
    .map((s, i) => ({
      name:  s.label,
      value: stats.stage_counts?.[s.id] || 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  // Daily scans: last 7 days
  const dayMap = {};
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 86400000);
    const key = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short" });
    dayMap[key] = 0;
  }
  scanLog.forEach(e => {
    if (!e.timestamp) return;
    const key = new Date(e.timestamp)
      .toLocaleDateString("en-GB", { day:"2-digit", month:"short" });
    if (key in dayMap) dayMap[key]++;
  });
  const dailyData = Object.entries(dayMap).map(([date, scans]) => ({ date, scans }));

  // Shift breakdown
  const shiftMap = { Morning:0, Afternoon:0, Night:0 };
  trays.forEach(t => {
    const sh = t.shift || "Morning";
    if (sh in shiftMap) shiftMap[sh]++;
  });
  const shiftData = Object.entries(shiftMap).map(([shift, count]) => ({ shift, count }));

  // Units by project
  const projMap = {};
  trays.forEach(t => {
    if (!t.project) return;
    projMap[t.project] = (projMap[t.project]||0) + (t.total_units||0);
  });
  const projData = Object.entries(projMap)
    .map(([project, units]) => ({ project, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 6);

  return (
    <div>
      {/* ── Project filter pills ── */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20, alignItems:"center" }}>
        <span style={{ fontSize:12, color:"#6B7E95", fontWeight:600 }}>Project:</span>
        <button onClick={() => handleProjectSelect(null)} style={pill(!selectedProject)}>
          All Projects
        </button>
        {projects.map(p => (
          <button key={p.id} onClick={() => handleProjectSelect(p.id)}
            style={pill(selectedProject === p.id)}>
            {p.label}
          </button>
        ))}
        <button className="btn" style={{ marginLeft:"auto" }}
          onClick={() => load(selectedProject)} disabled={loading}>
          {loading ? <span className="spin"/> : "↻"} Refresh
        </button>
      </div>

      {/* ── KPI stat cards ── */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit, minmax(165px, 1fr))",
        gap:12, marginBottom:20,
      }}>
        <StatCard label="Active in Pipeline" value={stats.total_active}
          sub="trays in progress" extraValue={stats.total_active_units}
          color="#378ADD" icon="⚙"/>
        <StatCard label="Completed Today" value={stats.completed_today}
          sub="finished today" extraValue={stats.completed_today_units}
          color="#3B6D11" icon="✅"/>
        <StatCard label="FIFO Violations" value={stats.fifo_violated}
          sub="flagged trays"
          color={stats.fifo_violated > 0 ? "#E24B4A" : "#3B6D11"} icon="⚠"/>
        <StatCard label="Stuck / Bottlenecks" value={stats.stuck_count}
          sub="idle 1h+"
          color={stats.stuck_count > 0 ? "#BA7517" : "#3B6D11"} icon="🕐"/>
        <StatCard label="Total Complete" value={stats.total_complete}
          sub={`${pct}% of all trays`} extraValue={stats.total_complete_units}
          color="#3B6D11" icon="🏁"/>
      </div>

      {/* ── Colorful pipeline stage cards ── */}
      <div style={{
        background:"#111827", border:"1px solid #1E2D42",
        borderRadius:12, padding:16, marginBottom:20,
      }}>
        <div style={{
          fontSize:11, fontWeight:700, color:"#6B7E95",
          textTransform:"uppercase", letterSpacing:".06em",
          marginBottom:14, display:"flex", alignItems:"center", gap:8,
        }}>
          Pipeline Stages
          {activeProject && (
            <span className="tag tag-blue" style={{ textTransform:"none" }}>
              {activeProject.label}
            </span>
          )}
          <span style={{ flex:1, height:1, background:"#1E2D42" }}/>
        </div>

        {/* Scrollable stage cards row */}
        <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:6 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
              {i > 0 && (
                <span style={{ color:"#6B7E95", fontSize:16, flexShrink:0 }}>›</span>
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
        <div style={{ marginTop:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between",
                        fontSize:12, marginBottom:6, color:"#6B7E95" }}>
            <span>Overall throughput</span>
            <span>
              <span style={{ fontWeight:700, color:"#E8EFF8" }}>{pct}%</span>
              {(stats.total_complete_units||0) > 0 && (
                <span style={{ marginLeft:10, color:"#3B6D11", fontWeight:600 }}>
                  · {stats.total_complete_units.toLocaleString()} units completed
                </span>
              )}
            </span>
          </div>
          <div style={{ height:6, background:"#1E2D42", borderRadius:3, overflow:"hidden" }}>
            <div style={{
              height:"100%", width:pct+"%",
              background:"linear-gradient(90deg,#27500A,#5DCAA5)",
              borderRadius:3, transition:"width .5s",
            }}/>
          </div>
        </div>
      </div>

      {/* ── Charts 2×2 grid ── */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))",
        gap:16, marginBottom:20,
      }}>
        {/* 1. Donut — stage distribution */}
        <ChartCard title="Stage Distribution">
          {donutData.length === 0 ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>
              No active trays
            </div>
          ) : (
            <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
              <DonutChart data={donutData} size={130}/>
              <div style={{ flex:1, minWidth:100 }}>
                {donutData.map((d, i) => (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:7,
                    marginBottom:5, fontSize:11,
                  }}>
                    <div style={{
                      width:8, height:8, borderRadius:"50%",
                      background:d.color, flexShrink:0,
                    }}/>
                    <span style={{ color:"#6B7E95", flex:1, overflow:"hidden",
                                   textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {d.name}
                    </span>
                    <span style={{ color:"#E8EFF8", fontWeight:700 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* 2. Daily scan activity */}
        <ChartCard title="Daily Scan Activity (7 days)">
          {dailyData.every(d => d.scans === 0) ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>
              No scan data yet
            </div>
          ) : (
            <BarChart
              data={dailyData} valueKey="scans" labelKey="date"
              colors={dailyData.map((_, i) =>
                i === dailyData.length - 1 ? "#5DCAA5" : "#378ADD"
              )}
              height={140}
            />
          )}
        </ChartCard>

        {/* 3. Trays by shift */}
        <ChartCard title="Trays by Shift">
          {shiftData.every(d => d.count === 0) ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>
              No data yet
            </div>
          ) : (
            <BarChart
              data={shiftData} valueKey="count" labelKey="shift"
              colors={["#378ADD","#EF9F27","#7F77DD"]}
              height={140}
            />
          )}
        </ChartCard>

        {/* 4. Units by project */}
        <ChartCard title="Units by Project">
          {projData.length === 0 ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>
              No data yet
            </div>
          ) : (
            <BarChart
              data={projData} valueKey="units" labelKey="project"
              colors={CHART_COLORS}
              height={140}
            />
          )}
        </ChartCard>
      </div>

      {/* ── Active tray groups ── */}
      <div style={{ marginBottom:12 }}>
        <div className="card-title" style={{ margin:0 }}>
          Active Trays by Stage
          {activeProject && (
            <span style={{ fontSize:11, color:"#6B7E95", fontWeight:400, marginLeft:8 }}>
              — {activeProject.label}
            </span>
          )}
        </div>
      </div>

      {Object.keys(byStage).length === 0 ? (
        <div style={{ color:"#6B7E95", textAlign:"center", padding:40 }}>
          {activeProject
            ? `No active trays for ${activeProject.label}.`
            : "No active trays in the pipeline."}
        </div>
      ) : (
        stages
          .filter(s => byStage[s.id])
          .map(s => (
            <StageGroup key={s.id} stage={s} trays={byStage[s.id]}/>
          ))
      )}
    </div>
  );
}

function pill(active) {
  return {
    padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:600,
    cursor:"pointer", border:"1px solid", fontFamily:"inherit", transition:"all .15s",
    background:  active ? "rgba(55,138,221,.15)" : "#111827",
    borderColor: active ? "#378ADD" : "#1E2D42",
    color:       active ? "#378ADD" : "#6B7E95",
  };
}