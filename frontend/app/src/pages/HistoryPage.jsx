import { useState } from "react";
import { getHistory } from "../api/api";

export default function HistoryPage() {
  const [trayId, setTrayId] = useState("");
  const [history, setHistory] = useState([]);

  async function loadHistory() {
    const data = await getHistory(trayId);
    setHistory(data);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Tray History</h2>

      <input
        placeholder="Tray ID"
        value={trayId}
        onChange={(e) => setTrayId(e.target.value)}
      />

      <button onClick={loadHistory}>Load</button>

      <ul>
        {history.map((h, i) => (
          <li key={i}>
            {h.stage} — {h.operator} — {new Date(h.timestamp).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}