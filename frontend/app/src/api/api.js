const BASE = "https://traceability-backend-4zpe.onrender.com";

// 🔐 Get token
function getToken() {
  return localStorage.getItem("token");
}

// 🔐 Headers with auth
function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + getToken(),
  };
}

// 🔐 LOGIN
export async function loginUser(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  return res.json();
}

// 🔐 REGISTER
export async function registerUser(username, password) {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  return res.json();
}

// 📦 GET TRAY
export async function getTray(id) {
  const res = await fetch(`${BASE}/tray/${id}`, {
    headers: authHeaders(),
  });

  return res.json();
}

// 📦 SCAN
export async function scanTray(id, operator) {
  const res = await fetch(`${BASE}/scan`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ id, operator }),
  });

  return res.json();
}

// 📊 DASHBOARD
export async function getAllTrays() {
  const res = await fetch(`${BASE}/trays`, {
    headers: authHeaders(),
  });

  return res.json();
}

// 🆕 🚨 ALERTS
export async function getAlerts() {
  const res = await fetch(`${BASE}/alerts`, {
    headers: authHeaders(),
  });

  return res.json();
}

// 🆕 📊 STAGE LOAD
export async function getStageLoad() {
  const res = await fetch(`${BASE}/stage-load`, {
    headers: authHeaders(),
  });

  return res.json();
}