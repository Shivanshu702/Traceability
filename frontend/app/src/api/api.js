const BASE = "http://127.0.0.1:8001";

export async function getTray(id) {
  const res = await fetch(`${BASE}/tray/${id}`);
  return res.json();
}

export async function scanTray(id, operator) {
  const res = await fetch(`${BASE}/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, operator }),
  });

  return res.json();
}

export async function getHistory(id) {
  const res = await fetch(`${BASE}/history/${id}`);
  return res.json();
}