import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Product release identity, kept in sync with the CI image tag (e.g. ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight)
const APP_BUILD = "v6.4-stable-Whitenight"
// Netlify exposes COMMIT_REF during builds; falls back to "dev" locally
const commitRef = (process.env.COMMIT_REF || "").slice(0, 7)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${APP_BUILD}-${commitRef || "dev"}`),
  },
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
