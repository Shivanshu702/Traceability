import { useState } from "react";
import { getHistory } from "../api/api";
import { useLang } from "../context/LangContext";

const STAGE_COLORS = {
  CREATED:"#888780", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
  BAT_MOUNT:"#EF9F27", BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
  RACK3:"#D4537E", DEPANEL_IN:"#BA7517", TESTING:"#185FA5",
  COMPLETE:"#3B6D11", SPLIT:"#FAC775",
};

function stageColor(stage) { return STAGE_COLORS[stage] || "#6B7E95"; }

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle:"short", timeStyle:"medium" });
}

function fmtDuration(seconds) {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function enrichWithDurations(events) {
  return events.map((e, i) => {
    const next = events[i + 1];
    if (!next || !e.timestamp || !next.timestamp) return { ...e, durationSec: null };
    const secs = Math.round((new Date(next.timestamp) - new Date(e.timestamp)) / 1000);
    return { ...e, durationSec: secs };
  });
}

export default function HistoryPage() {
  const { t } = useLang();
  const [trayId,  setTrayId]  = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [view,    setView]    = useState("timeline");

  async function loadHistory() {
    const id = trayId.trim().toUpperCase();
    if (!id) return;
    setLoading(true); setError("");
    try {
      const data = await getHistory(id);
      if (!Array.isArray(data)) {
        setError(data?.detail || "Tray not found.");
        setHistory([]);
      } else {
        setHistory(enrichWithDurations(data));
      }
    } catch {
      setError(t("cannotReachServer"));
    } finally {
      setLoading(false);
    }
  }

  const totalSec = history.length >= 2
    ? Math.round((new Date(history[history.length - 1].timestamp) - new Date(history[0].timestamp)) / 1000)
    : null;

  return (
    <div style={{ maxWidth:760 }}>
      {/* Search */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title">{t("scanHistory")}</div>
        <div style={{ display:"flex", gap:8 }}>
          <input className="inp" placeholder={t("trayId")}
            value={trayId}
            onChange={e => setTrayId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadHistory()} />
          <button className="btn btn-blue" onClick={loadHistory} disabled={loading || !trayId.trim()}>
            {loading ? <span className="spin" /> : t("search").replace("…","")}
          </button>
        </div>
        {error && <div className="err-box" style={{ marginTop:10 }}>{error}</div>}
      </div>

      {history.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{
            background:"var(--card)", border:"1px solid var(--border)", borderRadius:12,
            padding:"14px 18px", marginBottom:14,
            display:"flex", gap:24, flexWrap:"wrap", alignItems:"center",
          }}>
            <div>
              <div style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".07em" }}>{t("trayId")}</div>
              <div style={{ fontSize:16, fontWeight:700, color:"var(--text)", fontFamily:"monospace" }}>{history[0]?.tray_id}</div>
            </div>
            <div>
              <div style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".07em" }}>Events</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#378ADD" }}>{history.length}</div>
            </div>
            {totalSec != null && (
              <div>
                <div style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".07em" }}>Total cycle time</div>
                <div style={{ fontSize:16, fontWeight:700, color:"#5DCAA5" }}>{fmtDuration(totalSec)}</div>
              </div>
            )}
            {history.some(h => h.fifo_flag) && (
              <div style={{ background:"rgba(163,45,45,.15)", border:"1px solid rgba(163,45,45,.4)", borderRadius:8, padding:"6px 12px" }}>
                <span style={{ color:"#F09595", fontSize:12, fontWeight:700 }}>⚠ {t("fifoFlag")} violations recorded</span>
              </div>
            )}
            {/* View toggle */}
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              {["timeline","table"].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding:"5px 14px", borderRadius:6, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                  background: view===v ? "var(--accent-dk)" : "var(--inp-bg)",
                  color:      view===v ? "#E6F1FB" : "var(--muted)",
                  border:     view===v ? "1px solid var(--accent-dk)" : "1px solid var(--border)",
                  fontWeight: view===v ? 700 : 400,
                }}>
                  {v === "timeline" ? `⏱ Timeline` : `📋 ${t("from").length > 0 ? "Table" : "Table"}`}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline view */}
          {view === "timeline" && (
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"20px 20px 8px" }}>
              {history.map((h, i) => {
                const col    = stageColor(h.stage);
                const isLast = i === history.length - 1;
                return (
                  <div key={h.id || i} style={{ display:"flex", gap:14, position:"relative" }}>
                    {/* Spine */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                      <div style={{ width:14, height:14, borderRadius:"50%", background:col, border:`2px solid ${col}44`, flexShrink:0, marginTop:2 }}/>
                      {!isLast && (
                        <div style={{ width:2, flex:1, background:`linear-gradient(${col}66, ${col}11)`, minHeight:28 }}/>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex:1, paddingBottom:isLast ? 0 : 20 }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:10, flexWrap:"wrap" }}>
                        <div style={{ flex:1 }}>
                          {/* Stage transition */}
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                            {h.from_stage && (
                              <>
                                <span style={{ fontSize:11, color:"var(--muted)", background:"var(--inp-bg)", borderRadius:4, padding:"2px 7px" }}>{h.from_stage}</span>
                                <span style={{ color:"var(--muted)", fontSize:12 }}>→</span>
                              </>
                            )}
                            <span style={{ fontSize:12, fontWeight:700, background:col+"22", color:col, borderRadius:4, padding:"2px 8px" }}>{h.stage}</span>
                            {h.fifo_flag && (
                              <span style={{ fontSize:10, fontWeight:700, background:"rgba(163,45,45,.2)", color:"#F09595", borderRadius:4, padding:"2px 7px" }}>⚠ FIFO</span>
                            )}
                          </div>
                          {/* Operator + timestamp */}
                          <div style={{ fontSize:12, color:"var(--muted)" }}>
                            <span style={{ color:"#85B7EB" }}>{h.operator}</span>
                            {" · "}
                            {fmtDate(h.timestamp)}
                          </div>
                          {h.note && (
                            <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, fontStyle:"italic" }}>
                              "{h.note}"
                            </div>
                          )}
                        </div>

                        {/* Duration badge */}
                        {h.durationSec != null && (
                          <div style={{
                            flexShrink:0, background:"var(--inp-bg)", border:"1px solid var(--border)",
                            borderRadius:6, padding:"4px 10px", fontSize:11, color:"var(--muted)",
                            display:"flex", flexDirection:"column", alignItems:"center",
                          }}>
                            <span style={{ fontSize:13, fontWeight:700, color: h.durationSec > 7200 ? "#E24B4A" : h.durationSec > 3600 ? "#EF9F27" : "#5DCAA5" }}>
                              {fmtDuration(h.durationSec)}
                            </span>
                            <span style={{ fontSize:9, color:"var(--muted)", marginTop:1 }}>at stage</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table view */}
          {view === "table" && (
            <div className="card">
              <div style={{ overflowX:"auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("from")}</th>
                      <th>{t("to")}</th>
                      <th>{t("operator")}</th>
                      <th>Duration at stage</th>
                      <th>{t("fifoFlag")}</th>
                      <th>{t("time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={h.id || i}>
                        <td style={{ color:"var(--muted)", fontSize:12 }}>{i + 1}</td>
                        <td><span className="tag tag-gray">{h.from_stage || "—"}</span></td>
                        <td>
                          <span style={{ background:stageColor(h.stage)+"22", color:stageColor(h.stage), borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
                            {h.stage}
                          </span>
                        </td>
                        <td style={{ color:"#85B7EB", fontSize:13 }}>{h.operator}</td>
                        <td>
                          {h.durationSec != null ? (
                            <span style={{ color: h.durationSec > 7200 ? "#E24B4A" : h.durationSec > 3600 ? "#EF9F27" : "#5DCAA5", fontWeight:600, fontSize:12 }}>
                              {fmtDuration(h.durationSec)}
                            </span>
                          ) : "—"}
                        </td>
                        <td>
                          {h.fifo_flag
                            ? <span className="tag tag-red">⚠ Yes</span>
                            : <span className="tag tag-green">✓</span>}
                        </td>
                        <td style={{ fontSize:12, color:"var(--muted)", whiteSpace:"nowrap" }}>{fmtDate(h.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && history.length === 0 && trayId && !error && (
        <div style={{ color:"var(--muted)", textAlign:"center", padding:40 }}>
          No history found for this tray.
        </div>
      )}
    </div>
  );
}