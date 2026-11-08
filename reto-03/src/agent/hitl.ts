import { normalizarNombre } from "../lib/normalizar"
import type { ConfirmacionPendiente } from "./sesion"

export type Decision = "aprobar" | "rechazar"

const NEGATIVO = /\b(no|cancela|cancelar|cancelo|rechazo|rechaza|rechazar|detente|espera|todavia no|aun no)\b/
const AFIRMATIVO = /\b(si|confirmo|confirmado|confirma|apruebo|aprobado|adelante|procede|dale|de acuerdo|ok|okay|crearla|creala|hazlo)\b/

/**
 * Decisión humana sobre una confirmación pendiente. Un botón del front manda la decisión explícita;
 * el texto libre se interpreta de forma conservadora: ante cualquier negación, se rechaza.
 */
export function interpretarDecision(mensaje: string, explicita?: Decision): Decision | null {
  if (explicita) return explicita
  const texto = normalizarNombre(mensaje)
  if (NEGATIVO.test(texto)) return "rechazar"
  if (AFIRMATIVO.test(texto)) return "aprobar"
  return null
}

/** Nota para el modelo con la decisión tomada por el código; el modelo no decide la confirmación. */
export function notaDecision(pendiente: ConfirmacionPendiente, decision: Decision | null): string {
  const reglas = pendiente.codigos.join(", ")
  if (decision === "aprobar") {
    return `[Sistema] El usuario APROBÓ las excepciones (${reglas}) del caso ${pendiente.caso}. Puedes llamar oc_crear con confirmado=true para ese caso.`
  }
  if (decision === "rechazar") {
    return `[Sistema] El usuario RECHAZÓ las excepciones (${reglas}) del caso ${pendiente.caso}. No crees la OC; resume qué queda pendiente.`
  }
  return `[Sistema] Sigue pendiente la confirmación de ${reglas} para ${pendiente.caso}; no hay decisión explícita del usuario en este mensaje.`
}

export const preguntaConfirmacion = (p: ConfirmacionPendiente): string =>
  `¿Confirmas la creación de la OC del caso ${p.caso} con las excepciones ${p.codigos.join(", ")}? Responde "confirmo" o "cancelar".`
