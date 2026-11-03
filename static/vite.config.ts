import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const API_TARGET = process.env.DT_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => ({
  envDir: '..',
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // the only backend surface: canonical audit API + health
      "/api": { target: API_TARGET, changeOrigin: true, timeout: 600000, proxyTimeout: 600000 },
      "/health": { target: API_TARGET, changeOrigin: true },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
