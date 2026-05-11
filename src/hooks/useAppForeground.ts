import { useEffect, useRef } from "react";

/**
 * Hook que detecta quando a aplicação volta do background/segundo plano
 * Suporta:
 * - Navegadores (mudança de aba, foco de janela)
 * - iOS/Android (via Capacitor)
 * - PWA
 *
 * @param callback Função a executar quando o app volta para o foreground
 * @example
 * useAppForeground(async () => {
 *   await fetchAllData();
 * });
 */
export function useAppForeground(callback: () => Promise<void> | void) {
  const isExecuting = useRef(false);
  const lastExecutionTime = useRef(0);

  useEffect(() => {
    // Debounce: evita múltiplas execuções em menos de 1 segundo
    const executeCallback = async () => {
      const now = Date.now();
      const timeSinceLastExecution = now - lastExecutionTime.current;

      // Se executou há menos de 1 segundo, pula
      if (isExecuting.current || timeSinceLastExecution < 1000) {
        return;
      }

      isExecuting.current = true;
      lastExecutionTime.current = now;

      try {
        console.log("[useAppForeground] Executando callback do foreground...");
        await callback();
        console.log("[useAppForeground] Callback executado com sucesso!");
      } catch (error) {
        console.error("[useAppForeground] Erro ao executar callback:", error);
      } finally {
        isExecuting.current = false;
      }
    };

    // 1. Detectar mudança de visibilidade (aba minimizada/visível)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[useAppForeground] App voltou para primeiro plano (visibilitychange)");
        executeCallback();
      }
    };

    // 2. Detectar foco da janela
    const handleWindowFocus = () => {
      console.log("[useAppForeground] App voltou para primeiro plano (focus)");
      executeCallback();
    };

    // 3. Detectar resume do Capacitor (iOS/Android)
    const handleCapacitorResume = () => {
      console.log("[useAppForeground] App voltou para primeiro plano (Capacitor resume)");
      executeCallback();
    };

    // Event Listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    // Capacitor (se disponível)
    const setupCapacitor = async () => {
      try {
        const { App } = await import("@capacitor/app");
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            console.log("[useAppForeground] App voltou para primeiro plano (Capacitor state)");
            executeCallback();
          }
        });
      } catch (error) {
        // Capacitor não disponível (rodando no navegador)
      }
    };

    setupCapacitor();

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [callback]);
}
