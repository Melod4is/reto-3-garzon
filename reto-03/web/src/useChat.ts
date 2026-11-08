import { useCallback, useEffect, useState } from "react"
import { ErrorApi, enviarChat } from "./api"
import type { Decision, MensajeChat, Pendiente } from "./tipos"

const CLAVE = "oc-sap-chat"

type Guardado = { sessionId: string; estado: string | null; mensajes: MensajeChat[]; pendiente: Pendiente | null }

const nuevaSesion = (): Guardado => ({ sessionId: crypto.randomUUID(), estado: null, mensajes: [], pendiente: null })

const mensajeValido = (m: MensajeChat): boolean =>
  typeof m?.id === "string" && typeof m.texto === "string" && (m.rol !== "assistant" || Array.isArray(m.toolCalls))

// Un estado guardado corrupto no debe dejar la app en blanco en cada recarga.
function cargar(): Guardado {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return nuevaSesion()
    const d = JSON.parse(crudo) as Guardado
    if (typeof d.sessionId !== "string" || !Array.isArray(d.mensajes)) return nuevaSesion()
    return { ...d, estado: d.estado ?? null, pendiente: d.pendiente ?? null, mensajes: d.mensajes.filter(mensajeValido) }
  } catch {
    return nuevaSesion()
  }
}

const id = () => crypto.randomUUID()

/** Estado del chat persistido en el navegador; el backend valida el estado firmado en cada turno. */
export function useChat(accessKey: string, onAccesoDenegado: () => void) {
  const [datos, setDatos] = useState<Guardado>(cargar)
  const [pensandoDesde, setPensandoDesde] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem(CLAVE, JSON.stringify(datos))
  }, [datos])

  const enviar = useCallback(
    async (envio: { message?: string; decision?: Decision; visible: string }) => {
      setDatos((d) => ({ ...d, mensajes: [...d.mensajes, { id: id(), rol: "user", texto: envio.visible }] }))
      const inicio = Date.now()
      setPensandoDesde(inicio)
      try {
        const r = await enviarChat({ sessionId: datos.sessionId, message: envio.message, decision: envio.decision, estado: datos.estado }, accessKey)
        const respuesta: MensajeChat = {
          id: id(),
          rol: "assistant",
          texto: r.reply,
          toolCalls: r.toolCalls,
          pideConfirmacion: r.needsConfirmation,
          duracionMs: Date.now() - inicio,
        }
        setDatos((d) => ({ ...d, estado: r.estado, pendiente: r.pendiente, mensajes: [...d.mensajes, respuesta] }))
      } catch (e) {
        if (e instanceof ErrorApi && e.status === 401) onAccesoDenegado()
        const texto = e instanceof Error ? e.message : "Error de red"
        setDatos((d) => ({ ...d, mensajes: [...d.mensajes, { id: id(), rol: "error", texto }] }))
      } finally {
        setPensandoDesde(null)
      }
    },
    [accessKey, datos.estado, datos.sessionId, onAccesoDenegado],
  )

  return {
    mensajes: datos.mensajes,
    pendiente: datos.pendiente,
    pensando: pensandoDesde !== null,
    pensandoDesde,
    enviarMensaje: (texto: string) => enviar({ message: texto, visible: texto }),
    decidir: (decision: Decision) =>
      enviar({ decision, visible: decision === "aprobar" ? "Apruebo las excepciones" : "Rechazo las excepciones" }),
    reiniciar: () => setDatos(nuevaSesion()),
  }
}
