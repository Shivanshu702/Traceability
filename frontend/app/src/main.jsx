// C:\SHIVANSH\Traceability\frontend\app\src\main.jsx //

import { IntegrationProvider } from "./context/IntegrationContext";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { LangProvider } from "./context/LangContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <IntegrationProvider>
          <App />
        </IntegrationProvider>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>
);