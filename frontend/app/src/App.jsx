import { useState, useEffect } from "react";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("scan");

  // 🔐 Auto login if token exists
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setUser("User");
    }
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

      <button onClick={() => setPage("scan")}>Scan</button>
      <button onClick={() => setPage("history")}>History</button>
      <button onClick={() => setPage("dashboard")}>Dashboard</button>
      <button onClick={logout}>Logout</button>

      {page === "scan" && <ScanPage />}
      {page === "history" && <HistoryPage />}
      {page === "dashboard" && <Dashboard />}
    </div>
  );
}