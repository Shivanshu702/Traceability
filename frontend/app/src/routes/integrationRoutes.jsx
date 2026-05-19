// C:\SHIVANSH\Traceability\frontend\app\src\routes\integrationRoutes.jsx //

// src/routes/integrationRoutes.jsx
// One import drops the SMT Analytics nav item + route into App.jsx.
//
// ── How to add to App.jsx (minimal, two lines + one JSX block) ───────────────
//
//   import { SMT_NAV, SMT_ROUTE } from "./routes/integrationRoutes";
//
//   Inside the <nav>  block, add:
//     <button className={`nb${page==="smt"?" on":""}`} onClick={()=>setPage("smt")}>
//       {SMT_NAV.label}
//     </button>
//
//   Inside the route switch / conditional render, add:
//     {page === "smt" && <SMT_ROUTE.component />}
//
//   In AdminPage TABS array, add:
//     { key:"integrations", label:`🔌 ${t("integrations")||"Integrations"}` }
//   And render:
//     {tab==="integrations" && <IntegrationsTab />}
//
// ── Exports ──────────────────────────────────────────────────────────────────
import SmtAnalyticsPage  from "../pages/SMTAnalyticsPage";
import IntegrationsTab   from "../pages/IntegrationsTab";

/** Drop this into the nav bar — checks role before rendering */
export const SMT_NAV = {
  key:          "smt",
  label:        "📊 SMT Analytics",
  icon:         "📊",
  allowedRoles: ["admin"],          // extend to ["admin","operator"] if needed
};

/** Drop this into your route switch */
export const SMT_ROUTE = {
  key:          "smt",
  component:    SmtAnalyticsPage,
  allowedRoles: ["admin"],
};

/** The admin tab component — import and add to AdminPage's TABS */
export { IntegrationsTab };

// ── Minimal App.jsx diff ──────────────────────────────────────────────────────
// Add ONE line to the top of App.jsx:
//   import { SMT_NAV, SMT_ROUTE, IntegrationsTab } from "./routes/integrationRoutes";
//
// Add to nav (inside the role-filtered nav buttons):
//   {["admin"].includes(role) && (
//     <button className={`nb${page==="smt"?" on":""}`} onClick={()=>setPage("smt")}>
//       {SMT_NAV.label}
//     </button>
//   )}
//
// Add to page render (alongside the other {page==="x" && <X/>} lines):
//   {page === "smt" && <SMT_ROUTE.component />}