import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import "./foundation.css";
import "./theme.css";
import App from "./App";
import { ToastProvider } from "./toasts";

// LazyMotion loads only the DOM animation features; reducedMotion="user" drops transform and layout
// animation (keeping opacity) when the OS asks for reduced motion.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <App />
        </ToastProvider>
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
