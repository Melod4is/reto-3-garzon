import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  type Aprobacion,
  type Cotizacion,
  CorreoSchema,
  describirErrores,
  type Paquete,
  PaqueteSchema,
  SolicitudSchema,
} from "./esquemas"
import { contieneAprobado, normalizarNit, parsearMonto, sumarDias } from "./normalizar"
import { type Resultado, fallo, mensajeDeError, ok } from "./resultado"
import { dirCaso, dirFixtures, esNombreCasoValido } from "./rutas"

const AprobacionArchivoSchema = z.object({
  de: z.string(),
  para: z.string(),
  fecha: z.string(),
  asunto: z.string(),
  cuerpo: z.string(),
})

type Lectura = { tipo: "ausente" } | { tipo: "error"; error: string } | { tipo: "ok"; contenido: string }

async function leerArchivo(dir: string, archivo: string): Promise<Lectura> {
  const ruta = path.join(dir, archivo)
  if (!existsSync(ruta)) return { tipo: "ausente" }
  try {
    return { tipo: "ok", contenido: await readFile(ruta, "utf8") }
  } catch (e) {
    return { tipo: "error", error: `${archivo}: ${mensajeDeError(e)}` }
  }
}

function parsearJson<T>(archivo: string, contenido: string, esquema: z.ZodType<T>): Resultado<T> {
  let crudo: unknown
  try {
    crudo = JSON.parse(contenido)
  } catch {
    return fallo(`${archivo} no es JSON válido. Pide al solicitante que reenvíe el adjunto.`)
  }
  const r = esquema.safeParse(crudo)
  return r.success ? ok(r.data) : fallo(`${archivo} tiene datos inválidos (${describirErrores(r.error)}). Pide al solicitante corregirlos.`)
}

const capturar = (texto: string, patron: RegExp): string | null => texto.match(patron)?.[1]?.trim() ?? null

export function parsearCotizacion(texto: string, monedaPorDefecto: string): Resultado<Cotizacion> {
  const lineaTotal = capturar(texto, /^TOTAL[^:\n]*:\s*(.+)$/m)
  const total = lineaTotal ? parsearMonto(lineaTotal) : null
  if (total === null) return fallo("La cotización no tiene un TOTAL legible. Pide al proveedor una cotización con el total.")
  const nit = capturar(texto, /^NIT:\s*(.+)$/m)
  const fecha = capturar(texto, /^Fecha:\s*(\d{4}-\d{2}-\d{2})/m)
  const diasValidez = capturar(texto, /^Validez[^:\n]*:\s*(\d+)\s*d[ií]as/im)
  return ok({
    referencia: capturar(texto, /^COTIZACI[OÓ]N\s+(\S+)/m),
    proveedor: capturar(texto, /^Proveedor:\s*(.+)$/m) ?? "",
    nit: nit ? normalizarNit(nit) : null,
    total,
    moneda: lineaTotal?.match(/\b(COP|USD)\b/)?.[1] ?? monedaPorDefecto,
    validez_hasta: fecha && diasValidez ? sumarDias(fecha, Number(diasValidez)) : null,
    items: [...texto.matchAll(/^\d+\.\s*(.+)$/gm)].map((m) => (m[1] ?? "").trim()),
    texto,
  })
}

export function parsearFactura(texto: string): Resultado<{ numero: string; fecha: string; total: number }> {
  const numero = capturar(texto, /No\.\s*(\S+)/)
  const fecha = capturar(texto, /Fecha de emisi[oó]n:\s*(\d{4}-\d{2}-\d{2})/i)
  const lineaTotal = capturar(texto, /^TOTAL:\s*(.+)$/m)
  const total = lineaTotal ? parsearMonto(lineaTotal) : null
  if (!numero || !fecha || total === null) return fallo("La factura no tiene número, fecha de emisión o total legibles.")
  return ok({ numero, fecha, total })
}

function aAprobacion(a: z.infer<typeof AprobacionArchivoSchema>): Aprobacion {
  return { de: a.de, para: a.para, fecha: a.fecha, asunto: a.asunto, aprobado: contieneAprobado(a.cuerpo), texto: a.cuerpo }
}

async function casosDisponibles(directory: string): Promise<string[]> {
  try {
    return (await readdir(path.join(dirFixtures(directory), "solicitudes"))).sort()
  } catch {
    return []
  }
}

/** Lee y normaliza el paquete de un caso. Adjuntos opcionales ausentes → null + `faltantes`. */
export async function leerPaquete(directory: string, caso: string): Promise<Resultado<Paquete>> {
  if (!esNombreCasoValido(caso)) return fallo(`Nombre de caso inválido: "${caso}".`)
  const dir = dirCaso(directory, caso)
  if (!existsSync(dir)) {
    const disponibles = (await casosDisponibles(directory)).join(", ")
    return fallo(`No existe el caso "${caso}". Casos disponibles: ${disponibles || "ninguno"}.`)
  }

  const [correoTxt, solicitudTxt, cotizacionTxt, aprobacionTxt, facturaTxt] = await Promise.all(
    ["correo.json", "solicitud.json", "cotizacion.txt", "aprobacion.json", "factura.txt"].map((a) => leerArchivo(dir, a)),
  ) as [Lectura, Lectura, Lectura, Lectura, Lectura]

  for (const [nombre, l] of [["correo.json", correoTxt], ["solicitud.json", solicitudTxt]] as const) {
    if (l.tipo === "ausente") return fallo(`Falta ${nombre} en el caso "${caso}". Pide al solicitante que reenvíe el correo completo.`)
    if (l.tipo === "error") return fallo(l.error)
  }
  if (correoTxt.tipo !== "ok" || solicitudTxt.tipo !== "ok") return fallo("Paquete incompleto.")

  const correo = parsearJson("correo.json", correoTxt.contenido, CorreoSchema.passthrough())
  if (!correo.ok) return correo
  const solicitud = parsearJson("solicitud.json", solicitudTxt.contenido, SolicitudSchema)
  if (!solicitud.ok) return solicitud

  const faltantes: string[] = []
  let cotizacion: Cotizacion | null = null
  if (cotizacionTxt.tipo === "ok") {
    const r = parsearCotizacion(cotizacionTxt.contenido, solicitud.data.moneda)
    if (!r.ok) return r
    cotizacion = r.data
  } else faltantes.push("cotizacion (cotizacion.pdf)")

  let aprobacion: Aprobacion | null = null
  if (aprobacionTxt.tipo === "ok") {
    const r = parsearJson("aprobacion.json", aprobacionTxt.contenido, AprobacionArchivoSchema)
    if (!r.ok) return r
    aprobacion = aAprobacion(r.data)
  } else faltantes.push("aprobacion (correo de aprobación del líder)")

  let factura: Paquete["factura"] = null
  if (facturaTxt.tipo === "ok") {
    const r = parsearFactura(facturaTxt.contenido)
    if (!r.ok) return r
    factura = r.data
  }

  const { id, de, asunto, fecha } = correo.data
  return ok(PaqueteSchema.parse({ correo: { id, de, asunto, fecha }, solicitud: solicitud.data, cotizacion, aprobacion, factura, faltantes }))
}

function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(",")}}`
  }
  return JSON.stringify(valor)
}

/**
 * Los documentos del caso son la fuente de verdad. Si el modelo envía un paquete,
 * debe coincidir con la fuente; así no puede "arreglar" montos entre herramientas.
 */
export async function resolverPaquete(directory: string, caso: string, recibido?: unknown): Promise<Resultado<Paquete>> {
  const fuente = await leerPaquete(directory, caso)
  if (!fuente.ok || recibido === undefined) return fuente
  const parseado = PaqueteSchema.safeParse(recibido)
  if (parseado.success && canonico(parseado.data) === canonico(fuente.data)) return fuente
  return fallo(`El paquete recibido no coincide con los documentos del caso "${caso}". Vuelve a llamar la herramienta solo con { caso }.`)
}
