import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { ID_SESION, type Sesion, SesionSchema } from "./sesion"

export interface SesionStore {
  obtener(id: string): Promise<Sesion | null>
  guardar(sesion: Sesion): Promise<void>
}

/** Una sesión por archivo en `<dirOut>/sessions/`. En serverless puede perderse: ver estado firmado. */
export class ArchivoSesionStore implements SesionStore {
  private readonly dir: string

  constructor(dirOut: string) {
    this.dir = path.join(dirOut, "sessions")
  }

  async obtener(id: string): Promise<Sesion | null> {
    const archivo = this.ruta(id)
    if (!archivo || !existsSync(archivo)) return null
    try {
      const r = SesionSchema.safeParse(JSON.parse(await readFile(archivo, "utf8")))
      return r.success ? r.data : null
    } catch {
      return null
    }
  }

  async guardar(sesion: Sesion): Promise<void> {
    const archivo = this.ruta(sesion.id)
    if (!archivo) return
    await mkdir(this.dir, { recursive: true })
    await writeFile(archivo, JSON.stringify(sesion), "utf8")
  }

  private ruta(id: string): string | null {
    return ID_SESION.test(id) ? path.join(this.dir, `${id}.json`) : null
  }
}
