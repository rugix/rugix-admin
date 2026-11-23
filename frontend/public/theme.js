(() => {
  try {
    const theme = localStorage.getItem("rugix-admin-theme");
    if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  } catch (error) {
    console.warn("Failed to read the stored Rugix Admin theme.", error);
  }
})();
