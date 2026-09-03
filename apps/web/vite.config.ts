import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // 로컬 개발: /api 는 wrangler dev(8787) 로 넘긴다
    proxy: {
      "/api": {
        target: process.env["VITE_API_TARGET"] ?? "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
