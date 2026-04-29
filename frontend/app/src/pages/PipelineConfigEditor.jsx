

import { useEffect, useState } from "react";
import { getAdminPipelineConfig, saveAdminPipelineConfig } from "../api/api";

// ── colour palette for stage picker ──────────────────────────────────────────
const PALETTE = [
  "#378ADD","#7F77DD","#EF9F27","#E24B4A","#5DCAA5",
  "#D4537E","#BA7517","#185FA5","#3B6D11","#888780",
  "#9B59B6","#E67E22","#1ABC9C","#E74C3C","#2ECC71",
];

// ── tiny helpers ──────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// rebuild next-pointers so they always reflect array order
function rebuildNext(stages) {
  return stages.map((s, i) => ({
    ...s,
    next: i < stages.length - 1 ? stages[i + 1].id : null,
  }));
}

// ── shared style tokens ───────────────────────────────────────────────────────
const S = {
  card:    { background:"#0D1320", border:"1px solid #1E2D42", borderRadius:12, padding:"18px 20px", marginBottom:14 },
  label:   { fontSize:11, fontWeight:700, color:"#6B7E95", textTransform:"uppercase", letterSpacing:".07em", marginBottom:6, display:"block" },
  input:   { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #1E2D42", background:"#111827", color:"#E8EFF8", fontSize:13, boxSizing:"border-box", outline:"none" },
  select:  { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #1E2D42", background:"#111827", color:"#E8EFF8", fontSize:13, boxSizing:"border-box", outline:"none", cursor:"pointer" },
  btn:     { padding:"8px 16px", borderRadius:8, border:"1px solid #1E2D42", background:"#111827", color:"#E8EFF8", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  btnPrimary: { padding:"8px 16px", borderRadius:8, border:"none", background:"#185FA5", color:"#E6F1FB", fontSize:12, cursor:"pointer", fontWeight:700, fontFamily:"inherit" },
  btnRed:  { padding:"8px 16px", borderRadius:8, border:"1px solid #A32D2D44", background:"rgba(163,45,45,.15)", color:"#F09595", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  btnGreen:{ padding:"8px 16px", borderRadius:8, border:"none", background:"#27500A", color:"#C0DD97", fontSize:12, cursor:"pointer", fontWeight:700, fontFamily:"inherit" },
  row:     { display:"flex", gap:10, alignItems:"flex-start" },
  tag:     (col) => ({ background:col+"22", color:col, borderRadius:5, padding:"2px 9px", fontSize:11, fontWeight:700, display:"inline-block" }),
  sectionTitle: { fontSize:11, fontWeight:700, color:"#6B7E95", textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 },
};

// ── colour picker strip ───────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
      {PALETTE.map(c => (
        <div key={c} onClick={() => onChange(c)} style={{
          width:22, height:22, borderRadius:5, background:c, cursor:"pointer",
          outline: value === c ? `3px solid ${c}` : "2px solid transparent",
          outlineOffset:2,
        }}/>
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width:22, height:22, border:"none", background:"none", cursor:"pointer", padding:0 }}
        title="Custom colour"
      />
    </div>
  );
}

// ── inline edit form for a single stage ──────────────────────────────────────
function StageEditor({ stage, onSave, onCancel }) {
  const [form, setForm] = useState({ ...stage });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ background:"#0A0F1A", border:"1px solid #378ADD44", borderRadius:10, padding:16, marginTop:8 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <div>
          <span style={S.label}>Stage ID (read-only)</span>
          <input style={{ ...S.input, opacity:.5 }} value={form.id} readOnly/>
        </div>
        <div>
          <span style={S.label}>Display Label</span>
          <input style={S.input} value={form.label} onChange={e => set("label", e.target.value)}/>
        </div>
        <div>
          <span style={S.label}>Scan Note (shown to operator)</span>
          <input style={S.input} value={form.scanNote || ""} onChange={e => set("scanNote", e.target.value)}/>
        </div>
        <div>
          <span style={S.label}>Stuck Alert Threshold</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="number" min={300} step={300} style={{ ...S.input, width:100 }}
              value={Math.round((form.stuckLimitSeconds||3600)/60)}
              onChange={e => set("stuckLimitSeconds", Number(e.target.value)*60)}
            />
            <span style={{ color:"#6B7E95", fontSize:12 }}>minutes</span>
          </div>
        </div>
      </div>
      <span style={S.label}>Stage Colour</span>
      <ColorPicker value={form.color||"#888780"} onChange={v => set("color", v)}/>
      <div style={{ display:"flex", gap:8, marginTop:16 }}>
        <button style={S.btnPrimary} onClick={() => onSave(form)}>Save stage</button>
        <button style={S.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── stages tab ────────────────────────────────────────────────────────────────
function StagesTab({ config, setConfig }) {
  const [editing, setEditing]   = useState(null);   // stage id being edited
  const [adding,  setAdding]    = useState(false);
  const [newStage, setNewStage] = useState({ id:"", label:"", color:"#378ADD", scanNote:"", stuckLimitSeconds:3600 });

  const stages = config.stages || [];

  function move(idx, dir) {
    const arr = [...stages];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setConfig(c => ({ ...c, stages: rebuildNext(arr) }));
  }

  function saveEdit(updated) {
    setConfig(c => ({
      ...c,
      stages: rebuildNext(c.stages.map(s => s.id === updated.id ? updated : s)),
    }));
    setEditing(null);
  }

  function deleteStage(id) {
    if (!window.confirm(`Delete stage "${id}"? This will also remove it from any project overrides.`)) return;
    setConfig(c => ({ ...c, stages: rebuildNext(c.stages.filter(s => s.id !== id)) }));
  }

  function addStage() {
    if (!newStage.id.trim() || !newStage.label.trim()) return alert("ID and Label are required.");
    if (stages.find(s => s.id === newStage.id.trim().toUpperCase())) return alert("Stage ID already exists.");
    const s = { ...newStage, id: newStage.id.trim().toUpperCase() };
    setConfig(c => ({ ...c, stages: rebuildNext([...c.stages, s]) }));
    setNewStage({ id:"", label:"", color:"#378ADD", scanNote:"", stuckLimitSeconds:3600 });
    setAdding(false);
  }

  return (
    <div>
      {/* Pipeline flow preview */}
      <div style={{ ...S.card, padding:"12px 16px", marginBottom:16 }}>
        <div style={S.sectionTitle}>Pipeline flow</div>
        <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:4 }}>
          {stages.map((s, i) => (
            <span key={s.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={S.tag(s.color||"#888780")}>{s.label}</span>
              {i < stages.length-1 && <span style={{ color:"#6B7E95", fontSize:12 }}>›</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Stage list */}
      {stages.map((s, i) => (
        <div key={s.id}>
          <div style={{ ...S.card, padding:"12px 16px", marginBottom:editing===s.id ? 0 : 8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:12, height:12, borderRadius:3, background:s.color||"#888780", flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#E8EFF8" }}>{s.label}</div>
                <div style={{ fontSize:11, color:"#6B7E95", marginTop:2 }}>
                  {s.id} · alert after {Math.round((s.stuckLimitSeconds||3600)/60)} min
                  {s.scanNote ? ` · "${s.scanNote}"` : ""}
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{ ...S.btn, padding:"4px 8px" }} onClick={() => move(i,-1)} disabled={i===0} title="Move up">↑</button>
                <button style={{ ...S.btn, padding:"4px 8px" }} onClick={() => move(i,1)} disabled={i===stages.length-1} title="Move down">↓</button>
                <button style={{ ...S.btn, padding:"4px 10px" }} onClick={() => setEditing(editing===s.id ? null : s.id)}>Edit</button>
                <button style={{ ...S.btnRed, padding:"4px 10px" }} onClick={() => deleteStage(s.id)}>Delete</button>
              </div>
            </div>
          </div>
          {editing === s.id && (
            <div style={{ marginBottom:8 }}>
              <StageEditor stage={s} onSave={saveEdit} onCancel={() => setEditing(null)}/>
            </div>
          )}
        </div>
      ))}

      {/* Add stage */}
      {!adding ? (
        <button style={{ ...S.btnGreen, marginTop:4 }} onClick={() => setAdding(true)}>+ Add stage</button>
      ) : (
        <div style={{ ...S.card, border:"1px solid #3B6D1155" }}>
          <div style={S.sectionTitle}>New stage</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <span style={S.label}>Stage ID (e.g. LASER_CUT)</span>
              <input style={S.input} placeholder="LASER_CUT" value={newStage.id}
                onChange={e => setNewStage(f => ({ ...f, id: e.target.value.toUpperCase() }))}/>
            </div>
            <div>
              <span style={S.label}>Display label</span>
              <input style={S.input} placeholder="Laser Cutting" value={newStage.label}
                onChange={e => setNewStage(f => ({ ...f, label: e.target.value }))}/>
            </div>
            <div>
              <span style={S.label}>Scan note</span>
              <input style={S.input} placeholder="Operator message when scanned" value={newStage.scanNote}
                onChange={e => setNewStage(f => ({ ...f, scanNote: e.target.value }))}/>
            </div>
            <div>
              <span style={S.label}>Stuck alert threshold</span>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" min={5} step={5} style={{ ...S.input, width:90 }}
                  value={Math.round(newStage.stuckLimitSeconds/60)}
                  onChange={e => setNewStage(f => ({ ...f, stuckLimitSeconds: Number(e.target.value)*60 }))}/>
                <span style={{ color:"#6B7E95", fontSize:12 }}>minutes</span>
              </div>
            </div>
          </div>
          <span style={S.label}>Colour</span>
          <ColorPicker value={newStage.color} onChange={v => setNewStage(f => ({ ...f, color:v }))}/>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <button style={S.btnPrimary} onClick={addStage}>Add to pipeline</button>
            <button style={S.btn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── projects tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ config, setConfig }) {
  const [editing, setEditing] = useState(null);
  const [adding,  setAdding]  = useState(false);
  const [newProj, setNewProj] = useState({ id:"", label:"", panels:50, unitsPerPanel:9 });

  const projects = config.projects || [];

  function saveProject(updated) {
    const withUnits = { ...updated, unitsPerTray: updated.panels * updated.unitsPerPanel };
    setConfig(c => ({
      ...c,
      projects: c.projects.map(p => p.id === withUnits.id ? withUnits : p),
    }));
    setEditing(null);
  }

  function deleteProject(id) {
    if (!window.confirm(`Remove project "${id}"?`)) return;
    setConfig(c => ({ ...c, projects: c.projects.filter(p => p.id !== id) }));
  }

  function addProject() {
    if (!newProj.id.trim() || !newProj.label.trim()) return alert("ID and Label are required.");
    if (projects.find(p => p.id === newProj.id.trim().toUpperCase())) return alert("Project ID already exists.");
    const p = {
      id: newProj.id.trim().toUpperCase(),
      label: newProj.label.trim(),
      panels: Number(newProj.panels),
      unitsPerPanel: Number(newProj.unitsPerPanel),
      unitsPerTray: Number(newProj.panels) * Number(newProj.unitsPerPanel),
      stageIds: [], splitOverride:"inherit", branchOverride:"inherit", branchOptions:[],
    };
    setConfig(c => ({ ...c, projects: [...c.projects, p] }));
    setNewProj({ id:"", label:"", panels:50, unitsPerPanel:9 });
    setAdding(false);
  }

  return (
    <div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr style={{ borderBottom:"1px solid #1E2D42" }}>
            {["ID","Label","Panels","Units/Panel","Units/Tray","Split","Branch",""].map(h => (
              <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"#6B7E95", textTransform:"uppercase", letterSpacing:".06em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <>
              <tr key={p.id} style={{ borderBottom:"1px solid #1E2D4244" }}>
                <td style={{ padding:"10px 10px", fontSize:12, color:"#85B7EB", fontWeight:700 }}>{p.id}</td>
                <td style={{ padding:"10px 10px", fontSize:13, color:"#E8EFF8" }}>{p.label}</td>
                <td style={{ padding:"10px 10px", fontSize:13, color:"#E8EFF8" }}>{p.panels}</td>
                <td style={{ padding:"10px 10px", fontSize:13, color:"#E8EFF8" }}>{p.unitsPerPanel}</td>
                <td style={{ padding:"10px 10px", fontSize:13, fontWeight:700, color:"#5DCAA5" }}>{p.unitsPerTray}</td>
                <td style={{ padding:"10px 10px" }}><span style={S.tag("#EF9F27")}>{p.splitOverride}</span></td>
                <td style={{ padding:"10px 10px" }}><span style={S.tag("#7F77DD")}>{p.branchOverride}</span></td>
                <td style={{ padding:"10px 10px" }}>
                  <div style={{ display:"flex", gap:6 }}>
                    <button style={{ ...S.btn, padding:"4px 10px" }} onClick={() => setEditing(editing===p.id ? null : p.id)}>Edit</button>
                    <button style={{ ...S.btnRed, padding:"4px 10px" }} onClick={() => deleteProject(p.id)}>✕</button>
                  </div>
                </td>
              </tr>
              {editing === p.id && (
                <tr key={p.id+"_edit"}>
                  <td colSpan={8} style={{ padding:"0 0 12px 0" }}>
                    <ProjectEditor project={p} onSave={saveProject} onCancel={() => setEditing(null)}/>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {!adding ? (
        <button style={S.btnGreen} onClick={() => setAdding(true)}>+ Add project</button>
      ) : (
        <div style={{ ...S.card, border:"1px solid #3B6D1155" }}>
          <div style={S.sectionTitle}>New project</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
            <div>
              <span style={S.label}>Project ID</span>
              <input style={S.input} placeholder="PD8" value={newProj.id}
                onChange={e => setNewProj(f => ({ ...f, id: e.target.value.toUpperCase() }))}/>
            </div>
            <div>
              <span style={S.label}>Label</span>
              <input style={S.input} placeholder="PD8" value={newProj.label}
                onChange={e => setNewProj(f => ({ ...f, label: e.target.value }))}/>
            </div>
            <div>
              <span style={S.label}>Panels per tray</span>
              <input type="number" min={1} style={S.input} value={newProj.panels}
                onChange={e => setNewProj(f => ({ ...f, panels: Number(e.target.value) }))}/>
            </div>
            <div>
              <span style={S.label}>Units per panel</span>
              <input type="number" min={1} style={S.input} value={newProj.unitsPerPanel}
                onChange={e => setNewProj(f => ({ ...f, unitsPerPanel: Number(e.target.value) }))}/>
            </div>
          </div>
          <div style={{ fontSize:13, color:"#5DCAA5", marginBottom:14 }}>
            Units per tray: <strong>{newProj.panels * newProj.unitsPerPanel}</strong>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={S.btnPrimary} onClick={addProject}>Add project</button>
            <button style={S.btn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectEditor({ project, onSave, onCancel }) {
  const [form, setForm] = useState({ ...project });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ background:"#0A0F1A", border:"1px solid #7F77DD44", borderRadius:10, padding:16, margin:"4px 0" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
        <div>
          <span style={S.label}>Label</span>
          <input style={S.input} value={form.label} onChange={e => set("label", e.target.value)}/>
        </div>
        <div>
          <span style={S.label}>Panels</span>
          <input type="number" min={1} style={S.input} value={form.panels}
            onChange={e => set("panels", Number(e.target.value))}/>
        </div>
        <div>
          <span style={S.label}>Units per panel</span>
          <input type="number" min={1} style={S.input} value={form.unitsPerPanel}
            onChange={e => set("unitsPerPanel", Number(e.target.value))}/>
        </div>
        <div>
          <span style={S.label}>Units per tray (auto)</span>
          <input style={{ ...S.input, opacity:.5 }} readOnly value={form.panels * form.unitsPerPanel}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        <div>
          <span style={S.label}>Split override</span>
          <select style={S.select} value={form.splitOverride||"inherit"} onChange={e => set("splitOverride", e.target.value)}>
            <option value="inherit">Inherit global setting</option>
            <option value="enabled">Always enabled</option>
            <option value="disabled">Disabled for this project</option>
          </select>
        </div>
        <div>
          <span style={S.label}>Branch override</span>
          <select style={S.select} value={form.branchOverride||"inherit"} onChange={e => set("branchOverride", e.target.value)}>
            <option value="inherit">Inherit global setting</option>
            <option value="enabled">Always enabled</option>
            <option value="disabled">Disabled for this project</option>
          </select>
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={S.btnPrimary} onClick={() => onSave({ ...form, unitsPerTray: form.panels * form.unitsPerPanel })}>Save project</button>
        <button style={S.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── split & branch tab ────────────────────────────────────────────────────────
function SplitBranchTab({ config, setConfig }) {
  const stages       = config.stages || [];
  const split        = config.split  || {};
  const branch       = config.branch || {};
  const branchOpts   = branch.options || [];

  const [editingBranch, setEditingBranch] = useState(null);
  const [newBranch, setNewBranch] = useState({ id:"", label:"", icon:"⚡", color:"#378ADD", next:"" });
  const [addingBranch, setAddingBranch]   = useState(false);

  const setSplit  = (k, v) => setConfig(c => ({ ...c, split:  { ...c.split,  [k]: v } }));
  const setBranch = (k, v) => setConfig(c => ({ ...c, branch: { ...c.branch, [k]: v } }));

  function saveBranchOpt(opt) {
    setBranch("options", branchOpts.map(b => b.id === opt.id ? opt : b));
    setEditingBranch(null);
  }
  function deleteBranchOpt(id) {
    setBranch("options", branchOpts.filter(b => b.id !== id));
  }
  function addBranchOpt() {
    if (!newBranch.id.trim() || !newBranch.label.trim()) return alert("ID and Label required.");
    setBranch("options", [...branchOpts, { ...newBranch, id: newBranch.id.trim().toUpperCase() }]);
    setNewBranch({ id:"", label:"", icon:"⚡", color:"#378ADD", next:"" });
    setAddingBranch(false);
  }

  return (
    <div>
      {/* Split */}
      <div style={S.card}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={S.sectionTitle}>Tray split</div>
          <Toggle value={split.enabled} onChange={v => setSplit("enabled", v)}/>
          <span style={{ fontSize:12, color: split.enabled ? "#5DCAA5" : "#6B7E95" }}>
            {split.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        {split.enabled && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div>
              <span style={S.label}>Split triggers at stage</span>
              <select style={S.select} value={split.atStage||""} onChange={e => setSplit("atStage", e.target.value)}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
              </select>
              <div style={{ fontSize:11, color:"#6B7E95", marginTop:5 }}>
                When a tray is scanned at this stage it splits into Part A and Part B.
              </div>
            </div>
            <div>
              <span style={S.label}>Child trays start at</span>
              <select style={S.select} value={split.resumeAtStage||""} onChange={e => setSplit("resumeAtStage", e.target.value)}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
              </select>
              <div style={{ fontSize:11, color:"#6B7E95", marginTop:5 }}>
                Both Part A and Part B begin here after splitting.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Branch */}
      <div style={S.card}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={S.sectionTitle}>Branch (soldering method choice)</div>
          <Toggle value={branch.enabled} onChange={v => setBranch("enabled", v)}/>
          <span style={{ fontSize:12, color: branch.enabled ? "#5DCAA5" : "#6B7E95" }}>
            {branch.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        {branch.enabled && (
          <>
            <div style={{ marginBottom:16 }}>
              <span style={S.label}>Operator chooses branch at stage</span>
              <select style={{ ...S.select, maxWidth:320 }} value={branch.atStage||""} onChange={e => setBranch("atStage", e.target.value)}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
              </select>
            </div>

            <div style={S.sectionTitle}>Branch options</div>
            {branchOpts.map(b => (
              <div key={b.id}>
                <div style={{ ...S.card, marginBottom:8, padding:"10px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:20 }}>{b.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#E8EFF8" }}>{b.label}</div>
                      <div style={{ fontSize:11, color:"#6B7E95" }}>
                        {b.id} → {b.next || "—"} · {b.scanNote||"no scan note"}
                      </div>
                    </div>
                    <div style={{ width:14, height:14, borderRadius:3, background:b.color||"#888780" }}/>
                    <button style={{ ...S.btn, padding:"4px 10px" }} onClick={() => setEditingBranch(editingBranch===b.id ? null : b.id)}>Edit</button>
                    <button style={{ ...S.btnRed, padding:"4px 10px" }} onClick={() => deleteBranchOpt(b.id)}>✕</button>
                  </div>
                </div>
                {editingBranch === b.id && (
                  <BranchOptEditor stages={stages} opt={b} onSave={saveBranchOpt} onCancel={() => setEditingBranch(null)}/>
                )}
              </div>
            ))}

            {!addingBranch ? (
              <button style={{ ...S.btnGreen, marginTop:4 }} onClick={() => setAddingBranch(true)}>+ Add branch option</button>
            ) : (
              <BranchOptEditor stages={stages} opt={newBranch} isNew
                onSave={opt => { addBranchOpt(); }}
                onSaveNew={opt => {
                  if (!opt.id.trim() || !opt.label.trim()) return alert("ID and Label required.");
                  setBranch("options", [...branchOpts, { ...opt, id: opt.id.trim().toUpperCase() }]);
                  setNewBranch({ id:"", label:"", icon:"⚡", color:"#378ADD", next:"" });
                  setAddingBranch(false);
                }}
                onCancel={() => setAddingBranch(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BranchOptEditor({ stages, opt, onSave, onSaveNew, onCancel, isNew }) {
  const [form, setForm] = useState({ ...opt });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => isNew ? onSaveNew(form) : onSave(form);
  return (
    <div style={{ background:"#0A0F1A", border:"1px solid #7F77DD44", borderRadius:10, padding:16, marginBottom:8 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>
        <div>
          <span style={S.label}>Branch ID</span>
          <input style={{ ...S.input, ...(isNew ? {} : { opacity:.5 }) }} readOnly={!isNew}
            value={form.id} onChange={e => set("id", e.target.value.toUpperCase())} placeholder="BAT_SOL_LASER"/>
        </div>
        <div>
          <span style={S.label}>Label shown to operator</span>
          <input style={S.input} value={form.label} onChange={e => set("label", e.target.value)} placeholder="Laser Solder"/>
        </div>
        <div>
          <span style={S.label}>Icon (emoji)</span>
          <input style={S.input} value={form.icon} onChange={e => set("icon", e.target.value)} placeholder="⚡"/>
        </div>
        <div>
          <span style={S.label}>Goes to stage after branch</span>
          <select style={S.select} value={form.next||""} onChange={e => set("next", e.target.value)}>
            <option value="">— select —</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
          </select>
        </div>
        <div>
          <span style={S.label}>Scan note</span>
          <input style={S.input} value={form.scanNote||""} onChange={e => set("scanNote", e.target.value)}/>
        </div>
      </div>
      <span style={S.label}>Colour</span>
      <ColorPicker value={form.color||"#378ADD"} onChange={v => set("color", v)}/>
      <div style={{ display:"flex", gap:8, marginTop:14 }}>
        <button style={S.btnPrimary} onClick={handleSave}>Save</button>
        <button style={S.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── settings tab ──────────────────────────────────────────────────────────────
function SettingsTab({ config, setConfig }) {
  const tray = config.tray || {};
  const set  = (k, v) => setConfig(c => ({ ...c, tray: { ...c.tray, [k]: v } }));
  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>Global tray defaults</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <div>
          <span style={S.label}>Tray ID prefix</span>
          <input style={S.input} value={tray.idPrefix||"TRY"} onChange={e => set("idPrefix", e.target.value.toUpperCase())}/>
          <div style={{ fontSize:11, color:"#6B7E95", marginTop:5 }}>IDs will look like TRY-001, TRY-002…</div>
        </div>
        <div>
          <span style={S.label}>Default units per tray (fallback)</span>
          <input type="number" min={1} style={S.input} value={tray.unitsPerTray||450}
            onChange={e => set("unitsPerTray", Number(e.target.value))}/>
          <div style={{ fontSize:11, color:"#6B7E95", marginTop:5 }}>Used when a project has no specific unit count.</div>
        </div>
      </div>
    </div>
  );
}

// ── toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width:40, height:22, borderRadius:11, cursor:"pointer",
      background: value ? "#185FA5" : "#1E2D42",
      position:"relative", transition:"background .2s", flexShrink:0,
    }}>
      <div style={{
        position:"absolute", top:3, left: value ? 21 : 3,
        width:16, height:16, borderRadius:8, background:"#E8EFF8",
        transition:"left .2s",
      }}/>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
const TABS = [
  { id:"stages",   label:"Pipeline stages" },
  { id:"projects", label:"Projects" },
  { id:"split",    label:"Split & branch" },
  { id:"settings", label:"Global settings" },
];

export default function PipelineConfigEditor() {
  const [config,  setConfig]  = useState(null);
  const [tab,     setTab]     = useState("stages");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);   // {type:"ok"|"err", text}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminPipelineConfig()
      .then(d => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await saveAdminPipelineConfig(config);
      setMsg({ type:"ok", text:"Pipeline saved — changes are live immediately." });
    } catch {
      setMsg({ type:"err", text:"Save failed. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding:40, color:"#6B7E95" }}>Loading pipeline config…</div>;
  if (!config)  return <div style={{ padding:40, color:"#F09595" }}>Could not load config.</div>;

  return (
    <div style={{ maxWidth:900 }}>
      {/* Header + save */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#E8EFF8" }}>Pipeline configurator</div>
          <div style={{ fontSize:12, color:"#6B7E95", marginTop:3 }}>
            Changes apply immediately after saving — no redeploy needed.
          </div>
        </div>
        <button style={{ ...S.btnPrimary, padding:"10px 24px", fontSize:13 }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "💾 Save pipeline"}
        </button>
      </div>

      {msg && (
        <div style={{
          padding:"12px 16px", borderRadius:8, marginBottom:16, fontSize:13,
          background: msg.type==="ok" ? "rgba(59,109,17,.2)" : "rgba(163,45,45,.2)",
          border: `1px solid ${msg.type==="ok" ? "rgba(59,109,17,.4)" : "rgba(163,45,45,.4)"}`,
          color: msg.type==="ok" ? "#97C459" : "#F09595",
        }}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid #1E2D42", paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:"9px 18px", fontSize:12, fontWeight:600, cursor:"pointer",
            fontFamily:"inherit", border:"none", background:"none",
            color: tab===t.id ? "#378ADD" : "#6B7E95",
            borderBottom: tab===t.id ? "2px solid #378ADD" : "2px solid transparent",
            marginBottom:-1, transition:"color .15s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "stages"   && <StagesTab   config={config} setConfig={setConfig}/>}
      {tab === "projects" && <ProjectsTab config={config} setConfig={setConfig}/>}
      {tab === "split"    && <SplitBranchTab config={config} setConfig={setConfig}/>}
      {tab === "settings" && <SettingsTab config={config} setConfig={setConfig}/>}
    </div>
  );
}