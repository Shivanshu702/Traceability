import { useEffect, useState } from "react";
import { getAlerts, getStageLoad } from "../api/api";

export default function AlertDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [load, setLoad] = useState({});

  async function fetchData() {
    const alertData = await getAlerts();
    const loadData = await getStageLoad();

    setAlerts(alertData.alerts || []);
    setLoad(loadData || {});
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // auto refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.container}>
      <h2>🚨 Factory Alerts Dashboard</h2>

      {/* 🔴 ALERT SECTION */}
      <div style={styles.card}>
        <h3>⚠️ Bottleneck Alerts</h3>

        {alerts.length === 0 ? (
          <p style={{ color: "green" }}>✅ No bottlenecks</p>
        ) : (
          alerts.map((a, i) => (
            <div key={i} style={styles.alertBox}>
              <b>{a.tray_id}</b> stuck at <b>{a.stage}</b>
              <br />
              Delay: {a.delay_seconds}s
            </div>
          ))
        )}
      </div>

      {/* 📊 STAGE LOAD */}
      <div style={styles.card}>
        <h3>📊 Stage Load</h3>

        {Object.keys(load).length === 0 && <p>No active trays</p>}

        {Object.entries(load).map(([stage, count]) => (
          <div key={stage} style={styles.loadRow}>
            <span>{stage}</span>

            <div style={styles.barContainer}>
              <div
                style={{
                  ...styles.bar,
                  width: `${count * 40}px`,
                  background:
                    count > 5 ? "red" : count > 3 ? "orange" : "green",
                }}
              />
            </div>

            <span>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 700,
    margin: "auto",
    padding: 20,
  },
  card: {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  },
  alertBox: {
    background: "#ffe5e5",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeft: "5px solid red",
  },
  loadRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  barContainer: {
    flex: 1,
    background: "#eee",
    height: 10,
    borderRadius: 5,
  },
  bar: {
    height: 10,
    borderRadius: 5,
  },
};