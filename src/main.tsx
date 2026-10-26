import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app/App";
import { vault } from "./data/vault";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

vault.init().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
