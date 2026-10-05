export const THEME_STORAGE_KEY = "mascop-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Runs before first paint so a saved dark choice never flashes light. */
export const THEME_BOOT_SCRIPT = `try{var m=localStorage.getItem("${THEME_STORAGE_KEY}");var d=m?m==="dark":matchMedia("${DARK_QUERY}").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}`;
