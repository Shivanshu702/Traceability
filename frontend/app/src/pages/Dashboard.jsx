import { useEffect, useState } from "react";
import { getAllTrays } from "../api/api";

export default function Dashboard() {
  const [trays, setTrays] = useState([]);

  async function load() {
    const data = await getAllTrays();
    setTrays(data);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>📊 Live Dashboard</h2>

      {trays.map((t) => (
        <div
          key={t.id}
          style={{
            padding: 10,
            marginBottom: 10,
            background: "#f5f5f5",
            borderRadius: 8,
          }}
        >
          <b>{t.id}</b> — {t.stage}
        </div>
      ))}
    </div>
  );
}