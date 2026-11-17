import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { Toaster } from "./components/ui/sonner";
import { reportAppUrlOnce } from "./lib/app-link";
import "./index.css";

// Remember the Tailscale URL so the desktop's localhost session can reopen it.
reportAppUrlOnce();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster />
    </BrowserRouter>
  </StrictMode>,
);
