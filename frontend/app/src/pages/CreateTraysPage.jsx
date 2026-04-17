import { useState, useEffect } from "react";
import { createTrays, getPipeline } from "../api/api";

const SHIFTS = ["Morning", "Afternoon", "Night"];

export default function CreateTraysPage() {
  const [pipeline,  setPipeline]  = useState(null);
  const [project,   setProject]   = useState("");
  const [shift,     setShift]     = useState("Morning");
  const [operator,  setOperator]  = useState("");
  const [batchNo,   setBatchNo]   = useState("");
  const [prefix,    setPrefix]    = useState("TRY");
  const [count,     setCount]     = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [created,   setCreated]   = useState([]);

  useEffect(() => { getPipeline().then(setPipeline); }, []);

  // Resolve whether split is enabled for the selected project
  function isSplitEnabled() {
    if (!pipeline || !project) return false;
    const cfg = pipeline.split || {};
    if (!cfg.enabled) return false;

    // Per-project override
    const proj = (pipeline.projects || []).find(p => p.id === project);
    if (!proj) return cfg.enabled;
    const override = proj.splitOverride || "inherit";
    if (override === "disabled") return false;
    if (override === "enabled")  return true;
    return cfg.enabled; // inherit
  }

  const splitEnabled   = isSplitEnabled();
  const projects       = pipeline?.projects || [];
  const selectedProj   = projects.find(p => p.id === project);
  const projUnits      = selectedProj
    ? (selectedProj.unitsPerTray || selectedProj.panels * selectedProj.unitsPerPanel || 450)
    : 450;
  const halfUnits      = Math.ceil(projUnits / 2);

  async function handleCreate() {
    if (!project)         { setError("Please select a project."); return; }
    if (!operator.trim()) { setError("Please enter operator name."); return; }
    if (count < 1 || count > 100) { setError("Count must be 1–100."); return; }

    setLoading(true); setError(""); setCreated([]);

    const ts    = Date.now() + Math.floor(Math.random() * 1000);
    const trays = Array.from({ length: count }, (_, i) => ({
      id:         `${prefix}-${ts}-${String(i + 1).padStart(3, "0")}`,
      project,
      shift,
      created_by: operator.trim(),
      batch_no:   batchNo.trim(),
    }));

    try {
      const result = await createTrays(trays);
      if (result.ok) setCreated(result.trays || []);
      else setError(result.error || "Failed to create trays.");
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  function printLabels() {
    const win = window.open("", "_blank");

    const labelHtml = (t, type = "parent") => {
      const isParent = type === "parent";
      const isChildA = type === "childA";
      const isChildB = type === "childB";
      const id       = isChildA ? `${t.id}-A` : isChildB ? `${t.id}-B` : t.id;
      const units    = isChildA || isChildB ? halfUnits : projUnits;

      // For child labels we show the pre-generated QR (same base64 but different ID displayed)
      const qr = isParent ? t.qr_base64
               : isChildA ? t.child_qr_a
               : t.child_qr_b;

      const borderColor = isParent ? "#185FA5"
                        : isChildA ? "#E24B4A"
                        : "#5DCAA5";
      const typeLabel   = isParent ? "MAIN LABEL"
                        : isChildA ? "PART A"
                        : "PART B";

      return `
        <div style="
          display:inline-block; width:200px; margin:10px;
          border:3px solid ${borderColor}; border-radius:10px;
          padding:12px; text-align:center; font-family:monospace;
          page-break-inside:avoid; background:#fff;
          position:relative;
        ">
          ${isParent && splitEnabled ? `<div style="
            position:absolute; top:-1px; left:50%; transform:translateX(-50%);
            background:#185FA5; color:#fff; font-size:9px; font-weight:bold;
            padding:2px 8px; border-radius:0 0 6px 6px; letter-spacing:.05em;
          ">PARENT · SCAN AFTER SPLIT</div>` : ""}
          ${!isParent ? `<div style="
            position:absolute; top:-1px; left:50%; transform:translateX(-50%);
            background:${borderColor}; color:#fff; font-size:9px; font-weight:bold;
            padding:2px 8px; border-radius:0 0 6px 6px; letter-spacing:.05em;
          ">${typeLabel}</div>` : ""}
          <img src="data:image/png;base64,${qr || t.qr_base64}"
               style="width:160px;height:160px;display:block;margin:12px auto 8px"/>
          <div style="font-size:12px;font-weight:bold;color:#111;letter-spacing:1px">${id}</div>
          <div style="font-size:10px;color:#555;margin-top:3px">${t.project}</div>
          <div style="font-size:9px;color:#888">${t.shift} · ${t.batch_no || "No batch"}</div>
          <div style="font-size:9px;color:#444;font-weight:600;margin-top:4px">
            ${units.toLocaleString()} units
          </div>
          ${isParent && splitEnabled ? `<div style="
            font-size:8px; color:#185FA5; margin-top:6px; border-top:1px solid #ddd;
            padding-top:5px;
          ">⚠ Parent QR — inactive after split<br>Scan Part A & Part B QRs instead</div>` : ""}
        </div>
      `;
    };

    const allLabels = created.flatMap(t => {
      if (splitEnabled) {
        // Parent label + Child A label + Child B label
        return [
          labelHtml(t, "parent"),
          labelHtml(t, "childA"),
          labelHtml(t, "childB"),
        ];
      }
      return [labelHtml(t, "main")];
    }).join("");

    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>Tray Labels</title>
        <style>
          body { margin:20px; background:#f5f5f5; }
          @media print { body { margin:0; background:#fff; } button { display:none; } }
        </style>
      </head><body>
        <button onclick="window.print()" style="
          margin-bottom:20px; padding:10px 24px; background:#185FA5;
          color:#fff; border:none; border-radius:6px; font-size:14px; cursor:pointer;
        ">🖨 Print Labels</button>
        ${splitEnabled ? `<p style="color:#555;font-size:12px;margin-bottom:16px">
          ℹ Split is enabled for <strong>${project}</strong> — each tray prints 3 labels:
          1 parent (archived after split) + Part A + Part B.
        </p>` : ""}
        <div>${allLabels}</div>
      </body></html>
    `);
    win.document.close();
  }

  function downloadQR(tray) {
    const link    = document.createElement("a");
    link.href     = `data:image/png;base64,${tray.qr_base64}`;
    link.download = `QR-${tray.id}.png`;
    link.click();
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Create form */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>➕ Create Trays</h3>

        <div style={styles.grid}>
          <div style={styles.field}>
            <label style={styles.label}>Project *</label>
            <select style={styles.input} value={project}
              onChange={e => setProject(e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Shift</label>
            <select style={styles.input} value={shift}
              onChange={e => setShift(e.target.value)}>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Operator *</label>
            <input style={styles.input} placeholder="Your name"
              value={operator} onChange={e => setOperator(e.target.value)} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Batch No</label>
            <input style={styles.input} placeholder="e.g. BATCH-2026-01"
              value={batchNo} onChange={e => setBatchNo(e.target.value)} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>ID Prefix</label>
            <input style={styles.input} placeholder="TRY"
              value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase())} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Number of Trays</label>
            <input style={styles.input} type="number" min={1} max={100}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(100, +e.target.value)))} />
          </div>
        </div>

        {/* Split indicator */}
        {project && (
          <div style={{
            background: splitEnabled ? "rgba(55,138,221,.08)" : "rgba(136,135,128,.08)",
            border: `1px solid ${splitEnabled ? "#378ADD44" : "#6B7E9544"}`,
            borderRadius: 8, padding: "10px 14px", marginBottom: 14,
            fontSize: 12, color: splitEnabled ? "#85B7EB" : "#6B7E95",
          }}>
            {splitEnabled
              ? `✂ Split is enabled for ${selectedProj?.label || project} — each tray will print 3 QR labels: 1 parent + Part A + Part B. Parent QR becomes read-only after splitting.`
              : `◎ Split is disabled for ${selectedProj?.label || project} — one QR label per tray.`}
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <button style={styles.btnGreen} onClick={handleCreate} disabled={loading}>
          {loading
            ? "Creating…"
            : `➕ Create ${count} Tray${count > 1 ? "s" : ""}${splitEnabled ? ` + ${count * 3} QR Labels` : ` + ${count} QR Label${count > 1 ? "s" : ""}`}`}
        </button>
      </div>

      {/* QR Results */}
      {created.length > 0 && (
        <div style={styles.card}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom: 16, flexWrap:"wrap", gap: 10,
          }}>
            <h3 style={styles.cardTitle}>
              ✅ {created.length} Tray{created.length > 1 ? "s" : ""} Created
              {splitEnabled && (
                <span style={{ fontSize:11, color:"#85B7EB", fontWeight:400, marginLeft:8 }}>
                  · {created.length * 3} labels total (parent + A + B each)
                </span>
              )}
            </h3>
            <button style={styles.btnBlue} onClick={printLabels}>
              🖨 Print All Labels
            </button>
          </div>

          {created.map(t => (
            <div key={t.id} style={{
              background:"#0A0F1A", border:"1px solid #1E2D42",
              borderRadius:10, padding:14, marginBottom:12,
            }}>
              {/* Tray header */}
              <div style={{
                display:"flex", alignItems:"center", gap:10,
                marginBottom:12, flexWrap:"wrap",
              }}>
                <span style={{ fontFamily:"monospace", fontSize:13,
                               fontWeight:700, color:"#E8EFF8" }}>
                  {t.id}
                </span>
                <span style={{ fontSize:11, color:"#6B7E95" }}>{t.project}</span>
                <span style={{ fontSize:11, color:"#6B7E95" }}>{t.shift}</span>
                {t.batch_no && (
                  <span style={{ fontSize:11, color:"#6B7E95" }}>
                    Batch: {t.batch_no}
                  </span>
                )}
                <button style={styles.btnSmall} onClick={() => downloadQR(t)}>
                  ⬇ Parent QR
                </button>
              </div>

              {splitEnabled ? (
                /* Split layout: 3 labels side by side */
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  {/* Parent QR */}
                  <QRCard
                    qr={t.qr_base64}
                    id={t.id}
                    label="Parent QR"
                    labelColor="#378ADD"
                    note="Archived after split"
                    units={projUnits}
                    badge="PARENT"
                  />
                  {/* Child A */}
                  <QRCard
                    qr={t.child_qr_a || t.qr_base64}
                    id={`${t.id}-A`}
                    label="Part A"
                    labelColor="#E24B4A"
                    note={`${halfUnits} units`}
                    units={halfUnits}
                    badge="PART A"
                    badgeColor="#E24B4A"
                  />
                  {/* Child B */}
                  <QRCard
                    qr={t.child_qr_b || t.qr_base64}
                    id={`${t.id}-B`}
                    label="Part B"
                    labelColor="#5DCAA5"
                    note={`${projUnits - halfUnits} units`}
                    units={projUnits - halfUnits}
                    badge="PART B"
                    badgeColor="#5DCAA5"
                  />
                </div>
              ) : (
                /* No split: single label */
                <QRCard
                  qr={t.qr_base64}
                  id={t.id}
                  label="QR Label"
                  labelColor="#378ADD"
                  units={projUnits}
                />
              )}
            </div>
          ))}

          {splitEnabled && (
            <p style={{ fontSize:11, color:"#6B7E95", marginTop:8 }}>
              💡 Print all 3 labels for each tray and attach them.
              The Parent QR shows tray status until split — after splitting, use Part A and Part B QRs to advance through stages independently.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── QR label card ─────────────────────────────────────────────────────────────
function QRCard({ qr, id, label, labelColor, note, units, badge, badgeColor }) {
  function download() {
    const a    = document.createElement("a");
    a.href     = `data:image/png;base64,${qr}`;
    a.download = `QR-${id}.png`;
    a.click();
  }

  return (
    <div style={{
      background:"#162032",
      border:`1px solid ${labelColor}33`,
      borderTop:`2px solid ${labelColor}`,
      borderRadius:8, padding:12, textAlign:"center",
    }}>
      {badge && (
        <div style={{
          fontSize:9, fontWeight:700, color:badgeColor || labelColor,
          textTransform:"uppercase", letterSpacing:".08em",
          marginBottom:6,
        }}>
          {badge}
        </div>
      )}
      <img
        src={`data:image/png;base64,${qr}`}
        alt={`QR for ${id}`}
        style={{ width:110, height:110, display:"block", margin:"0 auto 8px" }}
      />
      <div style={{ fontFamily:"monospace", fontSize:10, fontWeight:700,
                    color:"#E8EFF8", letterSpacing:.5, marginBottom:3 }}>
        {id}
      </div>
      {units !== undefined && (
        <div style={{ fontSize:10, color:labelColor, fontWeight:600 }}>
          {units.toLocaleString()} units
        </div>
      )}
      {note && (
        <div style={{ fontSize:9, color:"#6B7E95", marginTop:2 }}>{note}</div>
      )}
      <button onClick={download}
        style={{ marginTop:8, width:"100%", padding:"5px 0",
                 background:"#111827", color:"#6B7E95",
                 border:"1px solid #1E2D42", borderRadius:5,
                 fontSize:10, cursor:"pointer" }}>
        ⬇ Download
      </button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  card: {
    background:"#162032", border:"1px solid #1E2D42",
    borderRadius:12, padding:20, marginBottom:16,
  },
  cardTitle: {
    fontSize:14, fontWeight:700, color:"#E8EFF8",
    textTransform:"uppercase", letterSpacing:".06em", marginBottom:16,
  },
  grid:  { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 },
  field: { display:"flex", flexDirection:"column", gap:5 },
  label: { fontSize:12, color:"#6B7E95", fontWeight:600 },
  input: {
    padding:"10px 13px", border:"1px solid #1E2D42",
    borderRadius:7, background:"#111827", color:"#E8EFF8",
    fontSize:13, outline:"none", width:"100%", boxSizing:"border-box",
  },
  errorBox: {
    background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)",
    borderRadius:8, padding:12, color:"#F09595", fontSize:13, marginBottom:12,
  },
  btnGreen: {
    width:"100%", padding:14, background:"#3B6D11", color:"#EAF3DE",
    border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer",
  },
  btnBlue: {
    padding:"10px 20px", background:"#185FA5", color:"#E6F1FB",
    border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer",
  },
  btnSmall: {
    padding:"5px 10px", background:"#111827", color:"#6B7E95",
    border:"1px solid #1E2D42", borderRadius:6, fontSize:11, cursor:"pointer",
  },
};