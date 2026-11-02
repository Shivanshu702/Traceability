// Everything the UI needs to know about stages comes from the tenant's pipeline
// config (GET /pipeline) — never from hardcoded stage IDs.

export const FALLBACK_COLOR = "#6B7E95";

const SYSTEM = {
  CREATED:  { label: "Created",  color: "#888780" },
  COMPLETE: { label: "Complete", color: "#3B6D11" },
  SPLIT:    { label: "Split",    color: "#FAC775" },
};

/** id -> { label, color, icon?, isBranchOption? }  for stages, branch options and system stages. */
export function buildStageMeta(pipeline) {
  const meta = { ...SYSTEM };
  (pipeline?.stages || []).forEach(s => {
    meta[s.id] = { ...(meta[s.id] || {}), label: s.label || s.id, color: s.color || meta[s.id]?.color || FALLBACK_COLOR };
  });
  (pipeline?.branch?.options || []).forEach(o => {
    meta[o.id] = { label: o.label || o.id, color: o.color || FALLBACK_COLOR, icon: o.icon, isBranchOption: true };
  });
  return meta;
}

export const stageColor = (meta, id) => meta?.[id]?.color || FALLBACK_COLOR;
export const stageLabel = (meta, id) => meta?.[id]?.label || id;

/** Card theme derived from one colour (works in light and dark mode: translucent tints). */
export function themeOf(color) {
  const c = /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : FALLBACK_COLOR;
  return { accent: c, bg: c + "14", border: c + "40" };
}

/** The branch decision point and its option ids, or null when branching is off. */
export function branchInfo(pipeline) {
  const b = pipeline?.branch;
  if (!b?.enabled || !b.atStage || !(b.options || []).length) return null;
  return { atStage: b.atStage, options: b.options, optionIds: b.options.map(o => o.id) };
}

/** True when reaching this stage finishes a tray (mirrors backend is_terminal_stage). */
export function isTerminal(pipeline, id) {
  if (id === "COMPLETE") return true;
  const b = branchInfo(pipeline);
  if (b && b.atStage === id) return false;
  const s = (pipeline?.stages || []).find(x => x.id === id);
  return !!s && !s.next;
}
