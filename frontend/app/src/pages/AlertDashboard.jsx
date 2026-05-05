// C:\SHIVANSH\Traceability\frontend\app\src\pages\AlertDashboard.jsx //

import { useEffect, useRef, useState } from "react";
import { getAlerts, getStageLoad, getAnalytics, getWeeklyStats } from "../api/api";

const SHIFT_COLORS = {
  Morning:   "#378ADD",
  Afternoon: "#EF9F27",
  Night:     "#7F77DD",
  Unknown:   "#888780",
};

// THEME FIX: bar label color "#6B7E95" → var(--muted)
function BarChart({ data, valueKey, labelKey, colors, height = 120 }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, paddingTop: 20 }}>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const pct = (val / max) * 100;
        const col = Array.isArray(colors) ? colors[i % colors.length] : (colors || "#378ADD");
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                title={`${d[labelKey]}: ${val}`}
                style={{ width: "100%", height: pct + "%", minHeight: val > 0 ? 3 : 0, background: col, borderRadius: "3px 3px 0 0", transition: "height .4s", position: "relative" }}
              >
                {val > 0 && (
                  <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 700, color: col, whiteSpace: "nowrap" }}>
                    {val.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// THEME FIX: empty track was background:"#1E2D42" (always dark) → var(--border)
function StackedBar({ data, total, height = 12 }) {
  if (!total) return <div style={{ height, background: "var(--border)", borderRadius: 6 }} />;
  return (
    <div style={{ display: "flex", height, borderRadius: 6, overflow: "hidden", gap: 1 }}>
      {data.filter(d => d.value > 0).map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value}`} style={{ flex: d.value, background: d.color, transition: "flex .4s" }} />
      ))}
    </div>
  );
}

export default function AlertDashboard() {
  const [alerts,      setAlerts]      = useState([]);
  const [load,        setLoad]        = useState({});
  const [analytics,   setAnalytics]   = useState(null);
  const [weekly,      setWeekly]      = useState(null);
  const [hasCritical, setHasCritical] = useState(false);
  const audioRef       = useRef(null);
  const prevAlertCount = useRef(0);

  async function fetchData() {
    try {
      const [alertData, loadData, analyticsData, weeklyData] = await Promise.all([
        getAlerts(), getStageLoad(), getAnalytics(), getWeeklyStats(),
      ]);
      const newAlerts = alertData.alerts || [];
      if (newAlerts.length > prevAlertCount.current && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      prevAlertCount.current = newAlerts.length;
      setHasCritical(newAlerts.some(a => a.delay_seconds > 3600));
      setAlerts(newAlerts);
      setLoad(loadData || {});
      setAnalytics(analyticsData || null);
      setWeekly(weeklyData || null);
    } catch (e) {
      console.error("AlertDashboard fetch error:", e);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, []);

  function fmtTime(sec) {
    if (sec < 60)   return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  }

  const dailyScanData = (() => {
    const map = {};
    (weekly?.daily_scans || []).forEach(d => { map[d.day] = d.scans; });
    const result = [];
    for (let i = 13; i >= 0; i--) {
      const dt  = new Date(Date.now() - i * 86400000);
      const key = dt.toISOString().slice(0, 10);
      result.push({ date: dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), scans: map[key] || 0 });
    }
    return result;
  })();

  const completionData = (() => {
    const map = {};
    (weekly?.daily_completions || []).forEach(d => { map[d.day] = d.completions; });
    const result = [];
    for (let i = 13; i >= 0; i--) {
      const dt  = new Date(Date.now() - i * 86400000);
      const key = dt.toISOString().slice(0, 10);
      result.push({ date: dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), completions: map[key] || 0 });
    }
    return result;
  })();

  const shiftTotals = (() => {
    const totals = {};
    Object.values(weekly?.shift_by_week || {}).forEach(week => {
      Object.entries(week).forEach(([shift, cnt]) => {
        totals[shift] = (totals[shift] || 0) + cnt;
      });
    });
    return totals;
  })();

  const shiftTotal = Object.values(shiftTotals).reduce((s, v) => s + v, 0);

  return (
    <div style={{ maxWidth: 900 }}>
      {/*
        FIX — 416 Range Not Satisfiable:
        `preload="auto"` caused the browser to immediately send a Range request
        to buffer the audio on mount, before any interaction. If the file is
        0 bytes or the CDN doesn't handle range requests for it, the server
        returns 416. Fix: preload="none" — only fetches when play() is called.
        onerror handler ensures a broken file never throws an unhandled error.
      */}
      <audio
        ref={audioRef}
        src="/alert.mp3"
        preload="none"
        onError={() => console.warn("alert.mp3 could not be loaded — audio notifications disabled.")}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h2 style={{ color: "var(--text)", margin: 0 }}>🚨 Factory Alerts</h2>
        {hasCritical && <span className="tag tag-red" style={{ fontSize: 12 }}>CRITICAL</span>}
        <button className="btn" style={{ marginLeft: "auto", fontSize: 12 }} onClick={fetchData}>↻ Refresh</button>
      </div>

      {analytics && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card" style={{ borderTopColor: "#378ADD" }}>
            <div className="stat-label">Total Trays</div>
            <div className="stat-value" style={{ color: "#378ADD" }}>{analytics.total}</div>
          </div>
          <div className="stat-card" style={{ borderTopColor: "#3B6D11" }}>
            <div className="stat-label">Completed</div>
            <div className="stat-value" style={{ color: "#3B6D11" }}>{analytics.completed}</div>
          </div>
          <div className="stat-card" style={{ borderTopColor: "#EF9F27" }}>
            <div className="stat-label">WIP</div>
            <div className="stat-value" style={{ color: "#EF9F27" }}>{analytics.wip}</div>
          </div>
          <div className="stat-card" style={{ borderTopColor: "#7F77DD" }}>
            <div className="stat-label">Avg Cycle Time</div>
            <div className="stat-value" style={{ color: "#7F77DD", fontSize: 22 }}>
              {fmtTime(Math.round(analytics.avg_cycle_time_sec))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">⚠ Bottleneck Alerts ({alerts.length})</div>
        {alerts.length === 0 ? (
          <div className="ok-box">✅ No bottlenecks — all trays moving normally</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Tray ID</th><th>Stage</th><th>Project</th><th>Stuck for</th></tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i}>
                  <td><span className="mono">{a.tray_id}</span></td>
                  <td><span className="tag tag-amber">{a.stage}</span></td>
                  <td>{a.project || "—"}</td>
                  <td>
                    <span className={`tag ${a.delay_seconds > 3600 ? "tag-red" : "tag-amber"}`}>
                      {fmtTime(a.delay_seconds)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📊 Stage Load</div>
        {Object.keys(load).length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No active trays</p>
        ) : (
          Object.entries(load).map(([stage, count]) => {
            const n   = Number(count);
            const pct = Math.min(n * 10, 100);
            const col = n > 5 ? "#E24B4A" : n > 3 ? "#EF9F27" : "#3B6D11";
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ width: 120, fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{stage}</span>
                <div style={{ flex: 1, background: "var(--border)", height: 8, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: col, borderRadius: 4, transition: "width .4s" }} />
                </div>
                <span style={{ width: 24, textAlign: "right", fontWeight: 700, color: col, fontSize: 13 }}>{n}</span>
              </div>
            );
          })
        )}
      </div>

      {weekly && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">📈 Daily scan activity (14 days)</div>
              {dailyScanData.every(d => d.scans === 0) ? (
                <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No scan data yet</div>
              ) : (
                <BarChart data={dailyScanData} valueKey="scans" labelKey="date"
                  colors={dailyScanData.map((_, i) => i === dailyScanData.length - 1 ? "#5DCAA5" : "#378ADD")} height={120} />
              )}
            </div>
            <div className="card">
              <div className="card-title">✅ Daily completions (14 days)</div>
              {completionData.every(d => d.completions === 0) ? (
                <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No completions yet</div>
              ) : (
                <BarChart data={completionData} valueKey="completions" labelKey="date"
                  colors={completionData.map((_, i) => i === completionData.length - 1 ? "#97C459" : "#3B6D11")} height={120} />
              )}
            </div>
          </div>

          {shiftTotal > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">🌅 Shift comparison</div>
              <div style={{ marginBottom: 12 }}>
                <StackedBar
                  data={Object.entries(shiftTotals).map(([shift, cnt]) => ({
                    label: shift, value: cnt, color: SHIFT_COLORS[shift] || "#888780",
                  }))}
                  total={shiftTotal} height={14}
                />
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {Object.entries(shiftTotals).map(([shift, cnt]) => {
                  const col = SHIFT_COLORS[shift] || "#888780";
                  const pct = shiftTotal > 0 ? Math.round((cnt / shiftTotal) * 100) : 0;
                  return (
                    <div key={shift} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: col, flexShrink: 0 }} />
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{cnt}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>{shift} ({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.keys(weekly.shift_by_week || {}).length > 1 && (
                <div style={{ marginTop: 16, overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "var(--muted)", fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>Week</th>
                        {Object.keys(shiftTotals).map(s => (
                          <th key={s} style={{ padding: "6px 10px", textAlign: "right", color: SHIFT_COLORS[s] || "#888780", fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(weekly.shift_by_week).map(([wk, shifts]) => (
                        <tr key={wk} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 10px", color: "var(--muted)" }}>{wk}</td>
                          {Object.keys(shiftTotals).map(s => (
                            <td key={s} style={{ padding: "6px 10px", textAlign: "right", color: "var(--text)", fontWeight: 600 }}>
                              {shifts[s] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {analytics?.avg_stage_time_sec && Object.keys(analytics.avg_stage_time_sec).length > 0 && (
        <div className="card">
          <div className="card-title">⏱ Avg Dwell Time per Stage</div>
          <table className="tbl">
            <thead><tr><th>Stage</th><th>Avg Time</th></tr></thead>
            <tbody>
              {Object.entries(analytics.avg_stage_time_sec).map(([stage, sec]) => (
                <tr key={stage}>
                  <td>{stage}</td>
                  <td><span className="tag tag-blue">{fmtTime(Math.round(sec))}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}