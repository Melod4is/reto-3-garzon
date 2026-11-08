import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { normalizarNit, normalizarNombre } from "./normalizar"
import { dirMaestros } from "./rutas"

const ProveedorSchema = z.object({
  codigo_sap: z.string(),
  nit: z.string(),
  nombre: z.string(),
  condiciones_pago_default: z.string(),
  indicador_iva_default: z.string(),
  activo: z.boolean(),
})

const AprobadorSchema = z.object({ email: z.string(), nombre: z.string(), tope: z.number() })

const CentroCostoSchema = z.object({
  centro_costo: z.string(),
  nombre: z.string(),
  subareas: z.array(z.string()),
  aprobadores: z.array(AprobadorSchema),
})

const IndicadorIvaSchema = z.object({ codigo: z.string(), descripcion: z.string(), tasa: z.number() })
const CondicionPagoSchema = z.object({ codigo: z.string(), descripcion: z.string(), dias: z.number() })

export type Proveedor = z.infer<typeof ProveedorSchema>
export type Aprobador = z.infer<typeof AprobadorSchema>
export type CentroCosto = z.infer<typeof CentroCostoSchema>

export type Maestros = {
  proveedores: Proveedor[]
  centros: CentroCosto[]
  indicadoresIva: z.infer<typeof IndicadorIvaSchema>[]
  condicionesPago: z.infer<typeof CondicionPagoSchema>[]
}

async function leerMaestro<T>(directory: string, archivo: string, esquema: z.ZodType<T>): Promise<T[]> {
  const contenido = await readFile(path.join(dirMaestros(directory), archivo), "utf8")
  return z.array(esquema).parse(JSON.parse(contenido))
}

/** Lanza si un maestro falta o es inválido; las herramientas traducen el error. */
export async function cargarMaestros(directory: string): Promise<Maestros> {
  const [proveedores, centros, indicadoresIva, condicionesPago] = await Promise.all([
    leerMaestro(directory, "proveedores.json", ProveedorSchema),
    leerMaestro(directory, "centros-costo.json", CentroCostoSchema),
    leerMaestro(directory, "indicadores-iva.json", IndicadorIvaSchema),
    leerMaestro(directory, "condiciones-pago.json", CondicionPagoSchema),
  ])
  return { proveedores, centros, indicadoresIva, condicionesPago }
}

/** Por NIT; si no hay NIT, por nombre normalizado. */
export function buscarProveedor(maestros: Maestros, nit: string | undefined, nombre: string): Proveedor | null {
  if (nit) return maestros.proveedores.find((p) => normalizarNit(p.nit) === normalizarNit(nit)) ?? null
  const buscado = normalizarNombre(nombre)
  return maestros.proveedores.find((p) => normalizarNombre(p.nombre) === buscado) ?? null
}

export const buscarCentro = (maestros: Maestros, centro: string): CentroCosto | null =>
  maestros.centros.find((c) => c.centro_costo === centro) ?? null
