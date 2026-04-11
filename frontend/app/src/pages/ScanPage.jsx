import { useState } from "react";
import { scanTray, getTray } from "../api/api";
import QRScanner from "../components/QRScanner";

export default function ScanPage() {
  const [trayId,      setTrayId]      = useState("");
  const [operator,    setOperator]    = useState("");
  const [tray,        setTray]        = useState(null);
  const [error,       setError]       = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [branch,      setBranch]      = useState(null);

  const BRANCH_OPTIONS = [
    { id: "BAT_SOL_R", label: "Battery Soldered by Robot", icon: "🤖" },
    { id: "BAT_SOL_M", label: "Battery Soldered by Hand",  icon: "✋" },
  ];

  async function loadTray() {
    if (!trayId.trim()) return;
    setLoading(true);
    setError("");
    const data = await getTray(trayId.trim().toUpperCase());
    setLoading(false);
    if (data.detail || data.error) {
      setError(data.detail || data.error);
      setTray(null);
    } else {
      setTray(data);
      setBranch(null);
    }
  }

  async function doScan(id, override) {
    if (!operator.trim()) { setError("Please enter operator name."); return; }
    setLoading(true);
    setError("");
    const data = await scanTray(
      (id || trayId).trim().toUpperCase(),
      operator.trim(),
      override || undefined
    );
    setLoading(false);
    if (data.error) {
      setError(data.error + (data.older_trays ? " → Pending: " + data.older_trays.join(", ") : ""));
      return;
    }
    setTray(data.tray || data);
    setBranch(null);
    setError("");
  }

  async function handleQRScan(result) {
    setTrayId(result);
    setShowScanner(false);
    await doScan(result);
  }

  const isBranch      = tray && tray.stage === "BAT_MOUNT";
  const isSplitParent = tray && tray.is_split_parent;
  const isDone        = tray && tray.is_done;

  return (
    <div style={styles.container}>
      <h2 style={{ color: "#E8EFF8", marginBottom: 20 }}>📦 Scan Tray</h2>

      {/* Input card */}
      <div style={styles.card}>
        <input
          style={styles.input}
          placeholder="Tray ID (e.g. TRY-001)"
          value={trayId}
          onChange={(e) => setTrayId(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && loadTray()}
        />
        <input
          style={styles.input}
          placeholder="Operator name"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
        />
        <div style={styles.buttons}>
          <button style={styles.btn} onClick={loadTray} disabled={loading}>
            {loading ? "…" : "Load"}
          </button>
          <button style={styles.btnPrimary} onClick={() => doScan()} disabled={loading || isBranch}>
            {loading ? "…" : "Scan"}
          </button>
          <button style={styles.btnGreen} onClick={() => setShowScanner(true)}>
            📷 Scan QR
          </button>
        </div>
      </div>

      {/* QR Scanner */}
      {showScanner && (
        <div style={styles.card}>
          <QRScanner onScan={handleQRScan} />
          <button style={styles.btn} onClick={() => setShowScanner(false)}>
            Close Scanner
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>{error}</div>
      )}

      {/* Tray info */}
      {tray && (
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#E8EFF8" }}>
              {tray.id}
            </span>
            {tray.parent_id && (
              <span style={styles.tagAmber}>Part {tray.id.slice(-1)}</span>
            )}
            {tray.project && (
              <span style={styles.tagBlue}>{tray.project}</span>
            )}
          </div>

          <p style={{ marginBottom: 8, color: "#6B7E95", fontSize: 13 }}>
            Stage: <span style={{ ...getStageStyle(tray.stage), fontWeight: 700 }}>{tray.stage}</span>
          </p>

          {tray.fifo_violated && (
            <div style={styles.warnBox}>⚠ FIFO violation flagged on this tray</div>
          )}

          {isSplitParent && (
            <div style={styles.warnBox}>
              ✂ This tray has been split into{" "}
              <strong>{tray.id}-A</strong> and <strong>{tray.id}-B</strong>.
              Scan each child separately.
            </div>
          )}

          {isDone && (
            <div style={styles.okBox}>✅ This tray is complete!</div>
          )}

          {/* Branch selection */}
          {isBranch && !isDone && (
            <div style={{ marginTop: 14 }}>
              <p style={{ color: "#FAC775", fontSize: 13, marginBottom: 10 }}>
                ⚡ Select soldering method to continue:
              </p>
              {BRANCH_OPTIONS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBranch(b.id)}
                  style={{
                    ...styles.branchBtn,
                    border: branch === b.id ? "2px solid #378ADD" : "1px solid #1E2D42",
                    background: branch === b.id ? "rgba(55,138,221,.08)" : "#111827",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{b.icon}</span>
                  <span style={{ fontWeight: 700, color: "#E8EFF8" }}>{b.label}</span>
                </button>
              ))}
              <button
                style={{ ...styles.btnPrimary, width: "100%", marginTop: 10, padding: 14, fontSize: 15 }}
                onClick={() => doScan(null, branch)}
                disabled={!branch || loading}
              >
                {loading ? "Processing…" : "✓ Confirm Branch"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */

const styles = {
  container: { maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "'Segoe UI', sans-serif" },
  card: { background: "#162032", border: "1px solid #1E2D42", borderRadius: 12, padding: 20, marginBottom: 16 },
  input: {
    width: "100%", padding: 12, marginBottom: 12, borderRadius: 8,
    border: "1px solid #1E2D42", background: "#111827",
    color: "#E8EFF8", fontSize: 14, boxSizing: "border-box", outline: "none",
  },
  buttons:    { display: "flex", gap: 8, flexWrap: "wrap" },
  btn:        { flex: 1, padding: 10, borderRadius: 8, border: "1px solid #1E2D42", background: "#111827", color: "#E8EFF8", cursor: "pointer", fontSize: 13 },
  btnPrimary: { flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#185FA5", color: "#E6F1FB", cursor: "pointer", fontSize: 13, fontWeight: 700 },
  btnGreen:   { flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#3B6D11", color: "#EAF3DE", cursor: "pointer", fontSize: 13 },
  errorBox:   { background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)", borderRadius: 8, padding: 14, color: "#F09595", fontSize: 13, marginBottom: 12 },
  warnBox:    { background: "rgba(186,117,23,.15)", border: "1px solid rgba(186,117,23,.4)", borderRadius: 8, padding: 12, color: "#FAC775", fontSize: 13, marginBottom: 10 },
  okBox:      { background: "rgba(59,109,17,.2)", border: "1px solid rgba(59,109,17,.4)", borderRadius: 8, padding: 12, color: "#97C459", fontSize: 13 },
  tagAmber:   { background: "rgba(186,117,23,.2)", color: "#FAC775", borderRadius: 5, padding: "3px 10px", fontSize: 12, fontWeight: 700 },
  tagBlue:    { background: "rgba(55,138,221,.15)", color: "#85B7EB", borderRadius: 5, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
  branchBtn:  { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 16, borderRadius: 10, cursor: "pointer", marginBottom: 8, textAlign: "left" },
};

function getStageStyle(stage) {
  const colors = {
    CREATED:"#888780", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
    BAT_MOUNT:"#EF9F27", BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
    RACK3:"#D4537E", DEPANEL_IN:"#BA7517", TESTING:"#185FA5",
    COMPLETE:"#3B6D11", SPLIT:"#FAC775",
  };
  return { color: colors[stage] || "#E8EFF8" };
}