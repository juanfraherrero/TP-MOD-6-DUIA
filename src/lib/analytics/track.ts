// Cliente-side tracking. Se ejecuta solo en el browser.
// La sesión se persiste en localStorage con una UUID anónima para conectar
// eventos del mismo visitante sin tocar auth.

const SESSION_KEY = "duia_session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// Emite un evento al endpoint. Nunca debe bloquear la UX — cualquier error
// se traga silenciosamente. `keepalive: true` permite que el fetch sobreviva
// incluso si la página se está descargando (útil para page_view al salir).
export async function track(
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getSessionId(),
        eventType,
        path: window.location.pathname,
        payload,
      }),
      keepalive: true,
    });
  } catch {
    // no-op: analytics no puede romper UX
  }
}
