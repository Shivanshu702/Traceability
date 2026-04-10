import { useState } from "react";
import { loginUser, registerUser } from "../api/api";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  async function handleSubmit() {
    let data;

    if (isRegister) {
      data = await registerUser(username, password);
      if (data.error) {
        alert(data.error);
        return;
      }
      alert("User created. Now login.");
      setIsRegister(false);
      return;
    }

    data = await loginUser(username, password);

    if (data.error) {
      alert("Invalid credentials");
      return;
    }

    // 🔥 STORE TOKEN
    localStorage.setItem("token", data.access_token);

    onLogin(username);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>{isRegister ? "Register" : "Login"}</h2>

      <input
        placeholder="Username"
        onChange={(e) => setUsername(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={handleSubmit}>
        {isRegister ? "Register" : "Login"}
      </button>

      <p
        style={{ cursor: "pointer", color: "blue" }}
        onClick={() => setIsRegister(!isRegister)}
      >
        {isRegister
          ? "Already have account? Login"
          : "Create account"}
      </p>
    </div>
  );
}