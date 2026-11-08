import type { Decision, Pendiente } from "../tipos"
import { IconoAlerta } from "./Iconos"

type Props = { pendiente: Pendiente; deshabilitado: boolean; onDecidir: (d: Decision) => void }

/** Human-in-the-loop: la OC no se crea hasta que la analista decide aquí (o responde "confirmo"). */
export function ConfirmationBanner({ pendiente, deshabilitado, onDecidir }: Props) {
  const codigos = pendiente.codigos.filter(Boolean)
  return (
    <div className="banner" role="alert">
      <div className="banner-texto">
        <IconoAlerta tamano={18} />
        <div>
          <strong>Confirmación requerida · {pendiente.caso}</strong>
          <span>
            {codigos.length > 0 ? `Excepciones: ${codigos.join(", ")}. ` : ""}La OC no se crea hasta que decidas.
          </span>
        </div>
      </div>
      <div className="banner-acciones">
        <button type="button" className="secundario" disabled={deshabilitado} onClick={() => onDecidir("rechazar")}>
          Rechazar
        </button>
        <button type="button" className="primario" disabled={deshabilitado} onClick={() => onDecidir("aprobar")}>
          Aprobar y crear OC
        </button>
      </div>
    </div>
  )
}
