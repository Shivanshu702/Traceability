import { useState, useEffect } from "react";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import AlertDashboard from "./pages/AlertDashboard";

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("scan");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) setUser("User");
  }, []);

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Traceability System</h1>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setPage("scan")}>Scan</button>
        <button onClick={() => setPage("history")}>History</button>
        <button onClick={() => setPage("dashboard")}>Dashboard</button>
        <button onClick={() => setPage("alerts")}>🚨 Alerts</button>
        <button onClick={logout}>Logout</button>
      </div>

      {page === "scan" && <ScanPage />}
      {page === "history" && <HistoryPage />}
      {page === "dashboard" && <Dashboard />}
      {page === "alerts" && <AlertDashboard />}
    </div>
  );
}