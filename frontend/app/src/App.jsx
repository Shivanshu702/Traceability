import { useState } from "react";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [page, setPage] = useState("scan");

  return (
    <div>
      <h1>Traceability System</h1>

      <button onClick={() => setPage("scan")}>Scan</button>
      <button onClick={() => setPage("history")}>History</button>
      <button onClick={() => setPage("dashboard")}>Dashboard</button>

      {page === "scan" && <ScanPage />}
      {page === "history" && <HistoryPage />}
      {page === "dashboard" && <Dashboard />}
    </div>
  );
}