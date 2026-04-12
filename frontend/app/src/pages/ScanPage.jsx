import { useState, useEffect } from "react";
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
  const [success,     setSuccess]     = useState("");

  const BRANCH_OPTIONS = [
    { id: "BAT_SOL_R", label: "Battery Soldered by Robot", icon: "🤖" },
    { id: "BAT_SOL_M", label: "Battery Soldered by Hand",  icon: "✋" },
  ];

  // ── Auto-load tray from localStorage (set by QR scan) ────────────────────
  useEffect(() => {
    const pending = localStorage.getItem("pendingScan");
    if (pending) {
      localStorage.removeItem("pendingScan"); // clear it immediately
      const id = pending.trim().toUpperCase();
      setTrayId(id);
      autoLoad(id);
    }
  }, []);

  async function autoLoad(id) {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await getTray(id);
      if (data.detail || data.error) {
        setError(data.detail || data.error);
        setTray(null);
      } else {
        setTray(data);
        setBranch(null);
      }
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTray() {
    const id = trayId.trim().toUpperCase();
    if (!id) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await getTray(id);
      if (data.detail || data.error) {
        setError(data.detail || data.error);
        setTray(null);
      } else {
        setTray(data);
        setBranch(null);
      }
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  async function doScan(id, override) {
    const op = operator.trim();
    if (!op) { setError("Please enter your operator name."); return; }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await scanTray(
        (id || trayId).trim().toUpperCase(),
        op,
        override || undefined
      );

      if (data.error) {
        setError(
          data.error +
          (data.older_trays ? " → Pending: " + data.older_trays.join(", ") : "")
        );
        return;
      }

      const updatedTray = data.tray || data;
      setTray(updatedTray);
      setBranch(null);

      if (data.is_split) {
        setSuccess(`✂ Tray split into ${data.child_a} and ${data.child_b}`);
      } else {
        setSuccess(`✅ Moved to: ${data.to_label || updatedTray.stage}`);
      }

      if (data.fifo_vio) {
        setError("⚠ FIFO violation logged — older trays were waiting: " +
          (data.older_trays || []).join(", "));
      }
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleQRScan(result) {
    const extracted = extractTrayId(result.trim());
    setTrayId(extracted);
    setShowScanner(false);
    await autoLoad(extracted);
  }

  // Handles both plain IDs and full URLs like https://...?scan=TRY-001
  function extractTrayId(raw) {
    try {
      const url   = new URL(raw);
      const param = url.searchParams.get("scan");
      if (param) return param.toUpperCase();
    } catch {}
    return raw.toUpperCase();
  }

  function reset() {
    setTrayId("");
    setTray(null);
    setError("");
    setSuccess("");
    setBranch(null);
  }

  const isBranch      = tray && tray.stage === "BAT_MOUNT";
  const isSplitParent = tray && tray.is_split_parent;
  const isDone        = tray && tray.is_done;

  return (
    <div style={styles.container}>
      <h2 style={{ color: "#E8EFF8", marginBottom: 20 }}>📦 Scan Tray</h2>

      {/* ── Input card (only shown when no tray loaded) ── */}
      {!tray && (
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
            placeholder="Your name (operator)"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          />
          <div style={styles.buttons}>
            <button style={styles.btn} onClick={loadTray}
              disabled={loading || !trayId.trim()}>
              {loading ? "…" : "Load"}
            </button>
            <button style={styles.btnPrimary} onClick={() => doScan()}
              disabled={loading || !trayId.trim()}>
              {loading ? "…" : "Scan"}
            </button>
            <button style={styles.btnGreen} onClick={() => setShowScanner(true)}>
              📷 Scan QR
            </button>
          </div>
        </div>
      )}

      {/* ── QR Scanner ── */}
      {showScanner && (
        <div style={styles.card}>
          <QRScanner onScan={handleQRScan} />
          <button style={{ ...styles.btn, marginTop: 10, width: "100%" }}
            onClick={() => setShowScanner(false)}>
            Close Scanner
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: "center", color: "#6B7E95", padding: 20, fontSize: 14 }}>
          ⏳ Loading tray…
        </div>
      )}

      {/* ── Error ── */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* ── Success ── */}
      {success && <div style={styles.okBox}>{success}</div>}

      {/* ── Tray card ── */}
      {tray && !loading && (
        <div style={styles.card}>

          {/* Tray header */}
          <div style={{ display:"flex", alignItems:"center", gap:10,
                        marginBottom:14, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"monospace", fontSize:20,
                           fontWeight:700, color:"#E8EFF8" }}>
              {tray.id}
            </span>
            {tray.parent_id && (
              <span style={styles.tagAmber}>Part {tray.id.slice(-1)}</span>
            )}
            {tray.project && (
              <span style={styles.tagBlue}>{tray.project}</span>
            )}
          </div>

          {/* Stage */}
          <p style={{ marginBottom:10, color:"#6B7E95", fontSize:13 }}>
            Stage:{" "}
            <span style={{ ...getStageStyle(tray.stage), fontWeight:700 }}>
              {tray.stage}
            </span>
          </p>

          {/* Info pills */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            {tray.shift    && <span style={styles.tagGray}>{tray.shift}</span>}
            {tray.batch_no && <span style={styles.tagGray}>Batch: {tray.batch_no}</span>}
            <span style={styles.tagGray}>{tray.total_units} units</span>
          </div>

          {tray.fifo_violated && (
            <div style={styles.warnBox}>⚠ FIFO violation was flagged on this tray</div>
          )}

          {isSplitParent && (
            <div style={styles.warnBox}>
              ✂ Tray was split into <strong>{tray.id}-A</strong> and{" "}
              <strong>{tray.id}-B</strong>. Scan each child separately.
            </div>
          )}

          {isDone && (
            <div style={styles.okBox}>✅ This tray is complete!</div>
          )}

          {/* Actions */}
          {!isDone && !isSplitParent && (
            <>
              <input
                style={{ ...styles.input, marginTop:12 }}
                placeholder="Your name (operator)"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
              />

              {/* Branch selection */}
              {isBranch && (
                <div style={{ marginTop:10 }}>
                  <p style={{ color:"#FAC775", fontSize:13, marginBottom:10 }}>
                    ⚡ Select soldering method:
                  </p>
                  {BRANCH_OPTIONS.map((b) => (
                    <button key={b.id} onClick={() => setBranch(b.id)}
                      style={{
                        ...styles.branchBtn,
                        border: branch === b.id
                          ? "2px solid #378ADD" : "1px solid #1E2D42",
                        background: branch === b.id
                          ? "rgba(55,138,221,.08)" : "#111827",
                      }}>
                      <span style={{ fontSize:22 }}>{b.icon}</span>
                      <span style={{ fontWeight:700, color:"#E8EFF8" }}>{b.label}</span>
                    </button>
                  ))}
                  <button
                    style={{
                      ...styles.btnPrimary, width:"100%",
                      marginTop:10, padding:14, fontSize:15,
                      opacity: (!branch || loading) ? 0.5 : 1,
                    }}
                    onClick={() => doScan(null, branch)}
                    disabled={!branch || loading}>
                    {loading ? "Processing…" : "✓ Confirm Branch"}
                  </button>
                </div>
              )}

              {/* Normal scan */}
              {!isBranch && (
                <button
                  style={{
                    ...styles.btnPrimary, width:"100%",
                    marginTop:12, padding:14, fontSize:15,
                    opacity: loading ? 0.5 : 1,
                  }}
                  onClick={() => doScan()}
                  disabled={loading}>
                  {loading ? "Processing…" : "✓ Confirm Scan"}
                </button>
              )}
            </>
          )}

          <button style={{ ...styles.btn, width:"100%", marginTop:10 }} onClick={reset}>
            ← Scan Another Tray
          </button>
        </div>
      )}
    </div>
  );
}

function getStageStyle(stage) {
  const colors = {
    CREATED:"#888780", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
    BAT_MOUNT:"#EF9F27", BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
    RACK3:"#D4537E", DEPANEL_IN:"#BA7517", TESTING:"#185FA5",
    COMPLETE:"#3B6D11", SPLIT:"#FAC775",
  };
  return { color: colors[stage] || "#E8EFF8" };
}

const styles = {
  container: { maxWidth:480, margin:"0 auto", padding:20,
               fontFamily:"'Segoe UI', sans-serif" },
  card: { background:"#162032", border:"1px solid #1E2D42",
          borderRadius:12, padding:20, marginBottom:16 },
  input: { width:"100%", padding:12, marginBottom:12, borderRadius:8,
           border:"1px solid #1E2D42", background:"#111827",
           color:"#E8EFF8", fontSize:14, boxSizing:"border-box", outline:"none" },
  buttons: { display:"flex", gap:8, flexWrap:"wrap" },
  btn: { flex:1, padding:10, borderRadius:8, border:"1px solid #1E2D42",
         background:"#111827", color:"#E8EFF8", cursor:"pointer", fontSize:13 },
  btnPrimary: { flex:1, padding:10, borderRadius:8, border:"none",
                background:"#185FA5", color:"#E6F1FB",
                cursor:"pointer", fontSize:13, fontWeight:700 },
  btnGreen: { flex:1, padding:10, borderRadius:8, border:"none",
              background:"#3B6D11", color:"#EAF3DE", cursor:"pointer", fontSize:13 },
  errorBox: { background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)",
              borderRadius:8, padding:14, color:"#F09595", fontSize:13, marginBottom:12 },
  okBox:    { background:"rgba(59,109,17,.2)", border:"1px solid rgba(59,109,17,.4)",
              borderRadius:8, padding:12, color:"#97C459", fontSize:13, marginBottom:12 },
  warnBox:  { background:"rgba(186,117,23,.15)", border:"1px solid rgba(186,117,23,.4)",
              borderRadius:8, padding:12, color:"#FAC775", fontSize:13, marginBottom:10 },
  tagAmber: { background:"rgba(186,117,23,.2)", color:"#FAC775",
              borderRadius:5, padding:"3px 10px", fontSize:12, fontWeight:700 },
  tagBlue:  { background:"rgba(55,138,221,.15)", color:"#85B7EB",
              borderRadius:5, padding:"3px 10px", fontSize:12, fontWeight:600 },
  tagGray:  { background:"rgba(136,135,128,.15)", color:"#6B7E95",
              borderRadius:5, padding:"3px 10px", fontSize:11 },
  branchBtn: { display:"flex", alignItems:"center", gap:12,
               width:"100%", padding:16, borderRadius:10,
               cursor:"pointer", marginBottom:8, textAlign:"left" },
};