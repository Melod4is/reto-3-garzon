import { useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { parsear } from "../resumen"
import type { MensajeChat, ToolCall } from "../tipos"
import { ActividadHerramientas, IndicadorPensando } from "./Actividad"
import { DescargaEvidencia } from "./DescargaEvidencia"
import { IconoAlerta } from "./Iconos"
import { type Orden, PayloadTabla } from "./PayloadTabla"

export const SUGERENCIAS = [
  { titulo: "Procesar sol-001", texto: "Procesa la solicitud sol-001 y crea la OC si todo está en orden." },
  {
    titulo: "Revisar sol-004 sin crear",
    texto: 'Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.',
  },
  { titulo: "¿Qué le falta a sol-002?", texto: "Procesa sol-002 y dime qué falta." },
  { titulo: "Analizar sol-005", texto: "¿Qué pasa con la solicitud sol-005?" },
]

function ultimaOrden(llamadas: ToolCall[]): Orden | undefined {
  const payload = [...llamadas].reverse().find((l) => l.nombre === "oc_construir_payload" && l.ok)
  return payload ? (parsear(payload.resultado).data?.orden as Orden | undefined) : undefined
}

/** OC creada en este turno (dato de `oc_crear`, no del texto del modelo). */
function ordenCreada(llamadas: ToolCall[]): { caso: string; numeroOc: string } | undefined {
  const creacion = [...llamadas].reverse().find((l) => l.nombre === "oc_crear" && l.ok)
  if (!creacion) return undefined
  const numero = parsear(creacion.resultado).data?.numero_oc
  const caso = (creacion.args as { caso?: unknown } | null)?.caso
  return typeof numero === "string" && typeof caso === "string" ? { caso, numeroOc: numero } : undefined
}

type Props = { mensajes: MensajeChat[]; pensandoDesde: number | null; onSugerencia: (texto: string) => void; accessKey: string }

export function MessageList({ mensajes, pensandoDesde, onSugerencia, accessKey }: Props) {
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [mensajes.length, pensandoDesde])

  if (mensajes.length === 0) {
    return (
      <div className="vacio">
        <h2>¿Qué solicitud procesamos hoy?</h2>
        <p>Leo el paquete, valido RC1–RC10 y te pido confirmación antes de crear una OC con excepciones.</p>
        <div className="sugerencias">
          {SUGERENCIAS.map((s) => (
            <button type="button" key={s.titulo} onClick={() => onSugerencia(s.texto)}>
              <strong>{s.titulo}</strong>
              <span>{s.texto}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mensajes">
      {mensajes.map((m) => {
        if (m.rol === "user") {
          return (
            <div key={m.id} className="mensaje usuario">
              <p>{m.texto}</p>
            </div>
          )
        }
        if (m.rol === "error") {
          return (
            <div key={m.id} className="mensaje error" role="alert">
              <IconoAlerta tamano={16} />
              <p>{m.texto}</p>
            </div>
          )
        }
        const llamadas = m.toolCalls ?? []
        const orden = ultimaOrden(llamadas)
        const creada = ordenCreada(llamadas)
        return (
          <div key={m.id} className="mensaje asistente">
            {llamadas.length > 0 && <ActividadHerramientas llamadas={llamadas} duracionMs={m.duracionMs} />}
            {orden && <PayloadTabla orden={orden} />}
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.texto}</ReactMarkdown>
            </div>
            {creada && <DescargaEvidencia caso={creada.caso} numeroOc={creada.numeroOc} accessKey={accessKey} />}
            {m.pideConfirmacion && (
              <span className="chip-confirmacion">
                <IconoAlerta tamano={14} /> Requiere tu confirmación
              </span>
            )}
          </div>
        )
      })}
      {pensandoDesde !== null && (
        <div className="mensaje asistente">
          <IndicadorPensando desde={pensandoDesde} />
        </div>
      )}
      <div ref={fin} />
    </div>
  )
}
