import { useState, useEffect } from "react";
import { scanTray, getTray } from "../api/api";
import QRScanner from "../components/QRScanner";
import { useLang } from "../context/LangContext";

export default function ScanPage() {
  const { t } = useLang();

  const [trayId,      setTrayId]      = useState("");
  const [operator,    setOperator]    = useState(
    () => localStorage.getItem("lastOperator") || ""
  );
  const [tray,        setTray]        = useState(null);
  const [error,       setError]       = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [branch,      setBranch]      = useState(null);
  const [success,     setSuccess]     = useState("");
  const [scanNote,    setScanNote]    = useState("");

  const BRANCH_OPTIONS = [
    { id: "BAT_SOL_R", label: "Battery Soldered by Robot", icon: "🤖" },
    { id: "BAT_SOL_M", label: "Battery Soldered by Hand",  icon: "✋" },
  ];

  // Auto-load pending QR scan from URL redirect
  useEffect(() => {
    const pending = localStorage.getItem("pendingScan");
    if (pending) {
      localStorage.removeItem("pendingScan");
      const id = pending.trim().toUpperCase();
      setTrayId(id);
      autoLoad(id);
    }
  }, []);

  useEffect(() => {
    if (operator) localStorage.setItem("lastOperator", operator);
  }, [operator]);

  async function autoLoad(id) {
    setLoading(true); setError(""); setSuccess(""); setScanNote("");
    try {
      const data = await getTray(id);
      if (data.detail || data.error) { setError(data.detail || data.error); setTray(null); }
      else { setTray(data); setBranch(null); }
    } catch { setError(t("cannotReachServer")); }
    finally  { setLoading(false); }
  }

  async function loadTray() {
    const id = trayId.trim().toUpperCase();
    if (!id) return;
    setLoading(true); setError(""); setSuccess(""); setScanNote("");
    try {
      const data = await getTray(id);
      if (data.detail || data.error) { setError(data.detail || data.error); setTray(null); }
      else { setTray(data); setBranch(null); }
    } catch { setError(t("cannotReachServer")); }
    finally  { setLoading(false); }
  }

  async function doScan(id, override) {
    const op = operator.trim();
    if (!op) { setError(t("enterOperator")); return; }
    setLoading(true); setError(""); setSuccess(""); setScanNote("");
    try {
      const data = await scanTray(
        (id || trayId).trim().toUpperCase(), op, override || undefined
      );
      if (data.error) {
        setError(
          data.error +
          (data.older_trays?.length ? " → Pending: " + data.older_trays.join(", ") : "")
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
      if (data.scan_note) setScanNote(data.scan_note);
      if (data.fifo_vio) {
        setError("⚠ FIFO violation logged — older trays were waiting: " +
          (data.older_trays || []).join(", "));
      }
    } catch { setError(t("cannotReachServer")); }
    finally  { setLoading(false); }
  }

  async function handleQRScan(result) {
    const extracted = extractTrayId(result.trim());
    setTrayId(extracted);
    setShowScanner(false);
    await autoLoad(extracted);
  }

  function extractTrayId(raw) {
    try {
      const url   = new URL(raw);
      const param = url.searchParams.get("scan");
      if (param) return param.toUpperCase();
    } catch {}
    return raw.toUpperCase();
  }

  function reset() {
    setTrayId(""); setTray(null); setError("");
    setSuccess(""); setScanNote(""); setBranch(null);
  }

  const isBranch      = tray && tray.stage === "BAT_MOUNT" && !tray.is_done;
  const isSplitParent = tray && tray.is_split_parent;
  const isDone        = tray && tray.is_done;

  // ── Styles (theme-aware via CSS variables) ────────────────────────────────
  const S = {
    container: { maxWidth: 480, margin: "0 auto", fontFamily: "'Segoe UI', sans-serif" },
    card:      { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "var(--shadow)" },
    input:     { width: "100%", padding: 12, marginBottom: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--inp-bg)", color: "var(--text)", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit", transition: "border-color .15s" },
    buttons:   { display: "flex", gap: 8, flexWrap: "wrap" },
    btn:       { flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
    btnPrimary:{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--accent-dk)", color: "#E6F1FB", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
    branchBtn: { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 16, borderRadius: 10, cursor: "pointer", marginBottom: 8, textAlign: "left", fontFamily: "inherit" },
  };


  return (
    <div style={S.container}>
      <h2 style={{ color: "var(--text)", marginBottom: 16, fontSize: 16, fontWeight: 700 }}>
        📷 {t("scanTray")}
      </h2>

      {/* Operator name */}
      <div style={S.card}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
          {t("operatorName")}
        </div>
        <input
          style={S.input}
          placeholder={t("operatorName")}
          value={operator}
          onChange={e => setOperator(e.target.value)}
        />

        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
          {t("trayId")}
        </div>
        <input
          style={S.input}
          placeholder={t("trayId")}
          value={trayId}
          onChange={e => setTrayId(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && loadTray()}
        />

        <div style={S.buttons}>
          <button style={S.btnPrimary} onClick={loadTray} disabled={loading || !trayId.trim()}>
            {loading ? t("loading") : t("lookupTray")}
          </button>
          <button style={S.btn} onClick={() => setShowScanner(v => !v)}>
            {showScanner ? t("closeCamera") : t("openCamera")}
          </button>
        </div>
      </div>

      {/* QR Scanner */}
      {showScanner && (
        <div style={S.card}>
          <QRScanner onScan={handleQRScan} />
        </div>
      )}

      {/* Error */}
      {error && <div className="err-box">{error}</div>}

      {/* Success */}
      {success && <div className="ok-box">{success}</div>}

      {/* Scan note */}
      {scanNote && <div className="note-box">{scanNote}</div>}

      {/* Tray card */}
      {tray && !loading && (
        <div style={S.card}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
              {tray.id}
            </span>


            {tray.parent_id && <span className="tag tag-amber">Part {tray.id.endsWith("-A") ? "A" : tray.id.endsWith("-B") ? "B" : tray.id.slice(-1)}</span>}
            {tray.project   && <span className="tag tag-blue">{tray.project}</span>}
            {tray.shift     && <span className="tag tag-gray">{tray.shift}</span>}
          </div>

          {/* Stage */}
          <p style={{ marginBottom: 10, color: "var(--muted)", fontSize: 13 }}>
            {t("stage")}:{" "}
            <span style={{ ...stageColor(tray.stage), fontWeight: 700 }}>{tray.stage}</span>
          </p>

          {/* Info pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {tray.batch_no   && <span className="tag tag-gray">{t("batch")}: {tray.batch_no}</span>}
            <span className="tag tag-gray">{tray.total_units} {t("units")}</span>
            {tray.created_by && <span className="tag tag-gray">{t("createdBy")}: {tray.created_by}</span>}
          </div>

          {tray.fifo_violated && (
            <div className="warn-box">⚠ {t("fifoViolation")}</div>
          )}
          {isSplitParent && (
            <div className="warn-box">
              ✂ {t("traySplit")} <strong>{tray.id}-A</strong> {t("and")} <strong>{tray.id}-B</strong>. {t("scanEach")}
            </div>
          )}
          {isDone && (
            <div className="ok-box">✅ {t("trayComplete")}</div>
          )}

          {/* Actions */}
          {!isDone && !isSplitParent && (
            <>
              {/* Branch selection */}
              {isBranch && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ color: "var(--warn-text)", fontSize: 13, marginBottom: 10 }}>
                    ⚡ {t("selectSoldering")}
                  </p>
                  {BRANCH_OPTIONS.map(b => (
                    <button key={b.id} onClick={() => setBranch(b.id)}
                      style={{
                        ...S.branchBtn,
                        border: branch === b.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                        background: branch === b.id ? "rgba(55,138,221,.08)" : "var(--surface)",
                        color: "var(--text)",
                      }}>
                      <span style={{ fontSize: 22 }}>{b.icon}</span>
                      <span style={{ fontWeight: 700 }}>{b.label}</span>
                    </button>
                  ))}
                  <button
                    style={{
                      ...S.btnPrimary, width: "100%", marginTop: 10,
                      padding: 14, fontSize: 15,
                      opacity: (!branch || loading) ? 0.5 : 1,
                    }}
                    onClick={() => doScan(null, branch)}
                    disabled={!branch || loading}>
                    {loading ? t("loading") : "✔ " + t("confirmBranch")}
                  </button>
                </div>
              )}

              {/* Normal scan */}
              {!isBranch && (
                <button
                  style={{
                    ...S.btnPrimary, width: "100%", marginTop: 12, padding: 14, fontSize: 15,
                    opacity: (loading || !operator.trim()) ? 0.5 : 1,
                  }}
                  onClick={() => doScan()}
                  disabled={loading || !operator.trim()}>
                  {loading ? t("loading") : "✔ " + t("confirmScan")}
                </button>
              )}
            </>
          )}

          <button style={{ ...S.btn, width: "100%", marginTop: 10 }} onClick={reset}>
            🔄 {t("scanAnother")}
          </button>
        </div>
      )}
    </div>
  );
}

function stageColor(stage) {
  const c = {
    CREATED:"var(--muted)", RACK1_TOP:"#378ADD", RACK2_BTM:"#7F77DD",
    BAT_MOUNT:"#EF9F27",    BAT_SOL_R:"#E24B4A", BAT_SOL_M:"#5DCAA5",
    RACK3:"#D4537E",        DEPANEL_IN:"#BA7517", TESTING:"#185FA5",
    COMPLETE:"#3B6D11",     SPLIT:"#FAC775",
  };
  return { color: c[stage] || "var(--text)" };
}