import { useEffect, useState } from "react"
import { parsear, resumirResultado } from "../resumen"
import type { ToolCall } from "../tipos"
import { IconoCheck, IconoChevron, IconoX } from "./Iconos"

export function duracion(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`
}

/** Argumentos en una línea: los escalares se muestran; los objetos grandes (paquete, payload) solo se nombran. */
function argumentosEnLinea(args: unknown): string {
  if (typeof args !== "object" || args === null) return ""
  return Object.entries(args)
    .map(([k, v]) => (typeof v === "object" && v !== null ? `${k}: {…}` : `${k}: ${JSON.stringify(v)}`))
    .join(", ")
}

function PasoHerramienta({ llamada }: { llamada: ToolCall }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <li className={`paso ${llamada.ok ? "" : "paso-error"}`}>
      <span className="paso-marca">{llamada.ok ? <IconoCheck tamano={12} /> : <IconoX tamano={12} />}</span>
      <div className="paso-cuerpo">
        <button type="button" className="paso-titulo" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
          <code>
            {llamada.nombre}({argumentosEnLinea(llamada.args)})
          </code>
          <span className="paso-resumen">{resumirResultado(llamada.nombre, llamada.resultado)}</span>
          <span className="paso-ms">{duracion(llamada.ms)}</span>
        </button>
        {abierto && (
          <div className="paso-detalle">
            <span>Argumentos</span>
            <pre>{JSON.stringify(llamada.args, null, 2)}</pre>
            <span>Resultado</span>
            <pre>{JSON.stringify(parsear(llamada.resultado), null, 2)}</pre>
          </div>
        )}
      </div>
    </li>
  )
}

type Props = { llamadas: ToolCall[]; duracionMs?: number }

/** Resumen plegable de las herramientas del turno, en gris y discreto (estilo "Ha pensado durante…"). */
export function ActividadHerramientas({ llamadas, duracionMs }: Props) {
  const [abierto, setAbierto] = useState(false)
  const fallidas = llamadas.filter((l) => !l.ok).length
  const cantidad = `${llamadas.length} ${llamadas.length === 1 ? "herramienta" : "herramientas"}`
  return (
    <div className="actividad">
      <button type="button" className="actividad-titulo" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <span>
          Usó {cantidad}
          {duracionMs !== undefined && ` · ${duracion(duracionMs)}`}
          {fallidas > 0 && ` · ${fallidas} con error`}
        </span>
        <IconoChevron tamano={16} className={abierto ? "girado" : ""} />
      </button>
      {abierto && (
        <ol className="actividad-pasos">
          {llamadas.map((l, i) => (
            <PasoHerramienta key={`${l.nombre}-${i}`} llamada={l} />
          ))}
        </ol>
      )}
    </div>
  )
}

/** Indicador mientras el agente trabaja; el backend no transmite por partes, así que se muestra el tiempo transcurrido. */
export function IndicadorPensando({ desde }: { desde: number }) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 250)
    return () => clearInterval(intervalo)
  }, [])
  const segundos = Math.max(0, Math.floor((ahora - desde) / 1000))
  return (
    <div className="actividad" aria-live="polite">
      <div className="actividad-titulo brillo">
        {segundos < 2 ? "Pensando…" : `Pensando durante ${segundos} s · consultando herramientas`}
      </div>
    </div>
  )
}
