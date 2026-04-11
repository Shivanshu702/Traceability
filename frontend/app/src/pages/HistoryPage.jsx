import { useState } from "react";
import { getHistory } from "../api/api";

export default function HistoryPage() {
  const [trayId,  setTrayId]  = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function loadHistory() {
    const id = trayId.trim().toUpperCase();
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getHistory(id);
      if (!Array.isArray(data)) {
        setError(data?.detail || "Tray not found.");
        setHistory([]);
      } else {
        setHistory(data);
      }
    } catch {
      setError("Could not reach server.");
    } finally {
      setLoading(false);
    }
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "short", timeStyle: "medium",
    });
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Search */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Tray Scan History</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="inp"
            placeholder="Enter Tray ID"
            value={trayId}
            onChange={(e) => setTrayId(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && loadHistory()}
          />
          <button className="btn btn-blue" onClick={loadHistory} disabled={loading || !trayId.trim()}>
            {loading ? <span className="spin" /> : "Load"}
          </button>
        </div>
        {error && <div className="err-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* History table */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-title">
            {history[0].tray_id} — {history.length} events
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Operator</th>
                  <th>FIFO</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id || i}>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <span className="tag tag-gray">{h.from_stage || "—"}</span>
                    </td>
                    <td>
                      <span className="tag tag-blue">{h.stage}</span>
                    </td>
                    <td>{h.operator}</td>
                    <td>
                      {h.fifo_flag
                        ? <span className="tag tag-red">⚠ Yes</span>
                        : <span className="tag tag-green">✓</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {fmtDate(h.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && history.length === 0 && trayId && !error && (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>
          No history found for this tray.
        </div>
      )}
    </div>
  );
}