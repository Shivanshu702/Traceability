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
    <div style={styles.container}>
      <h2>📦 Scan Tray</h2>

      <div style={styles.card}>
        <input
          style={styles.input}
          placeholder="Tray ID"
          value={trayId}
          onChange={(e) => setTrayId(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Operator"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
        />

        <div style={styles.buttons}>
          <button style={styles.btn} onClick={loadTray}>
            Load
          </button>
          <button style={styles.btnPrimary} onClick={scan}>
            Scan
          </button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {tray && (
        <div style={styles.card}>
          <h3>{tray.id}</h3>

          <p>
            Stage:{" "}
            <span style={getStageStyle(tray.stage)}>
              {tray.stage}
            </span>
          </p>

          {tray.is_split_parent && (
            <p style={styles.warning}>
              ⚠ Parent tray — scan child trays
            </p>
          )}

          {tray.is_done && <p style={styles.success}>✅ Completed</p>}
        </div>
      )}
    </div>
  );
}

/* 🎨 Styles */

const styles = {
  container: {
    maxWidth: 400,
    margin: "auto",
    padding: 20,
    fontFamily: "Arial",
  },
  card: {
    background: "#fff",
    padding: 20,
    borderRadius: 10,
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    border: "1px solid #ccc",
  },
  buttons: {
    display: "flex",
    gap: 10,
  },
  btn: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    border: "none",
    background: "#ddd",
  },
  btnPrimary: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    border: "none",
    background: "#007bff",
    color: "#fff",
  },
  error: {
    color: "red",
  },
  warning: {
    color: "orange",
  },
  success: {
    color: "green",
  },
};

/* 🎯 Stage color */

function getStageStyle(stage) {
  const colors = {
    CREATED: "gray",
    RACK1: "blue",
    RACK2: "purple",
    BAT_MOUNT: "orange",
    COMPLETE: "green",
  };

  return {
    color: colors[stage] || "black",
    fontWeight: "bold",
  };
}