import { useEffect, useMemo, useState } from "react";
import { getPipeline } from "../api/api";
import { buildStageMeta } from "../utils/pipelineUi";

// One shared fetch per session. Call invalidatePipeline() on login/logout and after
// the admin saves the pipeline so every page sees the new configuration.
let cache = null;
let inflight = null;
const listeners = new Set();

export function invalidatePipeline() {
  cache = null;
  inflight = null;
  listeners.forEach(fn => fn(null));
}

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getPipeline()
      .then(p => { cache = p; return p; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function usePipeline() {
  const [pipeline, setPipeline] = useState(cache);

  useEffect(() => {
    let alive = true;
    const onChange = p => { if (alive) { setPipeline(p); if (!p) load().then(x => alive && setPipeline(x)).catch(() => {}); } };
    listeners.add(onChange);
    load().then(p => alive && setPipeline(p)).catch(() => {});
    return () => { alive = false; listeners.delete(onChange); };
  }, []);

  const meta = useMemo(() => buildStageMeta(pipeline), [pipeline]);
  return { pipeline, meta };
}
