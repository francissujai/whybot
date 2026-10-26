// Theme choice: Auto follows the OS; Light and Dark override it. Kept in this browser only.

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "theme";
export const LABEL: Record<ThemeChoice, string> = { system: "Auto", light: "Light", dark: "Dark" };
export const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: ThemeChoice) {
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* private mode: the choice lasts until reload */ }
  window.dispatchEvent(new Event("themechange"));
}
