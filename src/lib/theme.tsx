import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "solarops:theme";

const Ctx = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>({
  theme: "system", resolved: "dark", setTheme: () => {},
});

function applyTheme(t: Theme): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const resolved = t === "system" ? sys : t;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && (localStorage.getItem(KEY) as Theme)) || "system";
    setThemeState(saved);
    setResolved(applyTheme(saved));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((localStorage.getItem(KEY) || "system") === "system") setResolved(applyTheme("system")); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function setTheme(t: Theme) {
    localStorage.setItem(KEY, t);
    setThemeState(t);
    setResolved(applyTheme(t));
  }

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
