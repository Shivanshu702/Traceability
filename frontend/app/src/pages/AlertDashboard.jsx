import { useEffect, useRef, useState } from "react";
import { getAlerts, getStageLoad, getAnalytics } from "../api/api";

export default function AlertDashboard() {
  const [alerts,    setAlerts]    = useState([]);
  const [load,      setLoad]      = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [hasCritical, setHasCritical] = useState(false);
  const audioRef       = useRef(null);
  const prevAlertCount = useRef(0);

  async function fetchData() {
    try {
      const [alertData, loadData, analyticsData] = await Promise.all([
        getAlerts(), getStageLoad(), getAnalytics(),
      ]);

      const newAlerts = alertData.alerts || [];

      // Play sound if new alerts appeared
      if (newAlerts.length > prevAlertCount.current && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      prevAlertCount.current = newAlerts.length;

      setHasCritical(newAlerts.some((a) => a.delay_seconds > 3600));
      setAlerts(newAlerts);
      setLoad(loadData || {});
      setAnalytics(analyticsData || null);
    } catch (e) {
      console.error("AlertDashboard fetch error:", e);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000); // poll every 10s
    return () => clearInterval(id);
  }, []);

  function fmtTime(sec) {
    if (sec < 60)   return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <audio ref={audioRef} src="/alert.mp3" preload="auto" />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        animation: hasCritical ? "blink 1s infinite" : "none",
      }}>
        <h2 style={{ color: "var(--text)" }}>🚨 Factory Alerts</h2>
        {hasCritical && (
          <span className="tag tag-red" style={{ fontSize: 12 }}>CRITICAL</span>
        )}
      </div>

      {/* Analytics summary */}
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

      {/* Bottleneck alerts */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">⚠ Bottleneck Alerts ({alerts.length})</div>

        {alerts.length === 0 ? (
          <div className="ok-box">✅ No bottlenecks — all trays moving normally</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Tray ID</th>
                <th>Stage</th>
                <th>Project</th>
                <th>Stuck for</th>
              </tr>
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

      {/* Stage load */}
      <div className="card">
        <div className="card-title">📊 Stage Load</div>
        {Object.keys(load).length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No active trays</p>
        ) : (
          Object.entries(load).map(([stage, count]) => {
            const pct = Math.min(count * 10, 100);
            const col = count > 5 ? "#E24B4A" : count > 3 ? "#EF9F27" : "#3B6D11";
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ width: 120, fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>
                  {stage}
                </span>
                <div style={{ flex: 1, background: "var(--border)", height: 8, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: col, borderRadius: 4, transition: "width .4s" }} />
                </div>
                <span style={{ width: 24, textAlign: "right", fontWeight: 700, color: col, fontSize: 13 }}>
                  {count}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Per-stage avg dwell time */}
      {analytics?.avg_stage_time_sec && Object.keys(analytics.avg_stage_time_sec).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">⏱ Avg Dwell Time per Stage</div>
          <table className="tbl">
            <thead>
              <tr><th>Stage</th><th>Avg Time</th></tr>
            </thead>
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