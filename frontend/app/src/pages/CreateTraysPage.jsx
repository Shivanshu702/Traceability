import { useState, useEffect } from "react";
import { createTrays, getPipeline } from "../api/api";
import { useLang } from "../context/LangContext";

const SHIFTS = ["Morning", "Afternoon", "Night"];

export default function CreateTraysPage() {
  const { t } = useLang();

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

  function isSplitEnabled() {
    if (!pipeline || !project) return false;
    const cfg  = pipeline.split || {};
    if (!cfg.enabled) return false;
    const proj = (pipeline.projects || []).find(p => p.id === project);
    if (!proj) return cfg.enabled;
    const ov = proj.splitOverride || "inherit";
    if (ov === "disabled") return false;
    if (ov === "enabled")  return true;
    return cfg.enabled;
  }

  const splitEnabled  = isSplitEnabled();
  const projects      = pipeline?.projects || [];
  const selectedProj  = projects.find(p => p.id === project);
  const projUnits     = selectedProj
    ? (selectedProj.unitsPerTray || selectedProj.panels * selectedProj.unitsPerPanel || 450)
    : 450;
  const halfUnits = Math.ceil(projUnits / 2);

  async function handleCreate() {
    if (!project)         { setError("Please select a project."); return; }
    if (!operator.trim()) { setError("Please enter operator name."); return; }
    if (count < 1 || count > 100) { setError("Count must be 1–100."); return; }
    setLoading(true); setError(""); setCreated([]);
    const ts    = Date.now() + Math.floor(Math.random() * 1000);
    const trays = Array.from({ length: count }, (_, i) => ({
      id:         `${prefix}-${ts}-${String(i + 1).padStart(3, "0")}`,
      project, shift, created_by: operator.trim(), batch_no: batchNo.trim(),
    }));
    try {
      const result = await createTrays(trays);
      if (result.ok) setCreated(result.trays || []);
      else setError(result.error || "Failed to create trays.");
    } catch { setError(t("cannotReachServer")); }
    finally  { setLoading(false); }
  }

  function printLabels() {
    const win = window.open("", "_blank");
    const labelHtml = (tr, type = "parent") => {
      const isParent = type === "parent", isChildA = type === "childA", isChildB = type === "childB";
      const id    = isChildA ? `${tr.id}-A` : isChildB ? `${tr.id}-B` : tr.id;
      const units = isChildA || isChildB ? halfUnits : projUnits;
      const qr    = isParent ? tr.qr_base64 : isChildA ? tr.child_qr_a : tr.child_qr_b;
      const borderColor = isParent ? "#185FA5" : isChildA ? "#E24B4A" : "#5DCAA5";
      const typeLabel   = isParent ? "MAIN LABEL" : isChildA ? "PART A" : "PART B";
      return `
        <div style="display:inline-block;width:200px;margin:10px;border:3px solid ${borderColor};border-radius:10px;padding:12px;text-align:center;font-family:monospace;page-break-inside:avoid;background:#fff;position:relative;">
          ${!isParent ? `<div style="position:absolute;top:-1px;left:50%;transform:translateX(-50%);background:${borderColor};color:#fff;font-size:9px;font-weight:bold;padding:2px 8px;border-radius:0 0 6px 6px;">${typeLabel}</div>` : ""}
          <img src="data:image/png;base64,${qr || tr.qr_base64}" style="width:160px;height:160px;display:block;margin:12px auto 8px"/>
          <div style="font-size:12px;font-weight:bold;color:#111;letter-spacing:1px">${id}</div>
          <div style="font-size:10px;color:#555;margin-top:3px">${tr.project}</div>
          <div style="font-size:9px;color:#888">${tr.shift} · ${tr.batch_no || "No batch"}</div>
          <div style="font-size:9px;color:#444;font-weight:600;margin-top:4px">${units.toLocaleString()} units</div>
        </div>`;
    };
    const allLabels = created.flatMap(tr => splitEnabled
      ? [labelHtml(tr,"parent"), labelHtml(tr,"childA"), labelHtml(tr,"childB")]
      : [labelHtml(tr,"main")]).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Tray Labels</title>
      <style>body{margin:20px;background:#f5f5f5;}@media print{body{margin:0;background:#fff;}button{display:none;}}</style>
      </head><body>
      <button onclick="window.print()" style="margin-bottom:20px;padding:10px 24px;background:#185FA5;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨 Print Labels</button>
      <div>${allLabels}</div></body></html>`);
    win.document.close();
  }

  function downloadQR(tray) {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${tray.qr_base64}`;
    link.download = `QR-${tray.id}.png`;
    link.click();
  }

  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      {/* Create form */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>➕ {t("createTrays")}</h3>

        <div style={S.grid}>
          <div style={S.field}>
            <label style={S.label}>{t("project")} *</label>
            <select style={S.input} value={project} onChange={e => setProject(e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.label}>{t("shift")}</label>
            <select style={S.input} value={shift} onChange={e => setShift(e.target.value)}>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.label}>{t("operator")} *</label>
            <input style={S.input} placeholder="Your name" value={operator} onChange={e => setOperator(e.target.value)} />
          </div>
          <div style={S.field}>
            <label style={S.label}>{t("batchNo")}</label>
            <input style={S.input} placeholder="e.g. BATCH-2026-01" value={batchNo} onChange={e => setBatchNo(e.target.value)} />
          </div>
          <div style={S.field}>
            <label style={S.label}>{t("prefix")}</label>
            <input style={S.input} placeholder="TRY" value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} />
          </div>
          <div style={S.field}>
            <label style={S.label}>{t("numTrays")}</label>
            <input style={S.input} type="number" min={1} max={100} value={count}
              onChange={e => setCount(Math.max(1, Math.min(100, +e.target.value)))} />
          </div>
        </div>

        {/* Split indicator */}
        {project && (
          <div style={{
            background: splitEnabled ? "var(--note-bg)" : "var(--tag-gray-bg)",
            border: `1px solid ${splitEnabled ? "var(--note-border)" : "var(--border)"}`,
            borderRadius:8, padding:"10px 14px", marginBottom:14,
            fontSize:12, color: splitEnabled ? "var(--note-text)" : "var(--muted)",
          }}>
            {splitEnabled
              ? `✂ Split is enabled for ${selectedProj?.label || project} — each tray prints 3 QR labels: 1 parent + Part A + Part B.`
              : `◎ Split is disabled for ${selectedProj?.label || project} — one QR label per tray.`}
          </div>
        )}

        {error && <div className="err-box">{error}</div>}

        <button style={S.btnGreen} onClick={handleCreate} disabled={loading}>
          {loading ? "Creating…" : `➕ ${t("createBtn")} ${count > 1 ? `(${count})` : ""}${splitEnabled ? ` + ${count * 3} QR Labels` : ` + ${count} QR Label${count > 1 ? "s" : ""}`}`}
        </button>
      </div>

      {/* QR Results */}
      {created.length > 0 && (
        <div style={S.card}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <h3 style={S.cardTitle}>
              ✅ {created.length} Tray{created.length > 1 ? "s" : ""} Created
              {splitEnabled && (
                <span style={{ fontSize:11, color:"var(--note-text)", fontWeight:400, marginLeft:8 }}>
                  · {created.length * 3} labels total
                </span>
              )}
            </h3>
            <button style={S.btnBlue} onClick={printLabels}>🖨 Print All Labels</button>
          </div>

          {created.map(tr => (
            <div key={tr.id} style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:700, color:"var(--text)" }}>{tr.id}</span>
                <span style={{ fontSize:11, color:"var(--muted)" }}>{tr.project}</span>
                <span style={{ fontSize:11, color:"var(--muted)" }}>{tr.shift}</span>
                {tr.batch_no && <span style={{ fontSize:11, color:"var(--muted)" }}>Batch: {tr.batch_no}</span>}
                <button style={S.btnSmall} onClick={() => downloadQR(tr)}>⬇ Parent QR</button>
              </div>

              {splitEnabled ? (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <QRCard qr={tr.qr_base64}        id={tr.id}          labelColor="#378ADD" badge="PARENT"  units={projUnits}          note="Archived after split" />
                  <QRCard qr={tr.child_qr_a || tr.qr_base64} id={`${tr.id}-A`} labelColor="#E24B4A" badge="PART A"   units={halfUnits}           />
                  <QRCard qr={tr.child_qr_b || tr.qr_base64} id={`${tr.id}-B`} labelColor="#5DCAA5" badge="PART B"   units={projUnits - halfUnits} />
                </div>
              ) : (
                <QRCard qr={tr.qr_base64} id={tr.id} labelColor="#378ADD" units={projUnits} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── QR label card ──────────────────────────────────────────────────────────────
function QRCard({ qr, id, labelColor, note, units, badge, badgeColor }) {
  function download() {
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${qr}`; a.download = `QR-${id}.png`; a.click();
  }
  return (
    <div style={{ background:"var(--card)", border:`1px solid ${labelColor}33`, borderTop:`2px solid ${labelColor}`, borderRadius:8, padding:12, textAlign:"center" }}>
      {badge && (
        <div style={{ fontSize:9, fontWeight:700, color:badgeColor||labelColor, textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>
          {badge}
        </div>
      )}
      <img src={`data:image/png;base64,${qr}`} alt={`QR for ${id}`}
        style={{ width:110, height:110, display:"block", margin:"0 auto 8px" }} />
      <div style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color:"var(--text)", letterSpacing:.5, marginBottom:3 }}>{id}</div>
      {units !== undefined && <div style={{ fontSize:10, color:labelColor, fontWeight:600 }}>{units.toLocaleString()} units</div>}
      {note && <div style={{ fontSize:9, color:"var(--muted)", marginTop:2 }}>{note}</div>}
      <button onClick={download}
        style={{ marginTop:8, width:"100%", padding:"5px 0", background:"var(--inp-bg)", color:"var(--muted)", border:"1px solid var(--border)", borderRadius:5, fontSize:10, cursor:"pointer" }}>
        ⬇ Download
      </button>
    </div>
  );
}

// ── Styles — all CSS variables ─────────────────────────────────────────────────
const S = {
  card:      { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:20, marginBottom:16 },
  cardTitle: { fontSize:14, fontWeight:700, color:"var(--text)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:16 },
  grid:      { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 },
  field:     { display:"flex", flexDirection:"column", gap:5 },
  label:     { fontSize:12, color:"var(--muted)", fontWeight:600 },
  input:     { padding:"10px 13px", border:"1px solid var(--border)", borderRadius:7, background:"var(--inp-bg)", color:"var(--text)", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" },
  btnGreen:  { width:"100%", padding:14, background:"var(--green)", color:"var(--green-lt)", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" },
  btnBlue:   { padding:"10px 20px", background:"var(--accent-dk)", color:"var(--accent-text)", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" },
  btnSmall:  { padding:"5px 10px", background:"var(--inp-bg)", color:"var(--muted)", border:"1px solid var(--border)", borderRadius:6, fontSize:11, cursor:"pointer" },
};