import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

const MAX_RESUMEN = 500
const CLAVE_SENSIBLE = /(_API_KEY|_SECRET|_TOKEN|ACCESS_KEY)$/

function valoresSensibles(): string[] {
  return Object.entries(process.env)
    .filter(([k, v]) => CLAVE_SENSIBLE.test(k) && typeof v === "string" && v.length >= 8)
    .map(([, v]) => v as string)
}

/** Reemplaza cualquier secreto del entorno por `***`. Se aplica a logs y a errores que llegan al chat. */
export function sanitizar(texto: string): string {
  return valoresSensibles().reduce((t, secreto) => t.split(secreto).join("***"), texto)
}

export const resumir = (texto: string): string => (texto.length > MAX_RESUMEN ? `${texto.slice(0, MAX_RESUMEN)}…` : texto)

export type EventoLog = { sessionId: string; tipo: string } & Record<string, unknown>

/** Traza ligera en `<dirOut>/log.jsonl` (CA4). Nunca debe tumbar el turno. */
export async function registrarEvento(dirOut: string, evento: EventoLog): Promise<void> {
  try {
    await mkdir(dirOut, { recursive: true })
    const linea = sanitizar(JSON.stringify({ ts: new Date().toISOString(), ...evento }))
    await appendFile(path.join(dirOut, "log.jsonl"), `${linea}\n`, "utf8")
  } catch {
    // La trazabilidad es best-effort: un disco lleno no debe impedir responder.
  }
}
