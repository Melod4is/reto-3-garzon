import type { Decision, Pendiente, RespuestaChat, Salud, ToolCall } from "./tipos"

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

// Un 504 de la plataforma o la página de login de Vercel (Deployment Protection) llegan como HTML/texto, no JSON.
async function pedir(ruta: string, accessKey: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(ruta, {
    ...init,
    headers: { "content-type": "application/json", ...(accessKey ? { "x-access-key": accessKey } : {}), ...init?.headers },
  })
  const cuerpo: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = esObjeto(cuerpo) && typeof cuerpo.error === "string" ? cuerpo.error : null
    const porEstado = res.status === 504 ? "El agente tardó demasiado en responder (timeout del servidor). Intenta de nuevo." : `Error HTTP ${res.status}`
    throw new ErrorApi(error ?? porEstado, res.status)
  }
  if (!esObjeto(cuerpo)) {
    throw new ErrorApi("El servidor devolvió una respuesta inesperada (¿el link exige iniciar sesión en Vercel?). Usa el dominio público del proyecto.", res.status)
  }
  return cuerpo
}

/** Descarga el PDF por fetch (no con un enlace) para poder enviar `x-access-key` cuando el link está protegido. */
export async function descargarEvidencia(caso: string, accessKey: string): Promise<void> {
  const res = await fetch(`/api/evidencia/${encodeURIComponent(caso)}`, {
    headers: accessKey ? { "x-access-key": accessKey } : {},
  })
  if (!res.ok || res.headers.get("content-type") !== "application/pdf") {
    const cuerpo: unknown = await res.json().catch(() => null)
    const error = esObjeto(cuerpo) && typeof cuerpo.error === "string" ? cuerpo.error : `No se pudo descargar la evidencia (HTTP ${res.status}).`
    throw new ErrorApi(error, res.status)
  }
  const url = URL.createObjectURL(await res.blob())
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = `aprobacion-${caso}.pdf`
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const consultarSalud = async (accessKey: string): Promise<Salud> => (await pedir("/api/health", accessKey)) as Salud

export type EnvioChat = { sessionId: string; message?: string; decision?: Decision; estado: string | null }

export async function enviarChat(envio: EnvioChat, accessKey: string): Promise<RespuestaChat> {
  const r = await pedir("/api/chat", accessKey, {
    method: "POST",
    body: JSON.stringify({ ...envio, estado: envio.estado ?? undefined }),
  })
  if (typeof r.reply !== "string" || !Array.isArray(r.toolCalls)) {
    throw new ErrorApi("La respuesta del agente llegó incompleta. Intenta de nuevo.", 200)
  }
  return {
    reply: r.reply,
    toolCalls: r.toolCalls as ToolCall[],
    needsConfirmation: r.needsConfirmation === true,
    pendiente: (r.pendiente ?? null) as Pendiente | null,
    estado: typeof r.estado === "string" ? r.estado : "",
  }
}
