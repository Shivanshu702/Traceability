import { useState } from "react";
import { scanTray, getTray } from "../api/api";

export default function ScanPage() {
  const [trayId, setTrayId] = useState("");
  const [operator, setOperator] = useState("");
  const [tray, setTray] = useState(null);
  const [error, setError] = useState("");

  async function loadTray() {
    const data = await getTray(trayId);
    setTray(data);
    setError("");
  }

  async function scan() {
    const data = await scanTray(trayId, operator);

    if (data.error) {
      setError(
        data.error +
          (data.older_trays
            ? " → Pending: " + data.older_trays.join(", ")
            : "")
      );
      return;
    }

    setTray(data);
    setError("");
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Scan Tray</h2>

      <input
        placeholder="Tray ID"
        value={trayId}
        onChange={(e) => setTrayId(e.target.value)}
      />

      <input
        placeholder="Operator"
        value={operator}
        onChange={(e) => setOperator(e.target.value)}
      />

      <br /><br />

      <button onClick={loadTray}>Load</button>
      <button onClick={scan}>Scan</button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {tray && (
        <div>
          <h3>{tray.id}</h3>
          <p>Stage: {tray.stage}</p>

          {tray.is_split_parent && (
            <p style={{ color: "orange" }}>
              Parent tray — scan child trays
            </p>
          )}

          {tray.is_done && <p>✅ Completed</p>}
        </div>
      )}
    </div>
  );
}