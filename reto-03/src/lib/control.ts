import { existsSync } from "node:fs"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

export type ResultadoControl = "creada" | "bloqueado" | "pendiente"

export type FilaControl = {
  solicitud_id: string
  resultado: ResultadoControl
  numero_oc: string | null
  retroactiva: boolean
  bloqueos: string[]
  confirmaciones: string[]
}

const ENCABEZADO = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts"

const celda = (valor: string): string => valor.replace(/[,\r\n]/g, " ")

/** Agrega una fila a `<dirOut>/control.csv` (log de control para auditoría). */
export async function registrarControl(dirOut: string, fila: FilaControl): Promise<void> {
  await mkdir(dirOut, { recursive: true })
  const archivo = path.join(dirOut, "control.csv")
  const linea = [
    fila.solicitud_id,
    fila.resultado,
    fila.numero_oc ?? "",
    String(fila.retroactiva),
    fila.bloqueos.join("|"),
    fila.confirmaciones.join("|"),
    new Date().toISOString(),
  ].map(celda).join(",")
  const prefijo = existsSync(archivo) ? "" : `${ENCABEZADO}\n`
  await appendFile(archivo, `${prefijo}${linea}\n`, "utf8")
}
