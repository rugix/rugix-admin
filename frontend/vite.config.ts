import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const adminApiTarget = process.env.RUGIX_ADMIN_API_TARGET ?? "http://127.0.0.1:7492";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": adminApiTarget,
    },
  },
});
