import { useEffect, useState } from "react";
import { getOperatorStats } from "../api/api";

const SHIFT_COLORS = { Morning: "#378ADD", Afternoon: "#EF9F27", Night: "#7F77DD" };

function BarMini({ data, color = "#378ADD", height = 32 }) {
  if (!data || data.length === 0) return <span style={{ color: "#6B7E95", fontSize: 11 }}>—</span>;
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.v}`} style={{
          flex: 1, height: `${Math.max((d.v / max) * 100, d.v > 0 ? 8 : 0)}%`,
          background: color, borderRadius: "2px 2px 0 0", minHeight: d.v > 0 ? 3 : 0,
          transition: "height .3s",
        }} />
      ))}
    </div>
  );
}

function StatPill({ value, label, color = "#378ADD" }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#6B7E95", marginTop: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
    </div>
  );
}

export default function OperatorReportPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);
  const [sort,    setSort]    = useState("total_scans");
  const [search,  setSearch]  = useState("");

  async function load(d = days) {
    setLoading(true);
    try {
      const res = await getOperatorStats(d);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleDays(d) { setDays(d); load(d); }

  if (loading) return (
    <div style={{ padding: 40, color: "#6B7E95", textAlign: "center" }}>
      <span className="spin" /> Loading operator report…
    </div>
  );

  if (!data) return (
    <div style={{ padding: 40, color: "#F09595", textAlign: "center" }}>
      Could not load operator data. Check your connection.
    </div>
  );

  const operators = (data.operators || [])
    .filter(op => !search || op.operator.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sort] || 0) - (a[sort] || 0));

  // Summary totals
  const totalScans  = operators.reduce((s, o) => s + o.total_scans,  0);
  const totalTrays  = operators.reduce((s, o) => s + o.unique_trays, 0);
  const totalFifo   = operators.reduce((s, o) => s + o.fifo_flags,   0);
  const activeOps   = operators.length;

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ color: "#E8EFF8", margin: 0 }}>👷 Operator Report</h2>
          <div style={{ fontSize: 12, color: "#6B7E95", marginTop: 3 }}>
            Productivity metrics per operator · last {days} days
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => handleDays(d)} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              background: days === d ? "#185FA5" : "#111827",
              color:      days === d ? "#E6F1FB" : "#6B7E95",
              border:     days === d ? "1px solid #185FA5" : "1px solid #1E2D42",
              fontWeight: days === d ? 700 : 400,
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { value: activeOps,   label: "Active operators",  color: "#378ADD" },
          { value: totalScans,  label: "Total scans",       color: "#5DCAA5" },
          { value: totalTrays,  label: "Trays processed",   color: "#7F77DD" },
          { value: totalFifo,   label: "FIFO flags raised",  color: totalFifo > 0 ? "#E24B4A" : "#5DCAA5" },
        ].map(k => (
          <div key={k.label} style={{ background: "#0D1320", border: `1px solid ${k.color}33`, borderTop: `2px solid ${k.color}`, borderRadius: 10, padding: "14px 16px" }}>
            <StatPill value={k.value} label={k.label} color={k.color} />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ flex: 1, minWidth: 160, padding: "8px 12px", background: "#111827", border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8", fontSize: 13, outline: "none" }}
          placeholder="Search operator…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          style={{ padding: "8px 12px", background: "#111827", border: "1px solid #1E2D42", borderRadius: 7, color: "#E8EFF8", fontSize: 13, outline: "none", cursor: "pointer" }}
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="total_scans">Sort: Most scans</option>
          <option value="unique_trays">Sort: Most trays</option>
          <option value="fifo_flags">Sort: Most FIFO flags</option>
        </select>
      </div>

      {/* Operator table */}
      {operators.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6B7E95" }}>
          No scan activity in the last {days} days.
        </div>
      ) : (
        <div style={{ background: "#0D1320", border: "1px solid #1E2D42", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E2D42" }}>
                {["Operator", "Total scans", "Trays touched", "FIFO flags", "Scan rate", "Top stage", "7-day activity"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6B7E95", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operators.map((op, i) => {
                // Build 7-day sparkline data
                const last7 = [];
                for (let d = 6; d >= 0; d--) {
                  const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
                  last7.push({ label: day.slice(5), v: op.daily?.[day] || 0 });
                }

                // Top stage (most scans)
                const topStage = Object.entries(op.stages || {}).sort((a, b) => b[1] - a[1])[0];
                const scanRate = op.total_scans > 0 ? Math.round(op.total_scans / days) : 0;

                return (
                  <tr key={op.operator} style={{ borderBottom: "1px solid #1E2D4244", background: i % 2 === 0 ? "transparent" : "#080C1440" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700, color: "#E8EFF8", fontSize: 13 }}>{op.operator}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#5DCAA5" }}>{op.total_scans.toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: "#7F77DD" }}>{op.unique_trays.toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {op.fifo_flags > 0 ? (
                        <span style={{ background: "rgba(226,75,74,.2)", color: "#F09595", borderRadius: 5, padding: "3px 9px", fontSize: 12, fontWeight: 700 }}>
                          ⚠ {op.fifo_flags}
                        </span>
                      ) : (
                        <span style={{ background: "rgba(59,109,17,.15)", color: "#97C459", borderRadius: 5, padding: "3px 9px", fontSize: 12 }}>✓ 0</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 13, color: "#85B7EB" }}>{scanRate}/day</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {topStage ? (
                        <span style={{ background: "#1E2D42", color: "#E8EFF8", borderRadius: 5, padding: "3px 9px", fontSize: 11 }}>
                          {topStage[0]} <span style={{ color: "#6B7E95" }}>×{topStage[1]}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", minWidth: 100 }}>
                      <BarMini data={last7} color="#378ADD" height={28} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage breakdown heatmap */}
      {operators.length > 0 && (
        <div style={{ background: "#0D1320", border: "1px solid #1E2D42", borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7E95", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>
            Stage breakdown — scans per operator
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#6B7E95", fontWeight: 700 }}>Operator</th>
                  {/* Collect all unique stages */}
                  {[...new Set(operators.flatMap(op => Object.keys(op.stages || {})))].map(s => (
                    <th key={s} style={{ padding: "6px 10px", fontSize: 9, color: "#6B7E95", fontWeight: 700, textTransform: "uppercase" }}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {operators.map(op => {
                  const allStages = [...new Set(operators.flatMap(o => Object.keys(o.stages || {})))];
                  const maxVal    = Math.max(...allStages.map(s => op.stages?.[s] || 0), 1);
                  return (
                    <tr key={op.operator} style={{ borderTop: "1px solid #1E2D4244" }}>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: "#E8EFF8", fontWeight: 600, whiteSpace: "nowrap" }}>{op.operator}</td>
                      {allStages.map(s => {
                        const v    = op.stages?.[s] || 0;
                        const pct  = v / Math.max(...operators.flatMap(o => [o.stages?.[s] || 0]), 1);
                        return (
                          <td key={s} style={{ padding: "4px 6px", textAlign: "center" }}>
                            {v > 0 ? (
                              <div style={{ background: `rgba(55,138,221,${0.15 + pct * 0.7})`, color: "#E8EFF8", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontWeight: 600 }}>
                                {v}
                              </div>
                            ) : (
                              <div style={{ color: "#1E2D42", fontSize: 11 }}>—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}