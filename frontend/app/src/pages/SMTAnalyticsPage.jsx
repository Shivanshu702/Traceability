// C:\SHIVANSH\Traceability\frontend\app\src\pages\SMTAnalyticsPage.jsx

import { useEffect, useState, useCallback } from "react";
import { useLang } from "../context/LangContext";
import {
  getSmtDashboardSummary,
  getYieldAnalytics,
  getCycleTimeStats,
  getUnitTestResults,
} from "../api/integrations_api";

// ── Shared chart: vertical bar ────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, colors, height = 130 }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, paddingTop: 18 }}>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const pct = (val / max) * 100;
        const col = Array.isArray(colors) ? colors[i % colors.length] : (colors || "#378ADD");
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{ width: "100%", height: pct + "%", minHeight: val > 0 ? 3 : 0, background: col, borderRadius: "3px 3px 0 0", transition: "height .4s", position: "relative" }}>
                {val > 0 && (
                  <div style={{ position: "absolute", top: -15, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 700, color: col, whiteSpace: "nowrap" }}>
                    {typeof val === "number" && val % 1 !== 0 ? val.toFixed(1) + "%" : val.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut chart (fail breakdown) ──────────────────────────────────────────────
function DonutChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 11 }}>No data</div>
  );
  const r = 44, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  const segs = data.reduce((acc, d, i) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cum : 0;
    const pct  = d.value / total;
    acc.push({ ...d, pct, cum: prev + pct, i });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={11} />
      {segs.map(seg => {
        const dash = seg.pct * circ;
        const rot  = (seg.cum - seg.pct) * 360 - 90;
        return (
          <circle key={seg.i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={11}
            strokeDasharray={`${dash} ${circ - dash}`}
            transform={`rotate(${rot} ${cx} ${cy})`}>
            <title>{seg.label}: {seg.value}</title>
          </circle>
        );
      })}
      <text x={cx} y={cy - 5} textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: "var(--text)" }}>{total}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 7, fill: "var(--muted)" }}>FAILED</text>
    </svg>
  );
}

// ── KPI stat card ─────────────────────────────────────────────────────────────
function Kpi({ label, main, sub, color, good }) {
  const accent = good === true ? "#3B6D11" : good === false ? "#E24B4A" : color || "#378ADD";
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${accent}44`, borderTop: `2px solid ${accent}`, borderRadius: 12, padding: "16px 18px", flex: "1 1 160px", minWidth: 0, boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 700, color: accent, lineHeight: 1, marginBottom: 4 }}>{main}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

// ── Status tag ────────────────────────────────────────────────────────────────
function StatusTag({ status }) {
  const pass = status === "PASS" || status === "pass";
  const fail = status === "FAIL" || status === "fail";
  if (pass) return <span className="tag tag-green">✓ PASS</span>;
  if (fail) return <span className="tag tag-red">✕ FAIL</span>;
  return <span className="tag tag-gray">{status || "—"}</span>;
}

function fmtTime(sec) {
  if (!sec || sec === 0) return "—";
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

// ── FAIL_COLORS ───────────────────────────────────────────────────────────────
const FAIL_COLORS = ["#E24B4A","#EF9F27","#7F77DD","#D4537E","#378ADD","#5DCAA5","#888780"];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SmtAnalyticsPage() {
  const { t } = useLang();

  const [summary,   setSummary]   = useState(null);
  const [yield14,   setYield14]   = useState([]);
  const [cycleStat, setCycleStat] = useState(null);
  const [units,     setUnits]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadErr,   setLoadErr]   = useState("");

  // Table filters
  const [search,     setSearch]     = useState("");
  const [statusFilt, setStatusFilt] = useState("ALL");
  const [page,       setPage]       = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true); setLoadErr("");
    try {
      const [sum, y, ct, u] = await Promise.all([
        getSmtDashboardSummary(),
        getYieldAnalytics(14),
        getCycleTimeStats(),
        getUnitTestResults({ limit: 500 }),
      ]);
      setSummary(sum || {});
      setYield14(Array.isArray(y?.daily) ? y.daily : []);
      setCycleStat(ct || null);
      setUnits(Array.isArray(u) ? u : []);
    } catch (e) {
      if (e.message !== "SESSION_EXPIRED")
        setLoadErr("Failed to load SMT analytics. Check that the WATS integration is configured and enabled.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived data
  const failBreakdown = (() => {
    const map = {};
    units.filter(u => u.status === "FAIL" && u.failure_code).forEach(u => {
      map[u.failure_code] = (map[u.failure_code] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([label, value], i) => ({ label, value, color: FAIL_COLORS[i] }));
  })();

  const shiftYield = (() => {
    const shifts = { Morning: { pass: 0, total: 0 }, Afternoon: { pass: 0, total: 0 }, Night: { pass: 0, total: 0 } };
    units.filter(u => u.status).forEach(u => {
      const s = u.shift || "Morning";
      if (shifts[s]) {
        shifts[s].total++;
        if (u.status === "PASS") shifts[s].pass++;
      }
    });
    return Object.entries(shifts).map(([shift, { pass, total }]) => ({
      shift,
      yield: total > 0 ? Math.round((pass / total) * 100) : 0,
    }));
  })();

  const filteredUnits = units.filter(u => {
    if (statusFilt !== "ALL" && u.status !== statusFilt) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.unit_serial || "").toLowerCase().includes(q)
          || (u.tray_id    || "").toLowerCase().includes(q)
          || (u.failure_code || "").toLowerCase().includes(q);
    }
    return true;
  });

  const pageUnits  = filteredUnits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredUnits.length / PAGE_SIZE);

  if (loading && !summary) return (
    <div style={{ padding: 40, color: "var(--muted)" }}><span className="spin" /> Loading SMT analytics…</div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h2 style={{ color: "var(--text)", margin: 0 }}>📊 SMT & Test Analytics</h2>
        <button className="btn" style={{ marginLeft: "auto", fontSize: 12 }} onClick={load} disabled={loading}>
          {loading ? <span className="spin" /> : "↻"} {t("refresh")}
        </button>
      </div>

      {loadErr && <div className="err-box" style={{ marginBottom: 16 }}>{loadErr}</div>}

      {/* KPI row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi
          label="Units tested today"
          main={summary?.units_tested_today ?? "—"}
          sub={`${summary?.panels_today ?? 0} panels`}
          color="#378ADD"
        />
        <Kpi
          label="First pass yield"
          main={summary?.fpy_pct != null ? `${summary.fpy_pct}%` : "—"}
          sub={`${summary?.fpy_pass ?? 0} / ${summary?.fpy_total ?? 0} units`}
          good={summary?.fpy_pct >= 95 ? true : summary?.fpy_pct < 90 ? false : undefined}
        />
        <Kpi
          label="Overall yield"
          main={summary?.overall_yield_pct != null ? `${summary.overall_yield_pct}%` : "—"}
          sub="including retests"
          good={summary?.overall_yield_pct >= 97 ? true : summary?.overall_yield_pct < 93 ? false : undefined}
        />
        <Kpi
          label="Avg SMT → Test"
          main={fmtTime(cycleStat?.avg_smt_to_test_sec)}
          sub={cycleStat?.sample_size ? `from ${cycleStat.sample_size} units` : "no data yet"}
          color="#7F77DD"
        />
        <Kpi
          label="Avg test duration"
          main={fmtTime(cycleStat?.avg_test_duration_sec)}
          sub="per unit on tester"
          color="#EF9F27"
        />
        <Kpi
          label="Failures today"
          main={summary?.failures_today ?? "—"}
          sub={`${summary?.failure_codes_today ?? 0} distinct codes`}
          color="#E24B4A"
        />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>

        {/* 14-day FPY trend */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">First pass yield — 14 days</div>
          {yield14.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No data yet</div>
          ) : (
            <BarChart
              data={yield14}
              valueKey="fpy"
              labelKey="date"
              colors={yield14.map(d => d.fpy >= 95 ? "#3B6D11" : d.fpy >= 90 ? "#EF9F27" : "#E24B4A")}
              height={130}
            />
          )}
        </div>

        {/* Fail breakdown donut */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Top failure codes</div>
          {failBreakdown.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No failures yet</div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <DonutChart data={failBreakdown} size={110} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {failBreakdown.slice(0, 5).map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text)" }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Shift yield comparison */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Yield by shift</div>
          {shiftYield.every(d => d.yield === 0) ? (
            <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No data yet</div>
          ) : (
            <BarChart
              data={shiftYield}
              valueKey="yield"
              labelKey="shift"
              colors={["#378ADD", "#EF9F27", "#7F77DD"]}
              height={130}
            />
          )}
        </div>
      </div>

      {/* Unit results table */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-title">Unit test results</div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input className="inp" style={{ flex: 2, minWidth: 180 }}
            placeholder="Search serial, tray, fail code…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          <select className="inp" style={{ width: "auto", flex: "none" }} value={statusFilt}
            onChange={e => { setStatusFilt(e.target.value); setPage(0); }}>
            <option value="ALL">All statuses</option>
            <option value="PASS">PASS only</option>
            <option value="FAIL">FAIL only</option>
          </select>
          <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center" }}>
            {filteredUnits.length} unit{filteredUnits.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}><span className="spin" /></div>
        ) : filteredUnits.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
            {units.length === 0
              ? "No test results yet. Enable the WATS integration and sync to see data here."
              : "No units match the current filter."}
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Unit serial</th>
                    <th>Tray ID</th>
                    <th>SMT exit</th>
                    <th>Test start</th>
                    <th>Test dur.</th>
                    <th>SMT→Test</th>
                    <th>Status</th>
                    <th>Fail code</th>
                    <th>Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {pageUnits.map((u, i) => (
                    <tr key={u.unit_serial || i}>
                      <td><span className="mono" style={{ fontSize: 12 }}>{u.unit_serial || "—"}</span></td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{u.tray_id || "—"}</span></td>
                      <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDate(u.smt_exit_at)}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDate(u.test_started_at)}</td>
                      <td><span className="tag tag-gray">{fmtTime(u.test_duration_sec)}</span></td>
                      <td>
                        <span className={`tag ${u.smt_to_test_sec > 86400 ? "tag-red" : u.smt_to_test_sec > 43200 ? "tag-amber" : "tag-green"}`}>
                          {fmtTime(u.smt_to_test_sec)}
                        </span>
                      </td>
                      <td><StatusTag status={u.status} /></td>
                      <td>
                        {u.failure_code
                          ? <span className="tag tag-red" style={{ fontSize: 10 }}>{u.failure_code}</span>
                          : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>{u.shift || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, justifyContent: "flex-end" }}>
                <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Page {page + 1} of {totalPages}</span>
                <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}