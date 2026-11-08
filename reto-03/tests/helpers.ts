import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { z } from "zod"
import type { OrdenCompraSchema } from "../src/lib/esquemas"
import * as oc from "../src/tools/oc"

export const RAIZ = path.resolve(import.meta.dir, "..")

export type Ctx = { directory: string; sessionId: string }
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }
export type OrdenCompra = z.infer<typeof OrdenCompraSchema>
export type Hallazgo = { codigo: string; detalle: string; accion_sugerida: string; valores?: Record<string, unknown> }
export type Validacion = {
  apta: boolean
  bloqueos: Hallazgo[]
  confirmaciones: Hallazgo[]
  derivados: Record<string, { valor: string; fuente: string }>
  retroactiva: boolean
}
export type PaqueteLeido = {
  correo: { id: string; de: string; asunto: string; fecha: string }
  solicitud: Record<string, unknown>
  cotizacion: { proveedor: string; nit: string | null; total: number; moneda: string } | null
  aprobacion: { de: string; fecha: string; aprobado: boolean; texto: string } | null
  factura: { numero: string; fecha: string; total: number } | null
  faltantes: string[]
}

export type HerramientaLaxa = { execute: (args: never, ctx: Ctx) => Promise<string> }

export async function ejecutar<T>(h: HerramientaLaxa, args: Record<string, unknown>, ctx: Ctx): Promise<Resultado<T>> {
  const salida = await h.execute(args as never, ctx)
  if (typeof salida !== "string") throw new Error("execute debe devolver string JSON")
  return JSON.parse(salida) as Resultado<T>
}

export function datos<T>(r: Resultado<T>): T {
  if (!r.ok) throw new Error(`Se esperaba ok:true y llegó error: ${r.error}`)
  return r.data
}

export async function crearEntorno(): Promise<Ctx & { limpiar: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "reto03-"))
  await cp(path.join(RAIZ, "fixtures"), path.join(dir, "fixtures"), { recursive: true })
  return { directory: dir, sessionId: "test", limpiar: () => rm(dir, { recursive: true, force: true }) }
}

export function rutaCaso(ctx: Ctx, caso: string, archivo: string): string {
  return path.join(ctx.directory, "fixtures", "reto-03", "solicitudes", caso, archivo)
}

export async function leerControl(ctx: Ctx): Promise<{ encabezado: string; filas: Record<string, string>[] }> {
  const ruta = path.join(ctx.directory, "out", "control.csv")
  if (!existsSync(ruta)) return { encabezado: "", filas: [] }
  const [encabezado = "", ...lineas] = (await readFile(ruta, "utf8")).trim().split(/\r?\n/)
  const columnas = encabezado.split(",")
  const filas = lineas.map((l) => Object.fromEntries(l.split(",").map((v, i) => [columnas[i] ?? `c${i}`, v])))
  return { encabezado, filas }
}

export async function leerOrdenes(ctx: Ctx): Promise<{ numero_oc: string; orden: OrdenCompra }[]> {
  const ruta = path.join(ctx.directory, "out", "sap", "ordenes.jsonl")
  if (!existsSync(ruta)) return []
  return (await readFile(ruta, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { numero_oc: string; orden: OrdenCompra })
}

export const codigos = (hs: { codigo: string }[]): string[] => hs.map((h) => h.codigo)

/** Flujo completo sin modelo: leer → validar → evidencia → payload → crear. */
export async function procesar(ctx: Ctx, caso: string, confirmado?: boolean) {
  const paquete = datos(await ejecutar<PaqueteLeido>(oc.leer_paquete, { caso }, ctx))
  const validacion = datos(await ejecutar<Validacion>(oc.validar, { caso, paquete }, ctx))
  const evidencia = await ejecutar<{ ruta: string; sha256: string }>(oc.generar_evidencia, { caso }, ctx)
  const payload = await ejecutar<{ orden: OrdenCompra; trazabilidad: string; fuentes: Record<string, string> }>(
    oc.construir_payload,
    { caso, paquete, derivados: validacion.derivados },
    ctx,
  )
  const args: Record<string, unknown> = { caso, payload: payload.ok ? payload.data.orden : undefined }
  if (confirmado !== undefined) args.confirmado = confirmado
  const creacion = await ejecutar<{ numero_oc: string; fecha: string; idempotente: boolean }>(oc.crear, args, ctx)
  return { paquete, validacion, evidencia, payload, creacion }
}
