import { Hono } from "hono"
import { z } from "zod"
import { verificarEstado, firmarEstado } from "./agent/estado-firmado"
import { ejecutarTurno } from "./agent/loop"
import { registrarEvento, sanitizar } from "./agent/log"
import { construirRegistro } from "./agent/registro"
import { ID_SESION, crearSesion, type Sesion } from "./agent/sesion"
import { ArchivoSesionStore, type SesionStore } from "./agent/store"
import { type Config, leerConfig } from "./config"
import { describirErrores } from "./lib/esquemas"
import { pdfEvidencia } from "./lib/evidencia"
import { leerPaquete } from "./lib/paquete"
import { mensajeDeError } from "./lib/resultado"
import { dirSalida, esNombreCasoValido } from "./lib/rutas"
import type { LlmAdapter } from "./llm/adapter"
import * as oc from "./tools/oc"

export type DepsApp = {
  llm: LlmAdapter
  directory: string
  proveedor: string
  modelo: string
  store?: SesionStore
  config?: Partial<Pick<Config, "maxIteraciones" | "maxTokensSesion" | "maxLongitudMensaje" | "accessKey" | "sessionSecret">>
}

const MENSAJE_POR_DECISION = { aprobar: "Apruebo las excepciones.", rechazar: "Rechazo las excepciones." } as const

function esquemaChat(maxLongitud: number) {
  return z
    .object({
      sessionId: z.string().regex(ID_SESION, "sessionId inválido (letras, números, - y _; máximo 64)"),
      message: z.string().max(maxLongitud, `El mensaje supera ${maxLongitud} caracteres`).optional(),
      decision: z.enum(["aprobar", "rechazar"]).optional(),
      estado: z.string().optional(),
    })
    .refine((b) => Boolean(b.message?.trim()) || b.decision !== undefined, { message: "Falta message o decision" })
}

const mismoFinal = (a: Sesion, b: Sesion): boolean =>
  JSON.stringify(a.mensajes.at(-1)) === JSON.stringify(b.mensajes.at(-1))

/** API HTTP (PRD 6.4). Solo orquesta: la lógica vive en el agente y las herramientas. */
export function crearApp(deps: DepsApp) {
  const config = { ...leerConfig(), ...deps.config }
  const store = deps.store ?? new ArchivoSesionStore(dirSalida(deps.directory))
  const herramientas = construirRegistro({ oc })
  const ChatSchema = esquemaChat(config.maxLongitudMensaje)
  const app = new Hono()

  app.use("/api/*", async (c, next) => {
    if (config.accessKey && c.req.path !== "/api/health" && c.req.header("x-access-key") !== config.accessKey) {
      return c.json({ error: "Clave de acceso inválida o ausente (header x-access-key)." }, 401)
    }
    await next()
  })

  app.get("/api/health", (c) => c.json({ ok: true, provider: deps.proveedor, model: deps.modelo }))

  // En serverless otra instancia pudo avanzar la conversación: si el token firmado (siempre el último que vio
  // el front) no termina igual que la copia local, la copia local está desactualizada.
  async function cargarSesion(id: string, estado?: string): Promise<Sesion> {
    const guardada = await store.obtener(id)
    const firmada = estado ? verificarEstado(estado, config.sessionSecret, id) : null
    if (guardada && (!firmada || mismoFinal(guardada, firmada))) return guardada
    return firmada ?? crearSesion(id)
  }

  app.post("/api/chat", async (c) => {
    const cuerpo: unknown = await c.req.json().catch(() => null)
    const parsed = ChatSchema.safeParse(cuerpo)
    if (!parsed.success) return c.json({ error: `Solicitud inválida: ${describirErrores(parsed.error)}` }, 400)

    const { sessionId, message, decision, estado } = parsed.data
    const sesion = await cargarSesion(sessionId, estado)
    const resultado = await ejecutarTurno({
      llm: deps.llm,
      herramientas,
      sesion,
      mensaje: message?.trim() || (decision ? MENSAJE_POR_DECISION[decision] : ""),
      ctx: { directory: deps.directory, sessionId },
      maxIteraciones: config.maxIteraciones,
      maxTokensSesion: config.maxTokensSesion,
      ...(decision ? { decision } : {}),
    })
    await store.guardar(sesion)
    return c.json({ ...resultado, pendiente: sesion.confirmacionPendiente, estado: firmarEstado(sesion, config.sessionSecret) })
  })

  app.get("/api/sessions/:id", async (c) => {
    const sesion = await store.obtener(c.req.param("id"))
    if (!sesion) return c.json({ error: "Sesión no encontrada en esta instancia." }, 404)
    return c.json(sesion)
  })

  app.get("/api/evidencia/:caso", async (c) => {
    const caso = c.req.param("caso")
    if (!esNombreCasoValido(caso)) return c.json({ error: "Nombre de caso inválido." }, 400)
    const paquete = await leerPaquete(deps.directory, caso)
    if (!paquete.ok) return c.json({ error: paquete.error }, 404)
    if (!paquete.data.aprobacion) return c.json({ error: `El caso ${caso} no tiene correo de aprobación.` }, 404)
    const { bytes, sha256 } = await pdfEvidencia(paquete.data.aprobacion)
    return c.body(bytes.slice().buffer, 200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="aprobacion-${caso}.pdf"`,
      "x-evidencia-sha256": sha256,
    })
  })

  app.notFound((c) => c.json({ error: "Ruta no encontrada." }, 404))

  app.onError(async (e, c) => {
    const detalle = sanitizar(mensajeDeError(e))
    await registrarEvento(dirSalida(deps.directory), { sessionId: "-", tipo: "error_http", error: detalle })
    return c.json({ error: "Error interno del servidor. La sesión no se perdió; intenta de nuevo." }, 500)
  })

  return app
}
