// Servidor local (Bun): API + front compilado en web/dist. En Vercel se usa api/index.ts.
import { existsSync } from "node:fs"
import path from "node:path"
import { crearAppDesdeEnv } from "./bootstrap"

const app = crearAppDesdeEnv()
const puerto = Number(process.env.PORT ?? 3000)
const dist = path.join(process.cwd(), "web", "dist")

function archivoEstatico(pathname: string): string | null {
  if (!existsSync(dist)) return null
  const ruta = path.join(dist, path.normalize(pathname).replace(/^([/\\])+/, ""))
  if (!ruta.startsWith(dist)) return null
  return existsSync(ruta) && !ruta.endsWith(path.sep) && path.extname(ruta) ? ruta : path.join(dist, "index.html")
}

Bun.serve({
  port: puerto,
  idleTimeout: 120,
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith("/api")) return app.fetch(req)
    const archivo = archivoEstatico(pathname)
    return archivo ? new Response(Bun.file(archivo)) : new Response("Front no compilado: usa `bun run dev` o `bun run build`.", { status: 404 })
  },
})

console.log(`API lista en http://localhost:${puerto}/api/health`)
