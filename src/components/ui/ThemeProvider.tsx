"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "duia-theme";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

// Lee el tema actual del DOM (lo setea el inline script en RootLayout antes
// del paint para evitar flash). Default a "light" — la app es light-only;
// los tokens dark siguen definidos por si en el futuro se reactiva el toggle.
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const fromAttr = document.documentElement.getAttribute("data-theme");
  return fromAttr === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // Sincroniza atributo + storage cuando cambia.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage puede fallar en modo incógnito o storage lleno — no es
      // crítico, perdemos persistencia entre sesiones nada más.
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider />");
  }
  return ctx;
}

// Script inline para inyectar en <head> antes del paint. La app es light-only
// (el toggle está deshabilitado) — siempre setea "light", ignorando el
// prefers-color-scheme del sistema operativo del usuario.
export const NO_FLASH_SCRIPT = `
(function() {
  try {
    document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;
