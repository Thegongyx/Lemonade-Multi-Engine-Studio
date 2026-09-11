import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The webui talks to the local service (patched lemonade / lemond) over HTTP.
// Dev server proxies /api -> the service so there are no CORS surprises.
export default defineConfig({
  // Served by lemond at /app, so assets must resolve under that base.
  base: "/app/",
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      "/api": {
        target: process.env.LEMONADE_URL || "http://localhost:13310",
        changeOrigin: true,
      },
    },
  },
});
