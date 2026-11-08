import { createHmac, timingSafeEqual } from "node:crypto"
import type { Mensaje } from "../llm/adapter"
import { recortarHistorial } from "./historial"
import { type Sesion, SesionSchema } from "./sesion"

const MAX_MENSAJES_ESTADO = 30
const MAX_CONTENIDO_HERRAMIENTA = 1_500

const firma = (datos: string, secreto: string): string => createHmac("sha256", secreto).update(datos).digest("base64url")

const compactar = (m: Mensaje): Mensaje =>
  m.rol === "tool" && m.contenido.length > MAX_CONTENIDO_HERRAMIENTA
    ? { ...m, contenido: `${m.contenido.slice(0, MAX_CONTENIDO_HERRAMIENTA)}…` }
    : m

/**
 * Serializa la sesión firmada con HMAC para que el front la devuelva en cada turno.
 * Permite reconstruir la sesión en una instancia serverless nueva sin base de datos;
 * la firma impide que el cliente altere la confirmación pendiente o el historial.
 */
export function firmarEstado(sesion: Sesion, secreto: string): string {
  const reducida: Sesion = { ...sesion, mensajes: recortarHistorial(sesion.mensajes, MAX_MENSAJES_ESTADO).map(compactar) }
  const datos = Buffer.from(JSON.stringify(reducida), "utf8").toString("base64url")
  return `${datos}.${firma(datos, secreto)}`
}

export function verificarEstado(token: string, secreto: string, sessionId: string): Sesion | null {
  const [datos, recibida] = token.split(".")
  if (!datos || !recibida) return null
  const esperada = Buffer.from(firma(datos, secreto))
  const dada = Buffer.from(recibida)
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null
  try {
    const r = SesionSchema.safeParse(JSON.parse(Buffer.from(datos, "base64url").toString("utf8")))
    return r.success && r.data.id === sessionId ? r.data : null
  } catch {
    return null
  }
}
