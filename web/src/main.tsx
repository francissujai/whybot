import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./foundation.css";
import "./ui/controls.css";
import "./theme.css";
import App from "./App";
import { MotionRoot } from "./motion";
import { ToastProvider } from "./toasts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionRoot>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MotionRoot>
  </StrictMode>,
);
