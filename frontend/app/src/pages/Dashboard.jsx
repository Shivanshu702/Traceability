import { useEffect, useState } from "react";

export default function Dashboard() {
  const [trays, setTrays] = useState([]);

  async function load() {
    const res = await fetch("http://127.0.0.1:8001/tray/TRAY1");
    const data = await res.json();
    setTrays([data]); // basic for now
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Live Dashboard</h2>

      {trays.map((t) => (
        <div key={t.id}>
          {t.id} — {t.stage}
        </div>
      ))}
    </div>
  );
}