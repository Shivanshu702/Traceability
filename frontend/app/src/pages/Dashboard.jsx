import { useEffect, useState } from "react";
import { getStats, getAllTrays, getPipeline, getScanLog } from "../api/api";

// ── Stage color themes ─────────────────────────────────────────────────────────
const THEME = {
  CREATED:    { bg:"#0E1520", accent:"#6B7E95", border:"#6B7E9540" },
  RACK1_TOP:  { bg:"#091525", accent:"#378ADD", border:"#378ADD40" },
  RACK2_BTM:  { bg:"#100E2A", accent:"#7F77DD", border:"#7F77DD40" },
  BAT_MOUNT:  { bg:"#1A1000", accent:"#EF9F27", border:"#EF9F2740" },
  BAT_SOL_R:  { bg:"#1A0808", accent:"#E24B4A", border:"#E24B4A40" },
  BAT_SOL_M:  { bg:"#061A14", accent:"#5DCAA5", border:"#5DCAA540" },
  RACK3:      { bg:"#190A14", accent:"#D4537E", border:"#D4537E40" },
  DEPANEL_IN: { bg:"#150D00", accent:"#BA7517", border:"#BA751740" },
  TESTING:    { bg:"#050D1C", accent:"#185FA5", border:"#185FA540" },
  COMPLETE:   { bg:"#061309", accent:"#3B6D11", border:"#3B6D1140" },
};

const CHART_COLORS = [
  "#378ADD","#7F77DD","#EF9F27","#E24B4A",
  "#5DCAA5","#D4537E","#BA7517","#3B6D11","#888780",
];

// SVG icons
const ICONS = {
  grid:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  units:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  active: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  done:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6L9 17l-5-5"/></svg>,
  fifo:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
  scan:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12H3M21 12h-2"/></svg>,
  expand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  close:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
};

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, main, sub1, sub2, color, icon }) {
  return (
    <div style={{
      background:"#0D1320", border:`1px solid ${color}55`,
      borderTop:`2px solid ${color}`, borderRadius:12,
      padding:"18px 18px 16px", position:"relative",
      overflow:"hidden", minWidth:0, flex:"1 1 140px",
    }}>
      <div style={{
        position:"absolute", top:-20, right:-20, width:80, height:80,
        borderRadius:"50%", background:color+"12", pointerEvents:"none",
      }}/>
      <div style={{ position:"absolute", top:14, right:14, color, opacity:0.7 }}>
        {icon}
      </div>
      <div style={{
        fontSize:10, fontWeight:700, color:"#6B7E95",
        textTransform:"uppercase", letterSpacing:".08em", marginBottom:10,
      }}>
        {label}
      </div>
      <div style={{ fontSize:38, fontWeight:700, color, lineHeight:1, marginBottom:6 }}>
        {main}
      </div>
      {sub1 && <div style={{ fontSize:12, color:"#6B7E95", marginBottom:2 }}>{sub1}</div>}
      {sub2 && <div style={{ fontSize:11, color:color+"cc", fontWeight:600 }}>{sub2}</div>}
    </div>
  );
}

// ── Pipeline stage card ────────────────────────────────────────────────────────
function StageCard({ stage, count, units, totalTrays, onExpand }) {
  const t   = THEME[stage.id] || THEME.CREATED;
  const pct = totalTrays > 0 ? Math.round((count / totalTrays) * 100) : 0;
  return (
    <div style={{
      background:t.bg, border:`1px solid ${t.border}`,
      borderRadius:10, padding:"12px 12px 9px",
      minWidth:108, flex:"1 1 108px",
      display:"flex", flexDirection:"column", gap:3,
      position:"relative", overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", top:-14, right:-14, width:52, height:52,
        borderRadius:"50%", background:t.accent+"1A", pointerEvents:"none",
      }}/>
      {onExpand && (
        <button
          onClick={e => { e.stopPropagation(); onExpand(); }}
          title="View branch breakdown"
          style={{
            position:"absolute", top:6, right:6,
            background:t.accent+"22", border:`1px solid ${t.accent}44`,
            borderRadius:5, padding:"2px 4px", cursor:"pointer",
            color:t.accent, display:"flex", alignItems:"center", zIndex:2,
          }}
        >
          {ICONS.expand}
        </button>
      )}
      <div style={{
        fontSize:9, fontWeight:700, color:t.accent,
        textTransform:"uppercase", letterSpacing:".05em",
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        marginBottom:3, paddingRight:onExpand ? 20 : 0,
      }}>
        {stage.label}
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontSize:26, fontWeight:700, color:t.accent, lineHeight:1 }}>{count}</span>
        <span style={{ fontSize:10, color:t.accent+"77" }}>trays</span>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontSize:13, fontWeight:600, color:t.accent+"aa" }}>
          {(units||0).toLocaleString()}
        </span>
        <span style={{ fontSize:10, color:t.accent+"55" }}>units</span>
      </div>
      <div style={{ marginTop:7 }}>
        <div style={{ height:2, background:t.accent+"1A", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:pct+"%", background:t.accent, borderRadius:2 }}/>
        </div>
        <div style={{ fontSize:8, color:t.accent+"66", marginTop:2, textAlign:"right" }}>
          {pct}%
        </div>
      </div>
    </div>
  );
}

// ── Branch breakdown modal (BAT_MOUNT expand in pipeline bar) ─────────────────
function BranchModal({ stats, onClose }) {
  const solRCount = stats?.stage_counts?.["BAT_SOL_R"] || 0;
  const solMCount = stats?.stage_counts?.["BAT_SOL_M"] || 0;
  const solRUnits = stats?.stage_units?.["BAT_SOL_R"]  || 0;
  const solMUnits = stats?.stage_units?.["BAT_SOL_M"]  || 0;
  const batCount  = stats?.stage_counts?.["BAT_MOUNT"]  || 0;
  const batUnits  = stats?.stage_units?.["BAT_MOUNT"]   || 0;
  const total     = solRCount + solMCount + batCount;
  const totalU    = solRUnits + solMUnits + batUnits;

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.8)",
      zIndex:1000, display:"flex", alignItems:"center",
      justifyContent:"center", padding:24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#0D1320", border:"1px solid #EF9F2744",
        borderTop:"3px solid #EF9F27", borderRadius:16,
        padding:"24px 28px", width:"min(540px,96vw)",
      }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#EF9F27" }}>
              Battery Mounted — Branch Breakdown
            </div>
            <div style={{ fontSize:11, color:"#6B7E95", marginTop:3 }}>
              {total} total trays · {totalU.toLocaleString()} total units
            </div>
          </div>
          <button onClick={onClose} style={{
            marginLeft:"auto", background:"none",
            border:"none", cursor:"pointer", color:"#6B7E95",
          }}>
            {ICONS.close}
          </button>
        </div>

        {batCount > 0 && (
          <div style={{
            background:"#1A1000", border:"1px solid #EF9F2733",
            borderLeft:"3px solid #EF9F27", borderRadius:10,
            padding:"14px 18px", marginBottom:14,
          }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#EF9F27", marginBottom:8 }}>
              ⏳ Awaiting Branch Selection
            </div>
            <div style={{ display:"flex", gap:24 }}>
              <div>
                <div style={{ fontSize:28, fontWeight:700, color:"#EF9F27" }}>{batCount}</div>
                <div style={{ fontSize:10, color:"#EF9F2766" }}>trays</div>
              </div>
              <div>
                <div style={{ fontSize:28, fontWeight:700, color:"#EF9F27aa" }}>
                  {batUnits.toLocaleString()}
                </div>
                <div style={{ fontSize:10, color:"#EF9F2744" }}>units</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {/* Robot */}
          <div style={{
            background:"#1A0808", border:"1px solid #E24B4A33",
            borderTop:"3px solid #E24B4A", borderRadius:10, padding:"16px 18px",
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#E24B4A", marginBottom:12 }}>
              🤖 Soldered by Robot
            </div>
            <div style={{ display:"flex", gap:20 }}>
              <div>
                <div style={{ fontSize:32, fontWeight:700, color:"#E24B4A", lineHeight:1 }}>
                  {solRCount}
                </div>
                <div style={{ fontSize:10, color:"#E24B4A77", marginTop:3 }}>trays</div>
              </div>
              <div>
                <div style={{ fontSize:32, fontWeight:700, color:"#E24B4Aaa", lineHeight:1 }}>
                  {solRUnits.toLocaleString()}
                </div>
                <div style={{ fontSize:10, color:"#E24B4A55", marginTop:3 }}>units</div>
              </div>
            </div>
            {total > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ height:3, background:"#E24B4A1A", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:Math.round((solRCount/total)*100)+"%", background:"#E24B4A", borderRadius:2 }}/>
                </div>
                <div style={{ fontSize:9, color:"#E24B4A88", marginTop:3 }}>
                  {Math.round((solRCount/total)*100)}% of total
                </div>
              </div>
            )}
          </div>
          {/* Manual */}
          <div style={{
            background:"#061A14", border:"1px solid #5DCAA533",
            borderTop:"3px solid #5DCAA5", borderRadius:10, padding:"16px 18px",
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#5DCAA5", marginBottom:12 }}>
              ✋ Soldered by Hand
            </div>
            <div style={{ display:"flex", gap:20 }}>
              <div>
                <div style={{ fontSize:32, fontWeight:700, color:"#5DCAA5", lineHeight:1 }}>
                  {solMCount}
                </div>
                <div style={{ fontSize:10, color:"#5DCAA577", marginTop:3 }}>trays</div>
              </div>
              <div>
                <div style={{ fontSize:32, fontWeight:700, color:"#5DCAA5aa", lineHeight:1 }}>
                  {solMUnits.toLocaleString()}
                </div>
                <div style={{ fontSize:10, color:"#5DCAA555", marginTop:3 }}>units</div>
              </div>
            </div>
            {total > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ height:3, background:"#5DCAA51A", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:Math.round((solMCount/total)*100)+"%", background:"#5DCAA5", borderRadius:2 }}/>
                </div>
                <div style={{ fontSize:9, color:"#5DCAA588", marginTop:3 }}>
                  {Math.round((solMCount/total)*100)}% of total
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop:16, fontSize:10, color:"#6B7E95", textAlign:"center" }}>
          Click outside to close
        </div>
      </div>
    </div>
  );
}

// ── Stage group (normal expandable list — same for all stages) ─────────────────
function StageGroup({ stage, trays }) {
  const [open, setOpen] = useState(false);
  const t          = THEME[stage.id] || THEME.CREATED;
  const totalUnits = trays.reduce((s, t) => s + (t.total_units || 0), 0);

  return (
    <div style={{
      border:`1px solid ${t.border}`, borderLeft:`3px solid ${t.accent}`,
      borderRadius:10, marginBottom:8, overflow:"hidden",
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"11px 14px", cursor:"pointer", background:t.bg,
      }}>
        <span style={{ fontSize:13, fontWeight:600, flex:1, color:"#E8EFF8" }}>
          {stage.label}
        </span>
        <span style={{
          background:t.accent+"2A", color:t.accent,
          borderRadius:12, padding:"2px 9px", fontSize:11, fontWeight:700,
        }}>
          {trays.length} tray{trays.length !== 1 ? "s" : ""}
        </span>
        <span style={{
          background:t.accent+"15", color:t.accent,
          border:`1px solid ${t.accent}33`,
          borderRadius:10, padding:"2px 9px", fontSize:11, fontWeight:600,
        }}>
          {totalUnits.toLocaleString()} units
        </span>
        <span style={{ color:"#6B7E95", fontSize:12 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ background:"#080C14", padding:"4px 14px 12px" }}>
          <table className="tbl" style={{ marginTop:8 }}>
            <thead>
              <tr>
                <th>Tray ID</th><th>Stage</th><th>Project</th>
                <th>Units</th><th>Shift</th><th>FIFO</th><th>Age (h)</th>
              </tr>
            </thead>
            <tbody>
              {trays.map(tr => {
                const ageH = tr.last_updated
                  ? Math.round(((Date.now() - new Date(tr.last_updated)) / 3600000) * 10) / 10
                  : "—";
                const stg  = THEME[tr.stage] || THEME.CREATED;
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
                    <td>
                      <span style={{
                        background:stg.accent+"22", color:stg.accent,
                        borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:600,
                      }}>
                        {tr.stage}
                      </span>
                    </td>
                    <td style={{ fontSize:12 }}>{tr.project || "—"}</td>
                    <td style={{ fontWeight:600, color:"#85B7EB" }}>
                      {(tr.total_units || 0).toLocaleString()}
                    </td>
                    <td style={{ fontSize:12 }}>{tr.shift || "—"}</td>
                    <td>
                      {tr.fifo_violated
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

// ── Pure CSS bar chart ─────────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, colors, height = 140 }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height, paddingTop:18 }}>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const pct = (val / max) * 100;
        const col = Array.isArray(colors) ? colors[i % colors.length] : colors;
        return (
          <div key={i} style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", gap:4, height:"100%",
          }}>
            <div style={{ flex:1, display:"flex", alignItems:"flex-end", width:"100%" }}>
              <div style={{
                width:"100%", height:pct + "%", minHeight:val > 0 ? 4 : 0,
                background:col, borderRadius:"4px 4px 0 0",
                transition:"height .4s", position:"relative",
              }}>
                {val > 0 && (
                  <div style={{
                    position:"absolute", top:-16, left:"50%",
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
              textOverflow:"ellipsis", width:"100%",
            }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── SVG donut chart ────────────────────────────────────────────────────────────
function DonutChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return (
    <div style={{ width:size, height:size, display:"flex",
                  alignItems:"center", justifyContent:"center",
                  color:"#6B7E95", fontSize:11 }}>
      No data
    </div>
  );
  const r = 44, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E2D42" strokeWidth={11}/>
      {data.map((d, i) => {
        const pct  = d.value / total;
        const dash = pct * circ;
        const rot  = offset * 360 - 90;
        offset += pct;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color || CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={11}
            strokeDasharray={`${dash} ${circ - dash}`}
            transform={`rotate(${rot} ${cx} ${cy})`}>
            <title>{d.name}: {d.value}</title>
          </circle>
        );
      })}
      <text x={cx} y={cy - 5} textAnchor="middle"
        style={{ fontSize:15, fontWeight:700, fill:"#E8EFF8" }}>{total}</text>
      <text x={cx} y={cy + 8} textAnchor="middle"
        style={{ fontSize:7, fill:"#6B7E95" }}>TRAYS</text>
    </svg>
  );
}

// ── Expandable chart card ──────────────────────────────────────────────────────
function ChartCard({ title, children, expandContent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div style={{
        background:"#0D1320", border:"1px solid #1E2D42",
        borderRadius:12, padding:"14px 14px 12px",
      }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:14 }}>
          <div style={{
            fontSize:10, fontWeight:700, color:"#6B7E95",
            textTransform:"uppercase", letterSpacing:".08em", flex:1,
          }}>
            {title}
          </div>
          {expandContent && (
            <button onClick={() => setExpanded(true)} title="Expand" style={{
              background:"none", border:"1px solid #1E2D42", borderRadius:6,
              padding:"3px 6px", cursor:"pointer", color:"#6B7E95",
              display:"flex", alignItems:"center",
            }}>
              {ICONS.expand}
            </button>
          )}
        </div>
        {children}
      </div>
      {expanded && (
        <div onClick={() => setExpanded(false)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.75)",
          zIndex:1000, display:"flex", alignItems:"center",
          justifyContent:"center", padding:24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"#0D1320", border:"1px solid #1E2D42",
            borderRadius:16, padding:"24px 28px",
            width:"min(760px,96vw)", maxHeight:"85vh", overflow:"auto",
          }}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#E8EFF8", flex:1 }}>{title}</div>
              <button onClick={() => setExpanded(false)} style={{
                background:"none", border:"none", cursor:"pointer",
                color:"#6B7E95", display:"flex",
              }}>
                {ICONS.close}
              </button>
            </div>
            {expandContent || children}
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats,           setStats]           = useState(null);
  const [trays,           setTrays]           = useState([]);
  const [pipeline,        setPipeline]        = useState(null);
  const [scanLog,         setScanLog]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [branchModal,     setBranchModal]     = useState(false);

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

  // Exclude SPLIT parent trays from all counts to prevent double-counting
  const nonSplitTrays = trays.filter(t => t.stage !== "SPLIT");
  const activeTrays   = nonSplitTrays.filter(t => t.stage !== "COMPLETE");

  // Group active trays by stage
  const byStage = {};
  activeTrays.forEach(t => {
    byStage[t.stage] = byStage[t.stage] || [];
    byStage[t.stage].push(t);
  });

  // BAT_MOUNT group merges BAT_MOUNT + BAT_SOL_R + BAT_SOL_M into one row
  const batMountDisplay = [
    ...(byStage["BAT_MOUNT"] || []),
    ...(byStage["BAT_SOL_R"] || []),
    ...(byStage["BAT_SOL_M"] || []),
  ];

  // BAT_MOUNT pipeline card shows combined count of all three sub-stages
  const batMountCount = (stats.stage_counts?.["BAT_MOUNT"] || 0)
                      + (stats.stage_counts?.["BAT_SOL_R"] || 0)
                      + (stats.stage_counts?.["BAT_SOL_M"] || 0);
  const batMountUnits = (stats.stage_units?.["BAT_MOUNT"]  || 0)
                      + (stats.stage_units?.["BAT_SOL_R"]  || 0)
                      + (stats.stage_units?.["BAT_SOL_M"]  || 0);

  const total         = stats.total_active + stats.total_complete;
  const pct           = total > 0 ? Math.round((stats.total_complete / total) * 100) : 0;
  const totalUnitsAll = nonSplitTrays.reduce((s, t) => s + (t.total_units || 0), 0);
  const totalScans    = scanLog.length;
  const fifoRate      = total > 0
    ? Math.round(((total - (stats.fifo_violated || 0)) / total) * 100)
    : 100;
  const activeProject = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  // Chart data
  const donutData = stages
    .filter(s => (stats.stage_counts?.[s.id] || 0) > 0)
    .map((s, i) => ({
      name:  s.label, value: stats.stage_counts?.[s.id] || 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  const dayMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    dayMap[d.toLocaleDateString("en-GB", { day:"2-digit", month:"short" })] = 0;
  }
  scanLog.forEach(e => {
    if (!e.timestamp) return;
    const key = new Date(e.timestamp).toLocaleDateString("en-GB", { day:"2-digit", month:"short" });
    if (key in dayMap) dayMap[key]++;
  });
  const dailyData = Object.entries(dayMap).map(([date, scans]) => ({ date, scans }));

  const shiftMap = { Morning:0, Afternoon:0, Night:0 };
  nonSplitTrays.forEach(t => { const sh = t.shift || "Morning"; if (sh in shiftMap) shiftMap[sh]++; });
  const shiftData = Object.entries(shiftMap).map(([shift, count]) => ({ shift, count }));

  const projMap = {};
  nonSplitTrays.forEach(t => {
    if (!t.project) return;
    projMap[t.project] = (projMap[t.project] || 0) + (t.total_units || 0);
  });
  const projData = Object.entries(projMap)
    .map(([project, units]) => ({ project, units }))
    .sort((a, b) => b.units - a.units).slice(0, 8);

  return (
    <div>
      {/* Project filter pills */}
      <div style={{
        display:"flex", gap:8, flexWrap:"wrap",
        marginBottom:20, alignItems:"center",
      }}>
        <span style={{
          fontSize:11, fontWeight:700, color:"#6B7E95",
          textTransform:"uppercase", letterSpacing:".06em",
        }}>
          Project
        </span>
        <button onClick={() => handleProjectSelect(null)} style={pill(!selectedProject)}>
          All
        </button>
        {projects.map(p => (
          <button key={p.id} onClick={() => handleProjectSelect(p.id)}
            style={pill(selectedProject === p.id)}>
            {p.label}
          </button>
        ))}
        <button className="btn" style={{ marginLeft:"auto", fontSize:12 }}
          onClick={() => load(selectedProject)} disabled={loading}>
          {loading ? <span className="spin"/> : "↻"} Refresh
        </button>
      </div>

      {/* 6 KPI stat cards */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <StatCard label="Total Trays"       main={total}
          sub1={`${totalUnitsAll.toLocaleString()} units`}
          color="#378ADD" icon={ICONS.grid} />
        <StatCard label="Total Units"       main={totalUnitsAll.toLocaleString()}
          sub1={`${(stats.total_complete_units || 0).toLocaleString()} units completed`}
          color="#7F77DD" icon={ICONS.units} />
        <StatCard label="Active in Pipeline" main={stats.total_active}
          sub1={`${(stats.total_active_units || 0).toLocaleString()} units in progress`}
          color="#EF9F27" icon={ICONS.active} />
        <StatCard label="Done Today"        main={stats.completed_today}
          sub1={`${(stats.completed_today_units || 0).toLocaleString()} units out`}
          color="#3B6D11" icon={ICONS.done} />
        <StatCard label="FIFO Rate"         main={`${fifoRate}%`}
          sub1={`${stats.fifo_violated || 0} violations`}
          color={fifoRate < 90 ? "#E24B4A" : "#5DCAA5"} icon={ICONS.fifo} />
        <StatCard label="Total Scans"       main={totalScans}
          sub1="across all trays"
          color="#D4537E" icon={ICONS.scan} />
      </div>

      {/* Colorful pipeline stage cards */}
      <div style={{
        background:"#0D1320", border:"1px solid #1E2D42",
        borderRadius:12, padding:16, marginBottom:20,
      }}>
        <div style={{
          fontSize:10, fontWeight:700, color:"#6B7E95",
          textTransform:"uppercase", letterSpacing:".08em",
          marginBottom:14, display:"flex", alignItems:"center", gap:10,
        }}>
          Pipeline Stages
          {activeProject && (
            <span className="tag tag-blue" style={{ textTransform:"none", fontSize:11 }}>
              {activeProject.label}
            </span>
          )}
          <span style={{ flex:1, height:1, background:"#1E2D42" }}/>
          <span style={{ color:"#6B7E95", fontWeight:400, fontSize:10 }}>{pct}% complete</span>
        </div>

        <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6 }}>
              {i > 0 && <span style={{ color:"#6B7E95", fontSize:14, flexShrink:0 }}>›</span>}
              <StageCard
                stage={s}
                count={s.id === "BAT_MOUNT" ? batMountCount : (stats.stage_counts?.[s.id] || 0)}
                units={s.id === "BAT_MOUNT" ? batMountUnits : (stats.stage_units?.[s.id]  || 0)}
                totalTrays={total}
                onExpand={s.id === "BAT_MOUNT" ? () => setBranchModal(true) : undefined}
              />
            </div>
          ))}
        </div>

        {/* Branch modal */}
        {branchModal && <BranchModal stats={stats} onClose={() => setBranchModal(false)} />}

        {/* Throughput bar */}
        <div style={{ marginTop:14 }}>
          <div style={{ height:4, background:"#1E2D42", borderRadius:3, overflow:"hidden" }}>
            <div style={{
              height:"100%", width:pct + "%",
              background:"linear-gradient(90deg,#27500A,#5DCAA5)",
              borderRadius:3, transition:"width .5s",
            }}/>
          </div>
          <div style={{
            display:"flex", justifyContent:"space-between",
            fontSize:10, color:"#6B7E95", marginTop:5,
          }}>
            <span>0%</span>
            <span style={{ color:"#3B6D11", fontWeight:700 }}>
              {(stats.total_complete_units || 0).toLocaleString()} units completed
            </span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Charts 2×2 */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))",
        gap:14, marginBottom:20,
      }}>
        <ChartCard title="Stage Distribution"
          expandContent={
            <div style={{ display:"flex", gap:24, flexWrap:"wrap", alignItems:"flex-start" }}>
              <DonutChart data={donutData} size={200}/>
              <div style={{ flex:1, minWidth:160 }}>
                {donutData.map((d, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:d.color, flexShrink:0 }}/>
                    <span style={{ fontSize:13, color:"#6B7E95", flex:1 }}>{d.name}</span>
                    <span style={{ fontSize:13, color:"#E8EFF8", fontWeight:700 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          {donutData.length === 0 ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>No active trays</div>
          ) : (
            <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
              <DonutChart data={donutData} size={110}/>
              <div style={{ flex:1, minWidth:80 }}>
                {donutData.slice(0, 5).map((d, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:d.color, flexShrink:0 }}/>
                    <span style={{ fontSize:10, color:"#6B7E95", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {d.name}
                    </span>
                    <span style={{ fontSize:10, color:"#E8EFF8", fontWeight:700 }}>{d.value}</span>
                  </div>
                ))}
                {donutData.length > 5 && (
                  <div style={{ fontSize:9, color:"#6B7E95", marginTop:4 }}>+{donutData.length - 5} more</div>
                )}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Daily Scan Activity (7 days)"
          expandContent={
            <BarChart data={dailyData} valueKey="scans" labelKey="date"
              colors={dailyData.map((_, i) => i === dailyData.length - 1 ? "#5DCAA5" : "#378ADD")}
              height={220}/>
          }
        >
          {dailyData.every(d => d.scans === 0) ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>No scan data yet</div>
          ) : (
            <BarChart data={dailyData} valueKey="scans" labelKey="date"
              colors={dailyData.map((_, i) => i === dailyData.length - 1 ? "#5DCAA5" : "#378ADD")}
              height={130}/>
          )}
        </ChartCard>

        <ChartCard title="Trays by Shift"
          expandContent={<BarChart data={shiftData} valueKey="count" labelKey="shift"
            colors={["#378ADD","#EF9F27","#7F77DD"]} height={220}/>}
        >
          {shiftData.every(d => d.count === 0) ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>No data yet</div>
          ) : (
            <BarChart data={shiftData} valueKey="count" labelKey="shift"
              colors={["#378ADD","#EF9F27","#7F77DD"]} height={130}/>
          )}
        </ChartCard>

        <ChartCard title="Units by Project"
          expandContent={<BarChart data={projData} valueKey="units" labelKey="project"
            colors={CHART_COLORS} height={220}/>}
        >
          {projData.length === 0 ? (
            <div style={{ color:"#6B7E95", fontSize:12, textAlign:"center", padding:20 }}>No data yet</div>
          ) : (
            <BarChart data={projData} valueKey="units" labelKey="project"
              colors={CHART_COLORS} height={130}/>
          )}
        </ChartCard>
      </div>

      {/* Active tray groups */}
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
          {activeProject ? `No active trays for ${activeProject.label}.` : "No active trays in the pipeline."}
        </div>
      ) : (
        stages.map(s => {
          // BAT_MOUNT: merge all three sub-stages into one normal group
          if (s.id === "BAT_MOUNT") {
            if (batMountDisplay.length === 0) return null;
            return (
              <StageGroup key="bat_group"
                stage={{ ...s, label:"Battery Mounted & Soldering" }}
                trays={batMountDisplay}
              />
            );
          }
          // Hide BAT_SOL_R and BAT_SOL_M as standalone (merged under BAT_MOUNT)
          if (s.id === "BAT_SOL_R" || s.id === "BAT_SOL_M") return null;
          if (!byStage[s.id]) return null;
          return <StageGroup key={s.id} stage={s} trays={byStage[s.id]} />;
        })
      )}
    </div>
  );
}

function pill(active) {
  return {
    padding:"4px 14px", borderRadius:20, fontSize:12, fontWeight:600,
    cursor:"pointer", border:"1px solid", fontFamily:"inherit",
    background:  active ? "rgba(55,138,221,.15)" : "transparent",
    borderColor: active ? "#378ADD" : "#1E2D42",
    color:       active ? "#378ADD" : "#6B7E95",
  };
}