import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// O AuthGate valida a sessão antes de montar a interface e carregar dados.
createRoot(document.getElementById("root")!).render(<App />);

// ── Service Worker — detecta nova versão e recarrega automaticamente ──
// Desabilitado em desenvolvimento para evitar cache de versões quebradas.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").then((registration) => {

    // Verifica updates a cada 60s enquanto o app está aberto
    setInterval(() => registration.update(), 60_000);

    const awaitingWorker = registration.waiting;
    if (awaitingWorker) {
      awaitingWorker.postMessage("SKIP_WAITING");
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage("SKIP_WAITING");
        }
      });
    });

  }).catch(console.error);

  // Recarrega quando o SW novo assumir controle
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
