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
  const [created,   setCreated]   = useState([]);  // array of { id, qr_base64, ... }

  useEffect(() => {
    getPipeline().then(setPipeline);
  }, []);

  async function handleCreate() {
    if (!project)  { setError("Please select a project."); return; }
    if (!operator.trim()) { setError("Please enter operator name."); return; }
    if (count < 1 || count > 100) { setError("Count must be 1–100."); return; }

    setLoading(true);
    setError("");
    setCreated([]);

    // Build tray IDs: PREFIX-timestamp-001, PREFIX-timestamp-002 ...
    const ts   = Date.now() + Math.floor(Math.random() * 1000);
    const trays = Array.from({ length: count }, (_, i) => ({
      id:         `${prefix}-${ts}-${String(i + 1).padStart(3, "0")}`,
      project,
      shift,
      created_by: operator.trim(),
      batch_no:   batchNo.trim(),
    }));

    try {
      const result = await createTrays(trays);
      if (result.ok) {
        setCreated(result.trays || []);
      } else {
        setError(result.error || "Failed to create trays.");
      }
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  function printLabels() {
    const win = window.open("", "_blank");
    const labelsHtml = created.map((t) => `
      <div style="
        display:inline-block; width:200px; margin:12px;
        border:2px solid #000; border-radius:8px;
        padding:14px; text-align:center;
        font-family:monospace; page-break-inside:avoid;
      ">
        <img src="data:image/png;base64,${t.qr_base64}"
             style="width:160px;height:160px;display:block;margin:0 auto 10px" />
        <div style="font-size:13px;font-weight:bold;letter-spacing:1px">${t.id}</div>
        <div style="font-size:11px;color:#555;margin-top:4px">${t.project}</div>
        <div style="font-size:10px;color:#777">${t.shift} · ${t.batch_no || "No batch"}</div>
      </div>
    `).join("");

    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>Tray Labels</title>
        <style>
          body { margin:20px; background:#fff; }
          @media print {
            body { margin:0; }
            button { display:none; }
          }
        </style>
      </head><body>
        <button onclick="window.print()" style="
          margin-bottom:20px; padding:10px 24px; background:#185FA5;
          color:#fff; border:none; border-radius:6px; font-size:14px; cursor:pointer;
        ">🖨 Print Labels</button>
        <div>${labelsHtml}</div>
      </body></html>
    `);
    win.document.close();
  }

  const projects = pipeline?.projects || [];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>

      {/* ── Create form ── */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>➕ Create Trays</h3>

        <div style={styles.grid}>
          {/* Project */}
          <div style={styles.field}>
            <label style={styles.label}>Project *</label>
            <select style={styles.input} value={project} onChange={e => setProject(e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Shift */}
          <div style={styles.field}>
            <label style={styles.label}>Shift</label>
            <select style={styles.input} value={shift} onChange={e => setShift(e.target.value)}>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Operator */}
          <div style={styles.field}>
            <label style={styles.label}>Operator *</label>
            <input style={styles.input} placeholder="Your name"
              value={operator} onChange={e => setOperator(e.target.value)} />
          </div>

          {/* Batch */}
          <div style={styles.field}>
            <label style={styles.label}>Batch No</label>
            <input style={styles.input} placeholder="e.g. BATCH-2026-01"
              value={batchNo} onChange={e => setBatchNo(e.target.value)} />
          </div>

          {/* ID Prefix */}
          <div style={styles.field}>
            <label style={styles.label}>ID Prefix</label>
            <input style={styles.input} placeholder="TRY"
              value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} />
          </div>

          {/* Count */}
          <div style={styles.field}>
            <label style={styles.label}>Number of Trays</label>
            <input style={styles.input} type="number" min={1} max={100}
              value={count} onChange={e => setCount(Math.max(1, Math.min(100, +e.target.value)))} />
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <button style={styles.btnGreen} onClick={handleCreate} disabled={loading}>
          {loading ? "Creating…" : `➕ Create ${count} Tray${count > 1 ? "s" : ""} + Generate QR Codes`}
        </button>
      </div>

      {/* ── QR Results ── */}
      {created.length > 0 && (
        <div style={styles.card}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <h3 style={styles.cardTitle}>
              ✅ {created.length} Tray{created.length > 1 ? "s" : ""} Created
            </h3>
            <button style={styles.btnBlue} onClick={printLabels}>
              🖨 Print All Labels
            </button>
          </div>

          {/* QR Grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:14 }}>
            {created.map((t) => (
              <div key={t.id} style={styles.labelCard}>
                {/* QR code image */}
                <img
                  src={`data:image/png;base64,${t.qr_base64}`}
                  alt={`QR for ${t.id}`}
                  style={{ width:150, height:150, display:"block", margin:"0 auto 10px" }}
                />
                {/* Tray info */}
                <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700,
                              color:"#E8EFF8", textAlign:"center", letterSpacing:1 }}>
                  {t.id}
                </div>
                <div style={{ fontSize:11, color:"#6B7E95", textAlign:"center", marginTop:4 }}>
                  {t.project}
                </div>
                <div style={{ fontSize:10, color:"#4A5568", textAlign:"center" }}>
                  {t.shift} · {t.batch_no || "—"}
                </div>

                {/* Individual download button */}
                <button
                  style={{ ...styles.btnSmall, marginTop:10, width:"100%" }}
                  onClick={() => downloadQR(t)}
                >
                  ⬇ Download
                </button>
              </div>
            ))}
          </div>

          <p style={{ fontSize:11, color:"#6B7E95", marginTop:14 }}>
            💡 Each QR code links to the scan page. Point any mobile camera at it to scan.
          </p>
        </div>
      )}
    </div>
  );
}

function downloadQR(tray) {
  const link    = document.createElement("a");
  link.href     = `data:image/png;base64,${tray.qr_base64}`;
  link.download = `QR-${tray.id}.png`;
  link.click();
}

/* ── Styles ──────────────────────────────────────────────────────────────── */
const styles = {
  card: {
    background:"#162032", border:"1px solid #1E2D42",
    borderRadius:12, padding:20, marginBottom:16,
  },
  cardTitle: {
    fontSize:14, fontWeight:700, color:"#E8EFF8",
    textTransform:"uppercase", letterSpacing:".06em",
    marginBottom:16,
  },
  grid: {
    display:"grid", gridTemplateColumns:"1fr 1fr",
    gap:12, marginBottom:14,
  },
  field:  { display:"flex", flexDirection:"column", gap:5 },
  label:  { fontSize:12, color:"#6B7E95", fontWeight:600 },
  input: {
    padding:"10px 13px", border:"1px solid #1E2D42",
    borderRadius:7, background:"#111827", color:"#E8EFF8",
    fontSize:13, outline:"none", width:"100%", boxSizing:"border-box",
  },
  errorBox: {
    background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.5)",
    borderRadius:8, padding:12, color:"#F09595",
    fontSize:13, marginBottom:12,
  },
  btnGreen: {
    width:"100%", padding:14, background:"#3B6D11",
    color:"#EAF3DE", border:"none", borderRadius:10,
    fontSize:14, fontWeight:700, cursor:"pointer",
  },
  btnBlue: {
    padding:"10px 20px", background:"#185FA5",
    color:"#E6F1FB", border:"none", borderRadius:8,
    fontSize:13, fontWeight:700, cursor:"pointer",
  },
  btnSmall: {
    padding:"7px 10px", background:"#111827",
    color:"#6B7E95", border:"1px solid #1E2D42",
    borderRadius:6, fontSize:11, cursor:"pointer",
  },
  labelCard: {
    background:"#0A0F1A", border:"1px solid #1E2D42",
    borderRadius:10, padding:14,
  },
};