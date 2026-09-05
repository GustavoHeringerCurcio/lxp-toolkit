import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // API + docs are served by the assistant backend (npm run web)
      "/api": "http://127.0.0.1:4174",
      "/docs": "http://127.0.0.1:4174",
    },
  },
});
