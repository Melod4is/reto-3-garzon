import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const raiz = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: raiz,
  plugins: [react()],
  build: { outDir: path.join(raiz, "dist"), emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
})
