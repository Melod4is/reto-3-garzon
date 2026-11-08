import { useState } from "react"
import { descargarEvidencia } from "../api"
import { IconoDescarga } from "./Iconos"

type Props = { caso: string; numeroOc: string; accessKey: string }

/** HU-4: la evidencia de aprobación (PDF) que queda adjunta a la OC creada. */
export function DescargaEvidencia({ caso, numeroOc, accessKey }: Props) {
  const [estado, setEstado] = useState<"listo" | "descargando" | string>("listo")
  const descargar = async () => {
    setEstado("descargando")
    try {
      await descargarEvidencia(caso, accessKey)
      setEstado("listo")
    } catch (e) {
      setEstado(e instanceof Error ? e.message : "No se pudo descargar la evidencia")
    }
  }
  const error = estado !== "listo" && estado !== "descargando" ? estado : null
  return (
    <div className="evidencia">
      <button type="button" className="secundario" onClick={descargar} disabled={estado === "descargando"}>
        <IconoDescarga tamano={16} />
        {estado === "descargando" ? "Descargando…" : `Descargar evidencia de aprobación (PDF) · OC ${numeroOc}`}
      </button>
      {error && <span className="evidencia-error">{error}</span>}
    </div>
  )
}
