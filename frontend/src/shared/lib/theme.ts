import type { Theme } from "../../types";

export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem("rugix-admin-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch (error) {
    console.warn("Failed to read the stored Rugix Admin theme.", error);
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem("rugix-admin-theme", theme);
  } catch (error) {
    console.warn("Failed to store the Rugix Admin theme.", error);
  }
}
