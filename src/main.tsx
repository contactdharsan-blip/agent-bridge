import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CanonicalProvider } from "./state/canonical";
import { ToastProvider } from "./state/toast";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <CanonicalProvider>
        <App />
      </CanonicalProvider>
    </ToastProvider>
  </React.StrictMode>,
);
