import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envDir: '..',
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/analyze": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/chat": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/deep-analyze": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/history": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/upload": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
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
