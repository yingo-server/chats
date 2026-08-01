import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": import.meta.dirname + "/src",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:9000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/user/, "/api"),
      },
      "/chat-api": {
        target: "http://localhost:9001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/chat-api/, "/api"),
      },
    },
  },
})
