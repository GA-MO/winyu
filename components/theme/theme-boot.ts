export const THEME_STORAGE_KEY = "winyu-theme";

/** Runs before first paint so a saved dark choice never flashes light; without a saved choice Winyu is light. */
export const THEME_BOOT_SCRIPT = `try{document.documentElement.classList.toggle("dark",localStorage.getItem("${THEME_STORAGE_KEY}")==="dark");}catch(e){}`;
